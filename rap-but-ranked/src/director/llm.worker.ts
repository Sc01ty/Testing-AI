import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

// The model runs here, off the main thread, so the UI never stutters while it thinks.
const handler = new WebWorkerMLCEngineHandler()
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg)
