import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => {
  const isProd  = command === 'build'
  const base    = isProd ? '/GFDetect/' : '/'

  return {
    base,
    server: { host: '127.0.0.1' },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',

        // Assets to pre-cache beyond the build output
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],

        // Inline manifest — lets us set start_url/scope correctly per environment
        manifest: {
          name:             'CeliScan — Gluten Detector',
          short_name:       'CeliScan',
          description:      'AI-powered gluten detector for celiacs. Scan any product instantly.',
          theme_color:      '#07070f',
          background_color: '#07070f',
          display:          'standalone',
          orientation:      'portrait',
          lang:             'en',
          // Correct base path for GitHub Pages in production, root for dev
          start_url: base,
          scope:     base,
          icons: [
            {
              src:     'icon-192.png',
              sizes:   '192x192',
              type:    'image/png',
              purpose: 'any',
            },
            {
              src:     'icon-512.png',
              sizes:   '512x512',
              type:    'image/png',
              purpose: 'any',
            },
            {
              src:     'icon-512.png',
              sizes:   '512x512',
              type:    'image/png',
              purpose: 'maskable',
            },
          ],
          categories: ['health', 'food', 'medical'],
        },

        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // Adjust navigateFallback to match the base path
          navigateFallback: isProd ? '/GFDetect/index.html' : '/index.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'supabase-cache', networkTimeoutSeconds: 10 },
            },
            {
              // Cache Open Food Facts API responses
              urlPattern: /^https:\/\/world\.openfoodfacts\.org\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'off-cache',
                networkTimeoutSeconds: 10,
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 7 days
              },
            },
          ],
        },
      }),
    ],
  }
})
