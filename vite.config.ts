import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  server: {
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api/proxy': {
        target: 'https://api.allorigins.win',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const targetUrl = url.searchParams.get('url');
          return `/raw?url=${targetUrl}`;
        },
      },
    },
  },
  
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ai': ['openai'],
        },
      },
    },
  },
  
  define: {
    'process.env': {},
  },
  
  optimizeDeps: {
    exclude: ['@anthropic-ai/sdk'],
  },
});
