import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          motion: ['framer-motion'],
          storage: ['dexie', 'zustand'],
          icons: ['lucide-react']
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '随记',
        short_name: '随记',
        description: '本地优先的极简写作应用',
        theme_color: '#f5f0e6',
        background_color: '#f5f0e6',
        display: 'standalone',
        start_url: '/',
        lang: 'zh-CN',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg}'],
        additionalManifestEntries: [
          { url: '/fonts/LXGWWenKaiLite-Medium.ttf', revision: 'lxgw-wenkai-lite-1.522' },
          { url: '/fonts/OFL-LXGW-WenKai.txt', revision: 'ofl-1.1' },
          { url: '/fonts/montserrat-light.woff2', revision: 'montserrat-light' },
          { url: '/fonts/montserrat-regular.woff2', revision: 'montserrat-regular' },
          { url: '/fonts/montserrat-medium.woff2', revision: 'montserrat-medium' },
          { url: '/fonts/Montserrat-OFL.txt', revision: 'montserrat-ofl-1.1' }
        ],
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/.*\.(?:ttf|woff2)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'quiet-note-fonts',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
})
