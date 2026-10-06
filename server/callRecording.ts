import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from "livekit-server-sdk";
import { getLiveKitApiHost } from "./livekitRoom";

const YC_ENDPOINT = "https://storage.yandexcloud.net";

export function callRecordingObjectKey(callId: string): string {
  return `call-recordings/${callId}.ogg`;
}

export function callRecordingObjectPath(callId: string): string {
  return `/objects/${callRecordingObjectKey(callId)}`;
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

function buildAudioFileOutput(callId: string): EncodedFileOutput {
  const accessKey = process.env.YC_ACCESS_KEY_ID?.trim();
  const secret = process.env.YC_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.YC_BUCKET?.trim();
  const region = process.env.YC_REGION?.trim() || "ru-central1";
  if (!accessKey || !secret || !bucket) {
    throw new Error("Object storage is not configured");
  }
  return new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath: callRecordingObjectKey(callId),
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey,
        secret,
        region,
        endpoint: YC_ENDPOINT,
        bucket,
        forcePathStyle: true,
      }),
    },
  });
}

/** Starts an audio-only room composite. Returns the LiveKit egress id. */
export async function startCallAudioEgress(callId: string): Promise<string> {
  const info = await getEgressClient().startRoomCompositeEgress(
    callId,
    buildAudioFileOutput(callId),
    { audioOnly: true }
  );
  if (!info.egressId) {
    throw new Error("LiveKit egress did not return an id");
  }
  return info.egressId;
}

export async function stopCallAudioEgress(egressId: string): Promise<void> {
  await getEgressClient().stopEgress(egressId);
}
