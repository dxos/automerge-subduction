import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [wasm()],
  test: {
    include: ['./{src,test}/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    reporters: ['verbose'],
    server: {
      deps: {
        inline: true,
      },
    },
  },
});
