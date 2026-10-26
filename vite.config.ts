import { defineConfig } from 'vite'

// GitHub Pages project site needs base = /<repo>/
// Local / Vercel / Netlify use '/'
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  server: {
    port: 5173,
    open: true,
    watch: {
      // Visual Studio locks files under .vs → EBUSY if Vite watches them
      ignored: ['**/.vs/**', '**/node_modules/**', '**/dist/**'],
    },
  },
})
