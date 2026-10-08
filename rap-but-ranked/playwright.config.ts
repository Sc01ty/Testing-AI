import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// Use a preinstalled Chromium when present (cloud dev box); otherwise Playwright's own.
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

// PW_DEV=1 runs against the Vite dev server (StrictMode, unbundled) — how the app is used day to day.
const dev = !!process.env.PW_DEV
const port = dev ? 5173 : 4173

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: dev ? 'npx vite --port 5173 --strictPort' : 'npm run build && npx vite preview --port 4173 --strictPort',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
})
