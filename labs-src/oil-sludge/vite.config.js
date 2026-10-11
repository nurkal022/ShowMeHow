import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Копия проекта vr-lab (KazNU/PhD/OilDirt), встроенная в Tesseract как лаборатория /lab/oil-sludge.
// Сборка кладётся в public/labs/oil-sludge, адреса ресурсов — от /labs/oil-sludge/.
// `npm run dev` — https://<IP-компьютера>:5173 (для очков); `npm run dev:http` — только ПК.
export default defineConfig(({ mode }) => ({
  base: '/labs/oil-sludge/',
  plugins: mode === 'http' ? [] : [basicSsl()],
  server: { host: true, port: 5173 },
  worker: { format: 'es' },
  build: {
    target: 'es2022', chunkSizeWarningLimit: 1500,
    outDir: '../../public/labs/oil-sludge', emptyOutDir: true,
  },
}));
