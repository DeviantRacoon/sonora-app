import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig({
  envDir: '..',
  plugins: [react(), tailwind(), {
    name: 'sonora-pwa',
    apply: 'build',
    generateBundle(_, bundle) {
      const shell = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/fonts/dm-sans-regular.ttf', '/fonts/dm-sans-bold.ttf', ...Object.keys(bundle).filter(file => /\.(js|css)$/.test(file)).map(file => `/${file}`)]
      const template = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
      const version = createHash('sha256').update(JSON.stringify(shell) + template).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__CACHE_NAME__', JSON.stringify(`sonora-shell-${version}`)).replace('__PRECACHE__', JSON.stringify(shell)) })
    },
  }],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
})
