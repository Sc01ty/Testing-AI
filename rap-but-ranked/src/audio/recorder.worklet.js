/**
 * Captures mic audio in ~43ms batches, each stamped with the AudioContext
 * frame its first sample was captured at, so takes can be aligned to the
 * beat sample-accurately (MediaRecorder can't do that).
 */
class RbrRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.size = 2048
    this.buf = new Float32Array(this.size)
    this.n = 0
    this.startFrame = 0
    this.active = true
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.flush()
        this.active = false
      }
    }
  }
  flush() {
    if (this.n > 0) {
      this.port.postMessage({ frame: this.startFrame, data: this.buf.slice(0, this.n) })
      this.n = 0
    }
  }
  process(inputs) {
    if (!this.active) return false
    const ch = inputs[0] && inputs[0][0]
    if (!ch) {
      this.flush()
      return true
    }
    // keep batches contiguous; if frames skipped, start a new batch
    if (this.n > 0 && currentFrame !== this.startFrame + this.n) this.flush()
    if (this.n === 0) this.startFrame = currentFrame
    this.buf.set(ch, this.n)
    this.n += ch.length
    if (this.n + 128 > this.size) this.flush()
    return true
  }
}
registerProcessor('rbr-recorder', RbrRecorder)
