import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: './', // Uses relative paths for WebExtensions
  test: {
    // Scoped to src/ on purpose: the default pattern also walks nested git
    // worktrees (.claude/worktrees/...), which would run another branch's tests.
    include: ['src/**/*.test.ts']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'background.html'),
        dashboard: resolve(__dirname, 'dashboard.html')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    },
    target: 'es2022',
    minify: true,
    sourcemap: false
  }
});
