import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { resolveCallRecordingRole } from "./callRecording";
import { storage } from "./storage";
import type { Conversation, ConversationMessage, User } from "@shared/schema";

const VOICE_MESSAGES_PREFIX = "voice-messages";

function bucketName(): string {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) throw new Error("Object storage is not configured");
  return bucket;
}

function objectKeyFromAppPath(objectPath: string): string | null {
  if (!objectPath.startsWith("/objects/")) return null;
  const key = objectPath.slice("/objects/".length);
  if (!key || key.includes("..")) return null;
  return key;
}

type AudioFormat = { ext: string; codec: string; container: string; contentType: string };

function formatFromMime(mime: string): AudioFormat | null {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/ogg") return { ext: "ogg", codec: "opus", container: "ogg", contentType: "audio/ogg" };
  if (base === "audio/webm") return { ext: "webm", codec: "opus", container: "webm", contentType: "audio/webm" };
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a") {
    return { ext: "m4a", codec: "aac", container: "mp4", contentType: "audio/mp4" };
  }
  if (base === "audio/aac") return { ext: "aac", codec: "aac", container: "aac", contentType: "audio/aac" };
  return null;
}

function formatFromMagic(bytes: Uint8Array): AudioFormat {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { ext: "webm", codec: "opus", container: "webm", contentType: "audio/webm" };
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return { ext: "ogg", codec: "opus", container: "ogg", contentType: "audio/ogg" };
  }
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { ext: "m4a", codec: "aac", container: "mp4", contentType: "audio/mp4" };
  }
  return { ext: "webm", codec: "opus", container: "webm", contentType: "audio/webm" };
}

async function readHeader(bucket: string, key: string): Promise<Uint8Array> {
  const res = await objectStorageClient.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-15" })
  );
  if (!res.Body) return new Uint8Array();
  return await res.Body.transformToByteArray();
}

/**
 * Move a just-sent voice message from uploads/ into voice-messages/<messageId>/
 * and write a one-track manifest in the same shape as a call recording.
 * Role is practitioner (homeopath) or patient.
 */
export async function packageVoiceMessage(params: {
  message: ConversationMessage;
  conversation: Conversation;
  author: User | undefined;
  sourceObjectPath: string;
  durationSec: number;
}): Promise<ConversationMessage | null> {
  const sourceKey = objectKeyFromAppPath(params.sourceObjectPath);
  if (!sourceKey || !sourceKey.startsWith("uploads/")) return null;

  const bucket = bucketName();
  const head = await objectStorageClient.send(
    new HeadObjectCommand({ Bucket: bucket, Key: sourceKey })
  );
  const fromMime = formatFromMime(head.ContentType ?? "");
  const format = fromMime ?? formatFromMagic(await readHeader(bucket, sourceKey));

  const audioKey = `${VOICE_MESSAGES_PREFIX}/${params.message.id}/audio.${format.ext}`;
  await objectStorageClient.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodeURI(`${bucket}/${sourceKey}`),
      Key: audioKey,
      ContentType: format.contentType,
      MetadataDirective: "REPLACE",
    })
  );

  const endedAt = params.message.createdAt instanceof Date ? params.message.createdAt : new Date();
  const startedAt = new Date(endedAt.getTime() - Math.max(0, params.durationSec) * 1000);
  const role = resolveCallRecordingRole(params.author, params.conversation);
  const manifest = {
    version: 1,
    appointment_id: params.message.id,
    room: params.message.id,
    language: "ru",
    call_started_at: startedAt.toISOString(),
    consent: {
      practitioner: true,
      patient: params.conversation.type === "patient",
    },
    tracks: [
      {
        role,
        participant_identity: params.message.authorUserId,
        track_sid: params.message.id,
        file: audioKey,
        codec: format.codec,
        container: format.container,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_sec: params.durationSec,
        status: "done",
      },
    ],
    mute_events: [],
  };

  await objectStorageClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${VOICE_MESSAGES_PREFIX}/${params.message.id}/manifest.json`,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: "application/json",
    })
  );

  const updated = await storage.setConversationMessageImageUrl(
    params.message.id,
    `/objects/${audioKey}`
  );
  if (!updated) return null;

  try {
    await objectStorageClient.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey })
    );
  } catch (err) {
    console.error("[VoiceMessage] failed to delete source upload", {
      messageId: params.message.id,
      sourceKey,
      err,
    });
  }

  return updated;
}
