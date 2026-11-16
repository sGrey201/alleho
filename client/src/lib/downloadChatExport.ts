export async function downloadChatExport(conversationId: string): Promise<number> {
  const res = await fetch(`/api/conversations/${conversationId}/export`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  const missingRaw = Number(res.headers.get("X-Missing-Transcripts") ?? "0");
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : "chat-export.zip";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return Number.isFinite(missingRaw) && missingRaw > 0 ? missingRaw : 0;
}
