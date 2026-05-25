export type MessageReceiptStatus = "sent" | "read";

export function getMessageReceiptStatus(params: {
  createdAt: string;
  peerLastReadAt?: string | null;
}): MessageReceiptStatus {
  const created = new Date(params.createdAt).getTime();
  const peerRead = params.peerLastReadAt ? new Date(params.peerLastReadAt).getTime() : null;
  if (peerRead != null && !Number.isNaN(peerRead) && peerRead >= created) {
    return "read";
  }
  return "sent";
}
