import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages sirve el proyecto en /cubo-rubik/
  base: process.env.GITHUB_ACTIONS ? '/cubo-rubik/' : '/',
});
