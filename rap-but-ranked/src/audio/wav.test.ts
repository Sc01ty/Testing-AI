import { describe, expect, it } from 'vitest'
import { decodeWav, encodeWav } from './wav'

describe('wav', () => {
  it('round-trips 16-bit PCM', async () => {
    const a = new Float32Array([0, 0.5, -0.5, 1, -1])
    const b = new Float32Array([0.25, -0.25, 0, 0, 0])
    const blob = encodeWav([a, b], 48000)
    expect(blob.size).toBe(44 + 5 * 2 * 2)
    const d = await decodeWav(blob)
    expect(d.sampleRate).toBe(48000)
    expect(d.channels).toHaveLength(2)
    d.channels[0].forEach((v, i) => expect(v).toBeCloseTo(a[i], 3))
    d.channels[1].forEach((v, i) => expect(v).toBeCloseTo(b[i], 3))
  })
})
