import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    // The 3D view (three.js) is ~950 kB but lazy-loaded only when it is opened.
    chunkSizeWarningLimit: 1000,
  },
})
