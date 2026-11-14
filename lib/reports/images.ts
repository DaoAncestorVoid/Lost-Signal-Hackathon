export const REPORT_IMAGE_BUCKET = "report-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const SIGNED_URL_SECONDS = 300;

const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ValidatedImage = {
  bytes: Uint8Array;
  contentType: keyof typeof imageTypes;
  extension: (typeof imageTypes)[keyof typeof imageTypes];
};

export async function validateImage(file: File): Promise<ValidatedImage | { error: string }> {
  if (!(file.type in imageTypes)) {
    return { error: "Image must be JPEG, PNG, or WebP" };
  }
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return { error: "Image must be between 1 byte and 5 MB" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const webp = bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (
    (file.type === "image/jpeg" && !jpeg) ||
    (file.type === "image/png" && !png) ||
    (file.type === "image/webp" && !webp)
  ) {
    return { error: "Image contents do not match its type" };
  }

  const contentType = file.type as keyof typeof imageTypes;
  return { bytes, contentType, extension: imageTypes[contentType] };
}

export function isReportImagePath(path: string, userId: string, reportId: string) {
  const parts = path.split("/");
  return parts.length === 3 &&
    parts[0] === userId &&
    parts[1] === reportId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/.test(parts[2]);
}
