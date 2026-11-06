/**
 * Pixel size of an image at build time, for PhotoSwipe's data-pswp-width/-height:
 *   const size = await imageSize('/media/2023/05/hall.jpg');   // file in public/
 *   <a href={src} data-pswp-width={size?.width} data-pswp-height={size?.height}>…</a>
 * Images imported from src/assets already carry width and height. Returns undefined for remote
 * URLs and missing files (the lightbox then measures in the browser).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { imageMetadata } from 'astro/assets/utils';

const cache = new Map<string, Promise<{ width: number; height: number } | undefined>>();

export function imageSize(src: string): Promise<{ width: number; height: number } | undefined> {
  if (!src.startsWith('/') || src.startsWith('//')) return Promise.resolve(undefined);
  if (!cache.has(src)) {
    const file = path.join(process.cwd(), 'public', decodeURI(src.split(/[?#]/)[0]));
    cache.set(
      src,
      readFile(file)
        .then((data) => imageMetadata(new Uint8Array(data), src))
        .then((meta) => (meta.width && meta.height ? { width: meta.width, height: meta.height } : undefined))
        .catch(() => undefined),
    );
  }
  return cache.get(src)!;
}
