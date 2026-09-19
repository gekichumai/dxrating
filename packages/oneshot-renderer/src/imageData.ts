const imageBuffers = new WeakMap<Buffer, ArrayBuffer>()

/** Satori's JPEG decoder requires an ArrayBuffer, not a Buffer or a view into a pooled slab. */
export function imageData(buffer: Buffer): ArrayBuffer {
  const cached = imageBuffers.get(buffer)
  if (cached) return cached
  const data =
    buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength && buffer.buffer instanceof ArrayBuffer
      ? buffer.buffer
      : new Uint8Array(buffer).buffer
  imageBuffers.set(buffer, data)
  return data
}