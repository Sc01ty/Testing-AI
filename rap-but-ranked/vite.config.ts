import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `base: './'` keeps the build portable (GitHub Pages sub-path, file preview, etc).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
