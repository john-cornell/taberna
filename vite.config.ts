/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  /** Relative asset URLs — works at domain root and in subfolders on IONOS. */
  base: './',
  test: {
    environment: 'jsdom',
  },
});
