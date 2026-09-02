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

/** Best-effort image MIME from magic bytes (for objects stored as octet-stream). */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body && typeof body === "object" && "transformToByteArray" in body) {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
  throw new Error("Object body is not readable");
}

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
        const raw = downloadFilename.replace(/[\r\n"]/g, "_").trim().slice(0, 180);
        if (!raw) return undefined;
        // Node rejects non-ASCII in header values. Keep Unicode only in filename*.
        const asciiish = raw
          .replace(/[^\x20-\x7E]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^[\s._]+|[\s._]+$/g, "");
        const extMatch = raw.match(/\.([A-Za-z0-9]{1,8})$/);
        const asciiFallback =
          asciiish && /[A-Za-z0-9]/.test(asciiish)
            ? asciiish
            : extMatch
              ? `file.${extMatch[1]}`
              : "file";
        const encoded = encodeURIComponent(raw);
        const kind = disposition === "inline" ? "inline" : "attachment";
        return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
      })();

      const contentLength = response.ContentLength;
      // Bake EXIF orientation for images. Also try small octet-stream objects —
      // older chat uploads were stored without an image/* Content-Type.
      const tryOrient =
        !!response.Body &&
        !contentDisposition &&
        !rangeValue &&
        (contentType.startsWith("image/") ||
          ((contentType === "application/octet-stream" || !response.ContentType) &&
            contentLength != null &&
            contentLength > 0 &&
            contentLength <= 12 * 1024 * 1024));

      if (tryOrient) {
        try {
          const bytes = await bodyToBuffer(response.Body);
          const sniffed = sniffImageMime(bytes);
          if (contentType.startsWith("image/") || sniffed) {
            try {
              const { default: sharp } = await import("sharp");
              const out = await sharp(bytes).rotate().toBuffer();
              const outType =
                (contentType.startsWith("image/") ? contentType : null) ||
                sniffed ||
                "image/jpeg";
              res.set({
                "Content-Type": outType,
                "Cache-Control": `private, max-age=${cacheTtlSec}`,
                "Content-Length": String(out.length),
              });
              res.send(out);
              return;
            } catch (sharpErr) {
              console.error("Sharp orient error:", sharpErr);
              if (sniffed) {
                res.set({
                  "Content-Type": sniffed,
                  "Cache-Control": `private, max-age=${cacheTtlSec}`,
                  "Content-Length": String(bytes.length),
                });
                res.send(bytes);
                return;
              }
              if (contentType.startsWith("image/")) {
                if (!res.headersSent) {
                  res.status(500).json({ error: "Error processing image" });
                }
                return;
              }
            }
          }
          // Not an image (e.g. voice/pdf stored as octet-stream) — send raw.
          res.set({
            "Content-Type": contentType,
            "Accept-Ranges": "bytes",
            "Cache-Control": `private, max-age=${cacheTtlSec}`,
            "Content-Length": String(bytes.length),
          });
          res.send(bytes);
          return;
        } catch (bufErr) {
          console.error("Error buffering object for image pipeline:", bufErr);
          // Fall through to stream path below (re-fetch not available; 500).
          if (!res.headersSent) {
            res.status(500).json({ error: "Error downloading file" });
          }
          return;
        }
      }

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
   * Decodes by magic bytes when Content-Type is missing/wrong (older uploads).
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
      if (!response.Body) {
        res.status(404).end();
        return;
      }
      const bytes = await bodyToBuffer(response.Body);
      const contentType = response.ContentType || "application/octet-stream";
      const sniffed = sniffImageMime(bytes);
      if (!contentType.startsWith("image/") && !sniffed) {
        res.set({
          "Content-Type": contentType,
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
          "Content-Length": String(bytes.length),
        });
        res.send(bytes);
        return;
      }
      try {
        const { default: sharp } = await import("sharp");
        const out = await sharp(bytes)
          .rotate()
          .resize(128, 128, { fit: "cover", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        res.set({
          "Content-Type": "image/jpeg",
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
          "Content-Length": String(out.length),
        });
        res.send(out);
      } catch (sharpErr) {
        console.error("Sharp avatar resize error:", sharpErr);
        const fallbackType = sniffed || (contentType.startsWith("image/") ? contentType : null);
        if (fallbackType) {
          res.set({
            "Content-Type": fallbackType,
            "Cache-Control": `private, max-age=${cacheTtlSec}`,
            "Content-Length": String(bytes.length),
          });
          res.send(bytes);
          return;
        }
        if (!res.headersSent) res.status(500).json({ error: "Error resizing image" });
      }
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
   * Always emits image/jpeg when decodable — ignores wrong/missing Content-Type
   * so photo bubbles work for older octet-stream uploads.
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
      if (!response.Body) {
        res.status(404).end();
        return;
      }
      const bytes = await bodyToBuffer(response.Body);
      const contentType = response.ContentType || "application/octet-stream";
      const sniffed = sniffImageMime(bytes);

      try {
        const { default: sharp } = await import("sharp");
        const out = await sharp(bytes)
          .rotate()
          .resize(400, undefined, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        res.set({
          "Content-Type": "image/jpeg",
          "Cache-Control": `private, max-age=${cacheTtlSec}`,
          "Content-Length": String(out.length),
        });
        res.send(out);
        return;
      } catch (sharpErr) {
        console.error("Sharp resize error:", sharpErr);
        const fallbackType = sniffed || (contentType.startsWith("image/") ? contentType : null);
        if (fallbackType) {
          res.set({
            "Content-Type": fallbackType,
            "Cache-Control": `private, max-age=${cacheTtlSec}`,
            "Content-Length": String(bytes.length),
          });
          res.send(bytes);
          return;
        }
        if (!res.headersSent) {
          res.status(415).json({ error: "Not an image" });
        }
      }
    } catch (error) {
      console.error("Error downloading thumbnail:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
}
