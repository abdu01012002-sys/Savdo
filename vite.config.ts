import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true
        },
        manifest: {
          name: 'Ombor Tizimi',
          short_name: 'Ombor',
          description: 'Ombor boshqaruvi tizimi',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    optimizeDeps: {
      include: [
        'firebase/app',
        'firebase/firestore',
        'firebase/auth',
        'firebase/database',
        '@firebase/app',
        '@firebase/firestore',
        '@firebase/auth',
        '@firebase/database',
        '@firebase/component'
      ]
    },
    resolve: {
      dedupe: [
        'react', 
        'react-dom', 
        'firebase', 
        'firebase/app', 
        'firebase/firestore', 
        'firebase/auth', 
        'firebase/database', 
        '@firebase/app', 
        '@firebase/firestore', 
        '@firebase/auth', 
        '@firebase/database', 
        '@firebase/component'
      ],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('xlsx')) {
                return 'vendor-xlsx';
              }
              if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('html-to-image')) {
                return 'vendor-pdf-canvas';
              }
              if (id.includes('recharts') || id.includes('d3-')) {
                return 'vendor-charts';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('html5-qrcode') || id.includes('qrcode')) {
                return 'vendor-qrcode';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor-core';
            }
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      hmr: process.env.ENABLE_HMR === 'true'
        ? {
            protocol: 'wss',
            clientPort: process.env.HMR_CLIENT_PORT ? parseInt(process.env.HMR_CLIENT_PORT, 10) : 443,
          }
        : false,
      // Disable file watching to save CPU during agent edits
      watch: process.env.ENABLE_HMR === 'true' ? {} : null,
    },
  };
});
