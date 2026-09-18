'use client';
import { useEffect, useState } from 'react';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';

/** Выбор темы в оболочке кабинетов: то же хранение, что в шапке сайта (src/lib/theme.ts). */
export function useThemeChoice(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => { setTheme(readStoredTheme() ?? 'light'); }, []);

  // Выбор «как в системе» обязан следить за системой и после первой отрисовки.
  useEffect(() => {
    if (theme !== 'system' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  function pick(next: Theme) {
    setTheme(next);
    storeTheme(next);
    // Настройка едет за пользователем между устройствами; сбой сети здесь не важен.
    fetch('/api/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: { theme: next } }),
    }).catch(() => {});
  }

  return [theme, pick];
}
