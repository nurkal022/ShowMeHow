import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright'],
  // Сцены лабораторий — статичные страницы в public/labs; короткий адрес /lab/<slug>
  // нужен для QR-кода, который сканируют очки.
  async rewrites() {
    return [{ source: '/lab/:slug', destination: '/labs/:slug.html' }];
  },
};
export default nextConfig;
