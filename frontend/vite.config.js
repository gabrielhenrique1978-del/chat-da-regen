import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuração oficial do Vite com Proxy para o Backend Python FastAPI (http://localhost:8000)
// Desenvolvido por Gabriel Henrique e Otavio Santana
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
