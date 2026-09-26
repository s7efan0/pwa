/**
 * VAPID keys are base64url; PushManager wants raw bytes.
 *
 * The ArrayBuffer is allocated explicitly rather than using Uint8Array.from,
 * which returns Uint8Array<ArrayBufferLike>. Since TypeScript 5.7 typed arrays
 * are generic over their backing buffer, and ArrayBufferLike admits
 * SharedArrayBuffer — which BufferSource does not accept.
 *
 * Lives in its own module so the service worker can use it too, without
 * pulling in code that touches `window`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Byte-compare two buffers — used to detect a rotated VAPID key. */
export function buffersEqual(
  a: ArrayBuffer | null | undefined,
  b: ArrayBuffer,
): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.every((v, i) => v === y[i]);
}
