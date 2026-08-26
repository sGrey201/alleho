import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Response } from "express";
import { randomUUID } from "crypto";

const YC_ENDPOINT = "https://storage.yandexcloud.net";

function getS3Config() {
  const bucket = process.env.YC_BUCKET;
  const region = process.env.YC_REGION;
  const accessKeyId = process.env.YC_ACCESS_KEY_ID;
  const secretAccessKey = process.env.YC_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "YC_BUCKET, YC_REGION, YC_ACCESS_KEY_ID and YC_SECRET_ACCESS_KEY must be set for object storage"
    );
  }
  return { bucket, region, accessKeyId, secretAccessKey };
}

export const objectStorageClient = new S3Client({
  endpoint: YC_ENDPOINT,
  region: process.env.YC_REGION || "ru-central1",
  credentials: process.env.YC_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.YC_ACCESS_KEY_ID,
        secretAccessKey: process.env.YC_SECRET_ACCESS_KEY!,
      }
    : undefined,
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/** Internal ref for S3 object (bucket + key). */
export interface S3ObjectRef {
  bucket: string;
  key: string;
}

const UPLOADS_PREFIX = "uploads";

export class ObjectStorageService {
  private bucket: string;
  private client: S3Client;

  constructor() {
    const config = getS3Config();
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: YC_ENDPOINT,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Without this, SDK adds x-amz-checksum-* to presigned URL; client doesn't send them → AccessDenied
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  /**
   * Returns presigned PUT URL for uploading.
   * Path-style URL (storage.yandexcloud.net/bucket/key) for Yandex compatibility.
   * No ContentType in signature so client can send Content-Type: application/octet-stream freely.
   */
  async getObjectEntityUploadURL(_contentType?: string): Promise<string> {
    const objectId = randomUUID();
    const key = `${UPLOADS_PREFIX}/${objectId}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const uploadURL = await getSignedUrl(this.client, command, { expiresIn: 900 });
    const hasChecksumInUrl = uploadURL.includes("x-amz-checksum") || uploadURL.includes("x-amz-sdk");
    if (hasChecksumInUrl) {
      console.warn("[objectStorage] Presigned URL contains checksum/sdk params — browser PUT may get 403. Params:", new URL(uploadURL).searchParams.toString().slice(0, 200));
    }
    return uploadURL;
  }

  /**
   * From request path /objects/uploads/<id> resolve to S3 ref.
   */
  async getObjectEntityFile(objectPath: string): Promise<S3ObjectRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const suffix = objectPath.slice("/objects/".length);
    if (!suffix) {
      throw new ObjectNotFoundError();
    }
    const key = suffix;
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
    } catch {
      throw new ObjectNotFoundError();
    }
    return { bucket: this.bucket, key };
  }

  /**
   * Normalize presigned or storage URL to app path /objects/uploads/<id>.
   * Handles: https://storage.yandexcloud.net/bucket/key (path-style)
   * and https://bucket.storage.yandexcloud.net/key (virtual-hosted).
   */
  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://") || !rawPath.includes("storage.yandexcloud.net")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const pathname = url.pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length < 1) {
      return rawPath;
    }
    // Path-style: /bucket/uploads/uuid → key = uploads/uuid
    // Virtual-hosted: /uploads/uuid → key = uploads/uuid
    const key = parts[0] === this.bucket && parts.length > 1
      ? parts.slice(1).join("/")
      : pathname.replace(/^\//, "");
    return `/objects/${key}`;
  }

  /**
   * Stream S3 object to HTTP response.
   * Supports `Range` so desktop browsers can seek audio/video.
   */
  async downloadObject(
    ref: S3ObjectRef,
    res: Response,
    cacheTtlSec: number = 3600,
    rangeHeader?: string,
    downloadFilename?: string,
    disposition: "inline" | "attachment" = "attachment"
  ): Promise<void> {
    try {
      const rangeValue =
        typeof rangeHeader === "string" && /^bytes=/i.test(rangeHeader.trim())
          ? rangeHeader.trim().split(",")[0]!.trim()
          : undefined;

      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: ref.bucket,
          Key: ref.key,
          ...(rangeValue ? { Range: rangeValue } : {}),
        })
      );
      const contentType =
        response.ContentType || "application/octet-stream";

      const contentDisposition = (() => {
        if (!downloadFilename) return undefined;
        const safe = downloadFilename.replace(/[\r\n"]/g, "_").slice(0, 180);
        if (!safe) return undefined;
        const encoded = encodeURIComponent(safe);
        const kind = disposition === "inline" ? "inline" : "attachment";
        return `${kind}; filename="${safe}"; filename*=UTF-8''${encoded}`;
      })();

      if (contentType.startsWith("image/") && response.Body && !contentDisposition) {
        const { default: sharp } = await import("sharp");
        res.set({
          "Content-Type": contentType,
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
        });
        const pipeline = sharp()
          .rotate()
          .on("error", (err: Error) => {
            console.error("Sharp orient error:", err);
            if (!res.headersSent) res.status(500).json({ error: "Error processing image" });
          });
        const bodyStream = response.Body as NodeJS.ReadableStream;
        bodyStream.pipe(pipeline).pipe(res);
        return;
      }

      const contentLength = response.ContentLength;
      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      };
      if (contentDisposition) {
        headers["Content-Disposition"] = contentDisposition;
      }
      if (contentLength != null) {
        headers["Content-Length"] = String(contentLength);
      }
      if (response.ContentRange) {
        headers["Content-Range"] = response.ContentRange;
        res.status(206);
      }
      res.set(headers);
      if (response.Body && typeof (response.Body as NodeJS.ReadableStream).pipe === "function") {
        (response.Body as NodeJS.ReadableStream).pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name === "InvalidRange"
          ? 416
          : 500;
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(statusCode).json({
          error: statusCode === 416 ? "Range not satisfiable" : "Error downloading file",
        });
      }
    }
  }

  /**
   * Stream S3 object as small square avatar (128×128) for chat list / header circles.
   * Non-image content-types are streamed as-is (no resize).
   */
  async downloadObjectAsAvatar(
    ref: S3ObjectRef,
    res: Response,
    cacheTtlSec: number = 3600
  ): Promise<void> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key })
      );
      const contentType = response.ContentType || "application/octet-stream";
      if (!contentType.startsWith("image/")) {
        return this.downloadObject(ref, res, cacheTtlSec);
      }
      if (!response.Body) {
        res.status(404).end();
        return;
      }
      const { default: sharp } = await import("sharp");
      res.set({
        "Content-Type": contentType,
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });
      const pipeline = sharp()
        .rotate()
        .resize(128, 128, { fit: "cover", withoutEnlargement: true })
        .on("error", (err: Error) => {
          console.error("Sharp avatar resize error:", err);
          if (!res.headersSent) res.status(500).json({ error: "Error resizing image" });
        });
      const bodyStream = response.Body as NodeJS.ReadableStream;
      bodyStream.pipe(pipeline).pipe(res);
    } catch (error) {
      console.error("Error downloading avatar thumbnail:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  /**
   * Delete S3 object by app path (/objects/uploads/<id>).
   * No-op for invalid paths; ignores missing objects.
   */
  async deleteObjectByPath(objectPath: string): Promise<void> {
    if (!objectPath.startsWith("/objects/")) return;
    const key = objectPath.slice("/objects/".length);
    if (!key) return;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      );
    } catch (error) {
      console.error("[objectStorage] deleteObjectByPath failed:", objectPath, error);
    }
  }

  /**
   * Stream S3 object as thumbnail (max width 400px) for chat preview.
   * Non-image content-types are streamed as-is (no resize).
   */
  async downloadObjectAsThumb(
    ref: S3ObjectRef,
    res: Response,
    cacheTtlSec: number = 3600
  ): Promise<void> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key })
      );
      const contentType = response.ContentType || "application/octet-stream";
      if (!contentType.startsWith("image/")) {
        return this.downloadObject(ref, res, cacheTtlSec);
      }
      if (!response.Body) {
        res.status(404).end();
        return;
      }
      const { default: sharp } = await import("sharp");
      res.set({
        "Content-Type": contentType,
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });
      const pipeline = sharp()
        .resize(400, undefined, { withoutEnlargement: true })
        .on("error", (err: Error) => {
          console.error("Sharp resize error:", err);
          if (!res.headersSent) res.status(500).json({ error: "Error resizing image" });
        });
      const bodyStream = response.Body as NodeJS.ReadableStream;
      bodyStream.pipe(pipeline).pipe(res);
    } catch (error) {
      console.error("Error downloading thumbnail:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
}
