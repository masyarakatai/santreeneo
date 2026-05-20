import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const hmrDisabled = process.env.DISABLE_HMR === 'true';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Enable HMR by default for a better developer experience
      hmr: hmrDisabled ? false : {
        protocol: 'ws',
        host: 'localhost',
      },
      watch: hmrDisabled ? null : {},
    },
  };
});
