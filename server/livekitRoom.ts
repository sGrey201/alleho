import { RoomServiceClient } from "livekit-server-sdk";

/** room name (call id) → connected participant count */
export type LiveKitRoomSnapshot = Map<string, number>;

let roomServiceClient: RoomServiceClient | null = null;

/**
 * HTTP host for LiveKit Server API (RoomService). Differs from LIVEKIT_URL
 * (WSS signaling for clients). In Docker use http://livekit:7880.
 */
export function getLiveKitApiHost(): string | null {
  const explicit = process.env.LIVEKIT_API_HOST?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const wss = process.env.LIVEKIT_URL?.trim();
  if (!wss) return null;

  try {
    const parsed = new URL(wss);
    const protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    const port = parsed.port || (protocol === "https:" ? "443" : "7880");
    return `${protocol}//${parsed.hostname}:${port}`;
  } catch {
    return null;
  }
}

function getRoomServiceClient(): RoomServiceClient | null {
  const host = getLiveKitApiHost();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!host || !apiKey || !apiSecret) return null;

  if (!roomServiceClient) {
    roomServiceClient = new RoomServiceClient(host, apiKey, apiSecret);
  }
  return roomServiceClient;
}

/** One listRooms call — used by periodic sweeps to avoid N+1 API requests. */
export async function fetchLiveKitRoomSnapshot(): Promise<LiveKitRoomSnapshot | null> {
  const client = getRoomServiceClient();
  if (!client) return null;

  try {
    const rooms = await client.listRooms();
    const snapshot: LiveKitRoomSnapshot = new Map();
    for (const room of rooms) {
      if (room.name) snapshot.set(room.name, room.numParticipants ?? 0);
    }
    return snapshot;
  } catch (err) {
    console.error("[LiveKit] listRooms error:", err);
    return null;
  }
}

/** Participant count for a single room; 0 if the room does not exist. */
export async function getLiveKitParticipantCount(roomName: string): Promise<number | null> {
  const client = getRoomServiceClient();
  if (!client) return null;

  try {
    const participants = await client.listParticipants(roomName);
    return participants.length;
  } catch (err: unknown) {
    const code = (err as { code?: string; status?: number })?.code;
    const status = (err as { status?: number })?.status;
    if (code === "not_found" || status === 404) return 0;
    console.error("[LiveKit] listParticipants error:", err);
    return null;
  }
}

export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  const client = getRoomServiceClient();
  if (!client) return;
  try {
    await client.deleteRoom(roomName);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "not_found") return;
    console.error("[LiveKit] deleteRoom error:", err);
  }
}
