import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  server: {
    proxy: {
      '/yahoo-proxy': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-proxy/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://finance.yahoo.com/',
          'Accept': 'application/json',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8',
        },
      },
      '/api/ticker': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL('http://localhost' + path);
          const symbol = url.searchParams.get('symbol') || '';
          return `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://finance.yahoo.com/',
          'Accept': 'application/json',
        },
      },
      '/api/history': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL('http://localhost' + path);
          const symbol = url.searchParams.get('symbol') || '';
          const from = url.searchParams.get('from');
          const to   = url.searchParams.get('to');
          if (from && to) {
            const p1 = Math.floor(new Date(from).getTime() / 1000);
            const p2 = Math.floor(new Date(to).getTime() / 1000) + 86400;
            return `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${p2}`;
          }
          return `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y`;
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://finance.yahoo.com/',
          'Accept': 'application/json',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8',
        },
      },
    },
  },
})