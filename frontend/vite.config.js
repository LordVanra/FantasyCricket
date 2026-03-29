import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/app.js',
        chunkFileNames: 'assets/js/[name].js',
        assetFileNames: (assetInfo) => {
          const fileName = assetInfo?.name || '';
          if (fileName.endsWith('.css')) {
            return 'assets/css/app.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
