/** In-process WS fan-out (same Node process). Used with Redis pub/sub for receipt events. */

type ConversationBroadcaster = (conversationId: string, data: string) => void;
type DoctorBroadcaster = (doctorUserId: string, data: string) => void;

let conversationBroadcaster: ConversationBroadcaster | null = null;
let doctorBroadcaster: DoctorBroadcaster | null = null;

export function registerConversationBroadcaster(fn: ConversationBroadcaster): void {
  conversationBroadcaster = fn;
}

export function registerDoctorBroadcaster(fn: DoctorBroadcaster): void {
  doctorBroadcaster = fn;
}

export function broadcastDoctorChatsUpdated(doctorUserId: string, data: string): void {
  doctorBroadcaster?.(doctorUserId, data);
}

export function broadcastConversationWsEvent(
  conversationId: string,
  type: string,
  payload: unknown
): void {
  conversationBroadcaster?.(conversationId, JSON.stringify({ type, payload }));
}
