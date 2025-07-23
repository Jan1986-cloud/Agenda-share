import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Maakt het mogelijk om '@/' te gebruiken om naar de 'src' map te verwijzen
      '@': path.resolve(__dirname, './src'),
      // Maakt het mogelijk om '@shared' te gebruiken om naar de 'shared' map te verwijzen
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});