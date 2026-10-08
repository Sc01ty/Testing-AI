import { useSyncExternalStore } from 'react'
import type { ChatCompletionMessageParam, MLCEngineInterface } from '@mlc-ai/web-llm'

/**
 * The in-browser "Rap AI": a small instruction model (Qwen2.5 1.5B, 4-bit)
 * run by WebLLM on the user's GPU through WebGPU. No API key, no server,
 * nothing leaves the machine. One-time ~880 MB download, then cached by the
 * browser and loaded from disk.
 *
 * The WebLLM library itself is only fetched when the model is first
 * loaded, so it never slows down opening the app.
 */
export const MODEL_SIZE_MB = 880
export const MODEL_NAME = 'Qwen2.5 1.5B'
// 0.5B (290 MB) was tested first and wasn't good enough at this task; 1.5B is
// the smallest that gave genuinely useful challenges in our comparison.
const MODEL_F16 = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
const MODEL_F32 = 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC'

export type ModelStatus =
  | 'checking'
  | 'unsupported' // no WebGPU
  | 'not-downloaded'
  | 'cached' // downloaded before, not loaded this visit
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error'

export interface ModelState {
  status: ModelStatus
  /** 0..1 while downloading / loading */
  progress: number
  detail: string
  modelId: string | null
  error: string | null
}

type Listener = () => void

class LocalModel {
  private state: ModelState = { status: 'checking', progress: 0, detail: '', modelId: null, error: null }
  private listeners = new Set<Listener>()
  private engine: MLCEngineInterface | null = null
  private loading: Promise<boolean> | null = null
  private detecting: Promise<void> | null = null
  private busy: Promise<unknown> = Promise.resolve()

  getState = () => this.state
  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  get ready() {
    return this.state.status === 'ready' && !!this.engine
  }

  /** Is WebGPU available, which model build fits this GPU, and is it already downloaded? */
  detect(): Promise<void> {
    if (this.detecting) return this.detecting
    this.detecting = (async () => {
      type Adapter = { features: { has(f: string): boolean } }
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu
      if (!gpu) {
        this.set({ status: 'unsupported', detail: "This browser doesn't have WebGPU (try Chrome or Edge on desktop)." })
        return
      }
      let adapter: Adapter | null = null
      try {
        adapter = await gpu.requestAdapter()
      } catch {
        adapter = null
      }
      if (!adapter) {
        this.set({ status: 'unsupported', detail: 'WebGPU is switched off or no compatible GPU was found.' })
        return
      }
      const modelId = adapter.features.has('shader-f16') ? MODEL_F16 : MODEL_F32
      const cached = await isCached(modelId)
      if (this.state.status === 'checking') this.set({ modelId, status: cached ? 'cached' : 'not-downloaded', detail: '' })
      else this.set({ modelId })
    })()
    return this.detecting
  }

  /** Download (first time) or load from cache. Safe to call repeatedly. */
  load(): Promise<boolean> {
    if (this.engine) return Promise.resolve(true)
    if (this.loading) return this.loading
    this.loading = this.doLoad().finally(() => {
      this.loading = null
    })
    return this.loading
  }

  private async doLoad(): Promise<boolean> {
    await this.detect()
    const modelId = this.state.modelId
    if (!modelId || this.state.status === 'unsupported') return false
    const wasCached = this.state.status === 'cached' || (await isCached(modelId))
    this.set({ status: wasCached ? 'loading' : 'downloading', progress: 0, detail: wasCached ? 'Loading from this computer…' : 'Starting download…', error: null })
    try {
      const webllm = await import('@mlc-ai/web-llm')
      const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' })
      this.engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (r) => {
          // "Fetching param cache… MB fetched" = downloading; "Loading model from cache" = from disk
          const fetching = /fetch|download/i.test(r.text) && !/loading model from cache/i.test(r.text)
          this.set({
            status: fetching && !wasCached ? 'downloading' : 'loading',
            progress: Math.max(0, Math.min(1, r.progress)),
            detail: r.text.replace(/\[.*?\]\s*/g, '').slice(0, 120),
          })
        },
      })
      this.set({ status: 'ready', progress: 1, detail: 'Ready', error: null })
      return true
    } catch (e) {
      this.engine = null
      const msg = e instanceof Error ? e.message : String(e)
      const friendly = /quota|storage/i.test(msg)
        ? 'Not enough disk space to store the model.'
        : /fetch|network|Failed to fetch/i.test(msg)
          ? 'Download failed — check your connection and try again.'
          : /device|adapter|gpu|memory/i.test(msg)
            ? 'Your GPU could not run the model (not enough memory or unsupported).'
            : 'The model failed to load.'
      this.set({ status: 'error', error: `${friendly} (${msg.slice(0, 140)})`, detail: '' })
      return false
    }
  }

  /** One request at a time (the engine is single-stream). */
  async chat(messages: ChatCompletionMessageParam[], opts: { maxTokens: number; temperature: number; jsonSchema?: object; timeoutMs: number }): Promise<string> {
    const run = async () => {
      const engine = this.engine
      if (!engine) throw new Error('model not loaded')
      const req = engine.chat.completions.create({
        messages,
        temperature: opts.temperature,
        top_p: 0.9,
        max_tokens: opts.maxTokens,
        stream: false,
        ...(opts.jsonSchema ? { response_format: { type: 'json_object' as const, schema: JSON.stringify(opts.jsonSchema) } } : {}),
      })
      let timer = 0
      const timeout = new Promise<never>((_, rej) => {
        timer = window.setTimeout(() => {
          void engine.interruptGenerate()
          rej(new Error('timeout'))
        }, opts.timeoutMs)
      })
      try {
        const res = await Promise.race([req, timeout])
        return res.choices[0]?.message?.content ?? ''
      } finally {
        clearTimeout(timer)
      }
    }
    const p = this.busy.then(run, run)
    this.busy = p.catch(() => undefined)
    return p
  }

  /** Free GPU memory and delete the downloaded files. */
  async remove() {
    const id = this.state.modelId
    try {
      await this.engine?.unload()
    } catch {
      /* ignore */
    }
    this.engine = null
    if (id) {
      const webllm = await import('@mlc-ai/web-llm')
      await webllm.deleteModelAllInfoInCache(id).catch(() => undefined)
    }
    this.set({ status: 'not-downloaded', progress: 0, detail: '', error: null })
  }

  private set(patch: Partial<ModelState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }
}

/** Look for the model's weight shards in the browser cache without loading WebLLM. */
async function isCached(modelId: string): Promise<boolean> {
  try {
    if (!('caches' in window)) return false
    const cache = await caches.open('webllm/model')
    const keys = await cache.keys()
    return keys.some((k) => k.url.includes(modelId) && /params_shard/.test(k.url))
  } catch {
    return false
  }
}

export const localModel = new LocalModel()

export function useLocalModel() {
  return useSyncExternalStore(localModel.subscribe, localModel.getState, localModel.getState)
}
