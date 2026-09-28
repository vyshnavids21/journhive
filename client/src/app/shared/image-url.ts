// Delivery helpers for uploaded photos (stored on Cloudinary at their original resolution).

const CLOUDINARY_UPLOAD = '/image/upload/';

/**
 * Serves a Cloudinary photo in the best format the browser supports (AVIF/WebP) at
 * near-lossless quality. `maxWidth` only ever shrinks (c_limit) — images are never upscaled.
 * Non-Cloudinary sources (local previews, data URLs) are returned unchanged.
 */
export function optimizedImageUrl(src: unknown, maxWidth?: number): string {
  if (!src || typeof src !== 'string') {
    return '';
  }
  if (!src.includes('res.cloudinary.com') || !src.includes(CLOUDINARY_UPLOAD)) {
    return src;
  }
  const transform = ['f_auto', 'q_auto:best'];
  if (maxWidth) {
    transform.push('c_limit', `w_${maxWidth}`);
  }
  return src.replace(CLOUDINARY_UPLOAD, `${CLOUDINARY_UPLOAD}${transform.join(',')}/`);
}

/** Reads an image's real pixel dimensions. */
export function readImageSize(src: string): Promise<{ width: number, height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });
}
