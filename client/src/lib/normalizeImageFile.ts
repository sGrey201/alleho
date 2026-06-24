const MAX_AVATAR_DIMENSION = 2048;
const JPEG_QUALITY = 0.92;

/**
 * Bakes EXIF orientation into pixels so avatars display consistently everywhere.
 */
export async function normalizeImageFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
    });
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
