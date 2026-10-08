/**
 * Minimal 16-bit PCM WAV encode/decode. Takes are stored as WAV (compact,
 * lossless, decodable everywhere) and the final mixdown downloads as WAV.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numCh = channels.length
  const length = channels[0]?.length ?? 0
  const bytesPerSample = 2
  const dataSize = length * numCh * bytesPerSample
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, numCh, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * numCh * bytesPerSample, true)
  v.setUint16(32, numCh * bytesPerSample, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  let o = 44
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]))
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true)
      o += 2
    }
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Decode a 16-bit PCM WAV made by encodeWav (fast path, no AudioContext needed). */
export async function decodeWav(blob: Blob): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const v = new DataView(await blob.arrayBuffer())
  const numCh = v.getUint16(22, true)
  const sampleRate = v.getUint32(24, true)
  // find the data chunk
  let o = 12
  while (o < v.byteLength - 8) {
    const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
    const size = v.getUint32(o + 4, true)
    if (id === 'data') {
      const frames = Math.floor(size / (2 * numCh))
      const channels = Array.from({ length: numCh }, () => new Float32Array(frames))
      let p = o + 8
      for (let i = 0; i < frames; i++) for (let c = 0; c < numCh; c++, p += 2) channels[c][i] = v.getInt16(p, true) / 0x8000
      return { channels, sampleRate }
    }
    o += 8 + size + (size % 2)
  }
  throw new Error('Not a PCM WAV file')
}
