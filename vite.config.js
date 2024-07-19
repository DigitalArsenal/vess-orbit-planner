import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createHtmlPlugin } from 'vite-plugin-html';
import { resolve } from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    svelte(),
    createHtmlPlugin({
      minify: true,
    }),
    viteSingleFile(),
  ],
  build: {
    outDir: 'docs',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});