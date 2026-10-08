import {
  DirectFileOutput,
  EgressClient,
  EgressStatus,
  S3Upload,
  type EgressInfo,
} from "livekit-server-sdk";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { getLiveKitApiHost } from "./livekitRoom";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { storage } from "./storage";
import type {
  CallRecordingRole,
  Conversation,
  ConversationCall,
  ConversationCallRecordingTrack,
  User,
} from "@shared/schema";

const YC_ENDPOINT = "https://storage.yandexcloud.net";
const EGRESS_START_RETRY_MS = 10_000;

const trackEgressRetries = new Set<string>();

export function callRecordingTrackObjectKey(
  roomName: string,
  participantIdentity: string,
  trackSid: string
): string {
  return `call-recordings/${roomName}/${participantIdentity}/${trackSid}.ogg`;
}

export function callRecordingTrackObjectPath(
  roomName: string,
  participantIdentity: string,
  trackSid: string
): string {
  return `/objects/${callRecordingTrackObjectKey(roomName, participantIdentity, trackSid)}`;
}

export function callRecordingManifestObjectKey(roomName: string): string {
  return `call-recordings/${roomName}/manifest.json`;
}

export function callRecordingManifestObjectPath(roomName: string): string {
  return `/objects/${callRecordingManifestObjectKey(roomName)}`;
}

export function callRecordingZipObjectKey(roomName: string): string {
  return `call-recordings/${roomName}/recording.zip`;
}

export function callRecordingZipObjectPath(roomName: string): string {
  return `/objects/${callRecordingZipObjectKey(roomName)}`;
}

/** Chat attachment path for a finished call package (zip preferred). */
export function isCallRecordingDownloadPath(path: string | null | undefined): boolean {
  if (!path) return false;
  return path.endsWith(".zip") || path.endsWith(".ogg");
}

export function resolveCallRecordingRole(
  user: User | undefined,
  conv: Conversation | undefined | null,
  tokenMetadata?: string | null
): CallRecordingRole {
  const fromToken = parseRoleMetadata(tokenMetadata);
  if (fromToken) return fromToken;
  if (conv?.type === "patient") {
    return conv.patientUserId && user?.id === conv.patientUserId ? "patient" : "practitioner";
  }
  return user?.isAdmin ? "practitioner" : "patient";
}

function parseRoleMetadata(raw: string | null | undefined): CallRecordingRole | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { role?: string };
    if (parsed.role === "practitioner" || parsed.role === "patient") return parsed.role;
  } catch {
    // ignore
  }
  return null;
}

function getEgressClient(): EgressClient {
  const host = getLiveKitApiHost();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!host || !apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured");
  }
  return new EgressClient(host, apiKey, apiSecret);
}

function getS3Upload(): S3Upload {
  const accessKey = process.env.YC_ACCESS_KEY_ID?.trim();
  const secret = process.env.YC_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.YC_BUCKET?.trim();
  const region = process.env.YC_REGION?.trim() || "ru-central1";
  if (!accessKey || !secret || !bucket) {
    throw new Error("Object storage is not configured");
  }
  return new S3Upload({
    accessKey,
    secret,
    region,
    endpoint: YC_ENDPOINT,
    bucket,
    forcePathStyle: true,
  });
}

function buildTrackFileOutput(
  roomName: string,
  participantIdentity: string,
  trackSid: string
): DirectFileOutput {
  return new DirectFileOutput({
    filepath: callRecordingTrackObjectKey(roomName, participantIdentity, trackSid),
    output: {
      case: "s3",
      value: getS3Upload(),
    },
  });
}

export async function startTrackAudioEgress(
  roomName: string,
  trackSid: string,
  participantIdentity: string
): Promise<string> {
  const info = await getEgressClient().startTrackEgress(
    roomName,
    buildTrackFileOutput(roomName, participantIdentity, trackSid),
    trackSid
  );
  if (!info.egressId) {
    throw new Error("LiveKit egress did not return an id");
  }
  return info.egressId;
}

export async function stopCallAudioEgress(egressId: string): Promise<void> {
  await getEgressClient().stopEgress(egressId);
}

export function dateFromLiveKitTime(value: unknown): Date | null {
  if (value == null) return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e15) return new Date(n / 1e6);
  if (n > 1e12) return new Date(n);
  return new Date(n * 1000);
}

function durationSecFromTrack(
  track: ConversationCallRecordingTrack,
  info?: EgressInfo
): number {
  const fileDuration = info?.fileResults?.[0]?.duration;
  const durationNum =
    typeof fileDuration === "bigint" ? Number(fileDuration) : Number(fileDuration);
  if (Number.isFinite(durationNum) && durationNum > 0) {
    return durationNum > 1e6 ? durationNum / 1e9 : durationNum;
  }
  if (track.startedAt && track.endedAt) {
    return Math.max(0, (track.endedAt.getTime() - track.startedAt.getTime()) / 1000);
  }
  return 0;
}

async function headObjectSize(key: string): Promise<number | null> {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) return null;
  try {
    const head = await objectStorageClient.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key })
    );
    return head.ContentLength ?? 0;
  } catch {
    return null;
  }
}

async function putManifestJson(roomName: string, body: unknown): Promise<void> {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) throw new Error("Object storage is not configured");
  await objectStorageClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: callRecordingManifestObjectKey(roomName),
      Body: JSON.stringify(body, null, 2),
      ContentType: "application/json",
    })
  );
}

async function getObjectBytes(key: string): Promise<Uint8Array | null> {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) return null;
  try {
    const res = await objectStorageClient.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    if (!res.Body) return null;
    return await res.Body.transformToByteArray();
  } catch {
    return null;
  }
}

async function putRecordingZip(roomName: string, body: Buffer): Promise<void> {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) throw new Error("Object storage is not configured");
  await objectStorageClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: callRecordingZipObjectKey(roomName),
      Body: body,
      ContentType: "application/zip",
    })
  );
}

function zipEntryNameForTrack(track: {
  role: string;
  participantIdentity: string;
  trackSid: string;
}): string {
  const identity = track.participantIdentity.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
  const sid = track.trackSid.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(-12);
  return `tracks/${track.role}_${identity}_${sid}.ogg`;
}

async function buildAndUploadRecordingZip(
  roomName: string,
  manifest: unknown,
  tracks: ConversationCallRecordingTrack[]
): Promise<string> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  for (const track of tracks) {
    if (track.status !== "done") continue;
    const key = callRecordingTrackObjectKey(
      track.roomName,
      track.participantIdentity,
      track.trackSid
    );
    const bytes = await getObjectBytes(key);
    if (!bytes || bytes.byteLength === 0) continue;
    zip.file(
      zipEntryNameForTrack({
        role: track.role,
        participantIdentity: track.participantIdentity,
        trackSid: track.trackSid,
      }),
      bytes
    );
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  await putRecordingZip(roomName, buffer);
  return callRecordingZipObjectPath(roomName);
}

export async function startMicrophoneTrackRecording(params: {
  call: ConversationCall;
  conv: Conversation;
  trackSid: string;
  participantIdentity: string;
  participantMetadata?: string | null;
}): Promise<void> {
  const { call, conv, trackSid, participantIdentity, participantMetadata } = params;
  const user = await storage.getUser(participantIdentity);
  const role = resolveCallRecordingRole(user, conv, participantMetadata);
  const filePath = callRecordingTrackObjectPath(call.id, participantIdentity, trackSid);

  const inserted = await storage.insertCallRecordingTrack({
    callId: call.id,
    roomName: call.id,
    participantIdentity,
    role,
    trackSid,
    filePath,
  });
  if (!inserted) return;

  await storage.claimCallRecording(call.id);

  try {
    const egressId = await startTrackAudioEgress(call.id, trackSid, participantIdentity);
    await storage.updateCallRecordingTrack(inserted.id, { egressId });
  } catch (err) {
    console.error("[VoiceCall] track egress start error:", err);
  }

  scheduleTrackEgressRetry(inserted.id, call.id, trackSid, participantIdentity);
}

function scheduleTrackEgressRetry(
  trackRowId: string,
  callId: string,
  trackSid: string,
  participantIdentity: string
): void {
  const key = `${callId}:${trackSid}`;
  setTimeout(() => {
    void retryTrackEgressIfNeeded(trackRowId, callId, trackSid, participantIdentity, key);
  }, EGRESS_START_RETRY_MS);
}

async function retryTrackEgressIfNeeded(
  trackRowId: string,
  callId: string,
  trackSid: string,
  participantIdentity: string,
  retryKey: string
): Promise<void> {
  const track = await storage.getCallRecordingTrackBySid(callId, trackSid);
  if (!track || track.id !== trackRowId) return;
  if (track.status !== "recording" || track.egressId) return;
  if (trackEgressRetries.has(retryKey)) {
    console.error("[VoiceCall] recording alert: track egress did not start", {
      callId,
      trackSid,
    });
    await storage.updateCallRecordingTrack(trackRowId, { status: "failed" });
    return;
  }
  trackEgressRetries.add(retryKey);
  try {
    const egressId = await startTrackAudioEgress(callId, trackSid, participantIdentity);
    await storage.updateCallRecordingTrack(trackRowId, { egressId });
  } catch (err) {
    console.error("[VoiceCall] recording alert: track egress retry failed", {
      callId,
      trackSid,
      err,
    });
    await storage.updateCallRecordingTrack(trackRowId, { status: "failed" });
  }
}

export async function markTrackEgressStarted(info: EgressInfo): Promise<void> {
  if (!info.egressId) return;
  const track = await storage.getCallRecordingTrackByEgressId(info.egressId);
  if (!track || track.startedAt) return;
  const startedAt = dateFromLiveKitTime(info.startedAt) ?? new Date();
  await storage.updateCallRecordingTrack(track.id, { startedAt });
}

export async function markTrackEgressEnded(info: EgressInfo): Promise<ConversationCall | undefined> {
  if (!info.egressId) return;
  const track = await storage.getCallRecordingTrackByEgressId(info.egressId);
  if (!track) return;

  const endedAt = dateFromLiveKitTime(info.endedAt) ?? new Date();
  const startedAt = track.startedAt ?? dateFromLiveKitTime(info.startedAt);
  const failed =
    info.status === EgressStatus.EGRESS_FAILED ||
    info.status === EgressStatus.EGRESS_ABORTED ||
    info.status === EgressStatus.EGRESS_LIMIT_REACHED;

  if (failed) {
    console.error("[VoiceCall] recording alert: track egress failed", {
      callId: track.callId,
      trackSid: track.trackSid,
      egressId: info.egressId,
      status: info.status,
    });
    await storage.updateCallRecordingTrack(track.id, {
      status: "failed",
      endedAt,
      ...(startedAt && !track.startedAt ? { startedAt } : {}),
    });
  } else {
    await storage.updateCallRecordingTrack(track.id, {
      status: "done",
      endedAt,
      ...(startedAt && !track.startedAt ? { startedAt } : {}),
    });
  }

  return storage.getCallById(track.callId);
}

export async function tryBuildCallRecordingPackage(callId: string): Promise<void> {
  const call = await storage.getCallById(callId);
  if (!call) return;
  if (call.status !== "ended" && call.status !== "cancelled") return;
  if (!call.startedAt) return;
  if (
    call.recordingStatus === "ready_for_transcription" ||
    call.recordingStatus === "ready" ||
    call.recordingStatus === "skipped"
  ) {
    return;
  }

  const tracks = await storage.getCallRecordingTracks(callId);
  if (tracks.length === 0) return;
  if (tracks.some((t) => t.status === "recording")) return;

  try {
    const conv = await storage.getConversation(call.conversationId);
    const manifestTracks = [];
    for (const track of tracks) {
      const key = callRecordingTrackObjectKey(
        track.roomName,
        track.participantIdentity,
        track.trackSid
      );
      const size = track.status === "done" ? await headObjectSize(key) : null;
      const ok = track.status === "done" && size != null && size > 0;
      if (track.status === "done" && !ok) {
        await storage.updateCallRecordingTrack(track.id, { status: "failed" });
      }
      const durationSec = ok ? Number(durationSecFromTrack(track).toFixed(1)) : 0;
      manifestTracks.push({
        role: track.role,
        participant_identity: track.participantIdentity,
        track_sid: track.trackSid,
        file: key,
        codec: "opus",
        container: "ogg",
        started_at: track.startedAt?.toISOString() ?? null,
        ended_at: track.endedAt?.toISOString() ?? null,
        duration_sec: durationSec,
        status: ok ? "done" : "failed",
      });
    }

    const manifest = {
      version: 1,
      appointment_id: call.id,
      room: call.id,
      language: "ru",
      call_started_at: call.startedAt.toISOString(),
      consent: { practitioner: true, patient: conv?.type === "patient" },
      tracks: manifestTracks,
      mute_events: [],
    };
    await putManifestJson(call.id, manifest);
    const zipPath = await buildAndUploadRecordingZip(call.id, manifest, tracks);
    const updated = await storage.setCallRecordingStatus(
      call.id,
      "ready_for_transcription",
      zipPath
    );
    const messageId = updated?.recordingMessageId ?? call.recordingMessageId;
    if (messageId) {
      const { attachCallRecordingToChatMessage } = await import("./voiceCall");
      await attachCallRecordingToChatMessage(messageId, call.conversationId, zipPath);
    }
  } catch (err) {
    console.error("[VoiceCall] recording alert: package_failed", { callId, err });
    await storage.setCallRecordingStatus(call.id, "package_failed");
  }
}
