// Client side shrink for the Send Feedback photo (send-feedback-plan.md, 4.5).
// Saves mobile data and keeps the upload under the endpoint's cap. The server
// re-processes the file anyway, because the browser cannot be trusted.
export const PICK_MAX_BYTES = 10_000_000; // largest file the chooser accepts
export const UPLOAD_MAX_BYTES = 2_500_000; // after shrinking, under the 3 MB endpoint cap
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const SIDE = 1280;

export type ImageProblem = "image_type" | "too_large";

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Returns the smaller file, or the reason it cannot be used.
export async function shrinkImage(file: File): Promise<{ file: File } | { problem: ImageProblem }> {
  if (!ACCEPTED_TYPES.includes(file.type)) return { problem: "image_type" };
  if (file.size > PICK_MAX_BYTES) return { problem: "too_large" };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { problem: "image_type" };
  }
  try {
    const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { problem: "image_type" };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // WebP where the browser can encode it, else JPEG (a PNG fallback is bigger).
    let blob = await encode(canvas, "image/webp", 0.78);
    if (blob?.type !== "image/webp") {
      // JPEG has no alpha, so put white behind transparent pixels first.
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      blob = await encode(canvas, "image/jpeg", 0.8);
    }
    if (!blob) return { problem: "image_type" };
    if (blob.size > UPLOAD_MAX_BYTES) return { problem: "too_large" };

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return { file: new File([blob], `feedback.${ext}`, { type: blob.type }) };
  } finally {
    bitmap.close();
  }
}
