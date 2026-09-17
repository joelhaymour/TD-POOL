/**
 * Browser-only. A phone screenshot is 2-4 MB of PNG; the reader sees at most
 * ~1,570 px on the long edge anyway, so it is redrawn as a JPEG at that size
 * before upload. Cuts the upload to a few hundred KB and the read to about
 * 1,500 image tokens.
 */
const MAX_EDGE = 1568;

export type ShrunkImage = { blob: Blob; mediaType: string };

export async function shrinkImage(file: Blob): Promise<ShrunkImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn't a picture"));
      el.src = url;
    });
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    if (scale === 1 && file.type === "image/jpeg" && file.size < 900_000) {
      return { blob: file, mediaType: file.type };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, mediaType: file.type };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    return blob ? { blob, mediaType: "image/jpeg" } : { blob: file, mediaType: file.type };
  } finally {
    URL.revokeObjectURL(url);
  }
}
