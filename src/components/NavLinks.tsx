'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { IconLibrary, IconLogout, IconMonitor, IconMoon, IconPlus, IconSun, IconUser } from './icons';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';

const LINKS = [
  { href: '/', label: 'Создать', Icon: IconPlus },
  { href: '/library', label: 'Библиотека', Icon: IconLibrary },
];

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Светлая', Icon: IconSun },
  { value: 'dark', label: 'Тёмная', Icon: IconMoon },
  { value: 'system', label: 'Как в системе', Icon: IconMonitor },
];

interface NavUser { email: string; role: string }

export default function NavLinks({ user }: { user?: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTheme(readStoredTheme() ?? 'light'); }, []);

  // Выбор «как в системе» обязан следить за системой и после первой отрисовки.
  useEffect(() => {
    if (theme !== 'system' || typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  function pickTheme(next: Theme) {
    setTheme(next);
    storeTheme(next);
    // Настройка едет за пользователем между устройствами; сбой сети здесь не важен.
    fetch('/api/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: { theme: next } }),
    }).catch(() => {});
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <div className="navlinks">
        {LINKS.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          return (
            <Link key={href} href={href} className={active ? 'active' : ''}>
              <Icon size={17} /><span style={{ marginLeft: 7 }}>{label}</span>
            </Link>
          );
        })}
      </div>
      {user && (
        <div className="account" ref={boxRef}>
          <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open}
            aria-label="Меню аккаунта" onClick={() => setOpen((v) => !v)}>
            {user.email.slice(0, 1)}
          </button>
          {open && (
            <div className="menu" role="menu">
              <div className="menu-head">
                <strong>{user.email}</strong>
                <span>{user.role === 'admin' ? 'Администратор' : 'Пользователь'}</span>
              </div>
              <Link href="/profile" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
                <IconUser size={18} />Профиль и настройки
              </Link>
              <div className="menu-sep" />
              <div className="menu-theme" role="group" aria-label="Тема оформления">
                <div className="segmented" style={{ width: '100%' }}>
                  {THEME_OPTIONS.map(({ value, label, Icon }) => (
                    <button key={value} type="button" title={label} aria-label={label}
                      aria-pressed={theme === value}
                      className={theme === value ? 'segmented-item active' : 'segmented-item'}
                      onClick={() => pickTheme(value)}>
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="menu-sep" />
              <button type="button" className="menu-item" role="menuitem" onClick={logout}>
                <IconLogout size={18} />Выйти
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
