import { conversationMessageComments, conversationMessages } from "@shared/schema";
import { parseVideoMessagePayload } from "@shared/videoMessagePayload";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";

const OBJECT_PATH_PREFIX = "/objects/";

type AttachmentSource = {
  imageUrl?: string | null;
  content?: string | null;
  messageType?: string | null;
};

export function collectMessageAttachmentPaths(source: AttachmentSource): string[] {
  const paths = new Set<string>();
  if (source.imageUrl?.startsWith(OBJECT_PATH_PREFIX)) {
    paths.add(source.imageUrl);
  }
  if (source.messageType === "video") {
    const posterUrl = parseVideoMessagePayload(source.content)?.posterUrl;
    if (posterUrl?.startsWith(OBJECT_PATH_PREFIX)) {
      paths.add(posterUrl);
    }
  }
  return [...paths];
}

export function collectCommentAttachmentPaths(source: {
  imageUrl?: string | null;
}): string[] {
  if (source.imageUrl?.startsWith(OBJECT_PATH_PREFIX)) {
    return [source.imageUrl];
  }
  return [];
}

async function countLiveAttachmentReferences(objectPath: string): Promise<number> {
  const posterPattern = `%"posterUrl":"${objectPath}"%`;

  const [messageRow] = await db
    .select({ value: count() })
    .from(conversationMessages)
    .where(
      and(
        isNull(conversationMessages.deletedAt),
        or(
          eq(conversationMessages.imageUrl, objectPath),
          sql`${conversationMessages.content} LIKE ${posterPattern}`
        )
      )
    );

  const [commentRow] = await db
    .select({ value: count() })
    .from(conversationMessageComments)
    .where(
      and(
        isNull(conversationMessageComments.deletedAt),
        eq(conversationMessageComments.imageUrl, objectPath)
      )
    );

  return Number(messageRow?.value ?? 0) + Number(commentRow?.value ?? 0);
}

export async function deleteAttachmentIfUnreferenced(objectPath: string): Promise<void> {
  if (!objectPath.startsWith(OBJECT_PATH_PREFIX)) return;
  const refs = await countLiveAttachmentReferences(objectPath);
  if (refs > 0) return;
  await new ObjectStorageService().deleteObjectByPath(objectPath);
}

export async function cleanupReplacedMessageAttachments(
  before: AttachmentSource,
  after: AttachmentSource
): Promise<void> {
  const oldPaths = collectMessageAttachmentPaths(before);
  const newPaths = new Set(collectMessageAttachmentPaths(after));
  for (const path of oldPaths) {
    if (newPaths.has(path)) continue;
    await deleteAttachmentIfUnreferenced(path);
  }
}

export async function cleanupMessageAttachments(source: AttachmentSource): Promise<void> {
  const paths = collectMessageAttachmentPaths(source);
  await Promise.all(paths.map((path) => deleteAttachmentIfUnreferenced(path)));
}

export async function cleanupCommentAttachments(source: {
  imageUrl?: string | null;
}): Promise<void> {
  const paths = collectCommentAttachmentPaths(source);
  await Promise.all(paths.map((path) => deleteAttachmentIfUnreferenced(path)));
}
