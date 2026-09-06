import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'], testTimeout: 30000 },
  // tsconfig держит jsx: 'preserve' для Next; vitest компилирует .tsx сам,
  // поэтому здесь указываем автоматический рантайм — иначе JSX ищет глобальный React.
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
