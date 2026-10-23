import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      injectRegister: false,
      manifest: false,
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
        navigateFallback: null,
        // Keep / out of the precache route so navigations stay network-first like every other path.
        directoryIndex: null,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
              precacheFallback: { fallbackURL: 'index.html' },
            },
          },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8080' } },
});
