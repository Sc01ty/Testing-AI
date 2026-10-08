import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base: './'` keeps the build portable (GitHub Pages sub-path, file preview, etc).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {proxy:{'/api':'http://localhost:4180'}},
  preview: {proxy:{'/api':'http://localhost:4180'}},
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // the app loads the pronunciation dictionary before judging; tests do too
    setupFiles: ['src/test-setup.ts'],
  },
})
