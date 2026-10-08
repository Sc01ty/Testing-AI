/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

/**
 * On-device speech recognition (Whisper base, word timestamps), in a worker
 * so the page never freezes. The model is downloaded once and cached by the
 * browser; audio never leaves the device.
 */
const ASR_MODEL = 'onnx-community/whisper-base_timestamped'

env.allowLocalModels = false

type In = { type: 'load' } | { type: 'transcribe'; id: number; audio: Float32Array; mode?: 'word' | 'line' }

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null
const files = new Map<string, { loaded: number; total: number }>()
const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

function ensure() {
  // (typed loosely: the pipeline() overloads are too big for the type checker)
  const make = pipeline as unknown as (task: string, model: string, opts: object) => Promise<AutomaticSpeechRecognitionPipeline>
  asr ??= make('automatic-speech-recognition', ASR_MODEL, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === 'progress' && p.file && p.total) {
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        post({ type: 'progress', loaded, total })
      }
    },
  })
  asr.catch(() => (asr = null))
  return asr
}

self.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data
  try {
    if (msg.type === 'load') {
      await ensure()
      post({ type: 'ready' })
    } else if (msg.type === 'transcribe') {
      const run = await ensure()
      const line = msg.mode === 'line'
      const out = (await run(msg.audio, { return_timestamps: line ? true : 'word', language: 'english', task: 'transcribe' } as never)) as unknown as {
        text: string
        chunks?: { text: string; timestamp: [number, number | null] }[]
      }
      const chunks = (out.chunks ?? []).map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.2 }))
      // line mode: spread each line's words evenly over its time span
      const words = line
        ? chunks.flatMap((c) => {
            const ws = c.text.split(/\s+/).filter(Boolean)
            const step = (c.end - c.start) / Math.max(1, ws.length)
            return ws.map((w, i) => ({ text: w, start: c.start + i * step, end: c.start + (i + 1) * step }))
          })
        : chunks
      post({ type: 'result', id: msg.id, text: out.text.trim(), words })
    }
  } catch (err) {
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
