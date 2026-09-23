'use client';
import { useEffect, useRef, useState } from 'react';
import NotificationsBell from './NotificationsBell';
import { PaletteButton } from './CommandPalette';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconAdmin, IconBook, IconBulb, IconCourses, IconLab, IconLibrary, IconLogout, IconMonitor, IconMoon, IconOrg,
  IconPlus, IconSliders, IconSun, IconTable, IconTeach, IconUser,
} from './icons';
import { IconStar } from './cabinet/icons';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';
import type { NavSection, NavSectionKey } from '@/lib/org/policy';

// Иконки живут на клиенте: компонент нельзя передать из серверного layout.
export const ICONS: Record<NavSectionKey, typeof IconPlus> = {
  learn: IconBook,
  catalog: IconCourses,
  teach: IconTeach,
  create: IconPlus,
  library: IconLibrary,
  labs: IconLab,
  org: IconOrg,
  admin: IconAdmin,
};

export function isSectionActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  // «Моё обучение» и «Каталог» делят префикс /learn: курс и урок относятся к обучению,
  // а страницы профиля ученика (оценки, заметки) не подсвечивают ни один раздел.
  if (href === '/learn') {
    return pathname === '/learn' || pathname.startsWith('/learn/topics') || pathname.startsWith('/learn/courses');
  }
  return pathname.startsWith(href);
}

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Светлая', Icon: IconSun },
  { value: 'dark', label: 'Тёмная', Icon: IconMoon },
  { value: 'system', label: 'Как в системе', Icon: IconMonitor },
];

interface NavUser { label: string; role: string }

/** Личные страницы ученика живут в меню аккаунта, а не в шапке. */
const STUDENT_MENU: { href: string; label: string; Icon: typeof IconUser }[] = [
  { href: '/learn/me', label: 'Профиль ученика', Icon: IconUser },
  { href: '/learn/grades', label: 'Мои оценки', Icon: IconTable },
  { href: '/learn/mistakes', label: 'Работа над ошибками', Icon: IconBulb },
  { href: '/learn/notes', label: 'Заметки и закладки', Icon: IconStar },
];

export default function NavLinks({ sections, user, student = false }: {
  sections: NavSection[]; user?: NavUser; student?: boolean;
}) {
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
        {sections.map(({ key, href, label }) => {
          const Icon = ICONS[key];
          return (
            <Link key={key} href={href} className={isSectionActive(href, pathname) ? 'active' : ''}>
              <Icon size={17} /><span style={{ marginLeft: 7 }}>{label}</span>
            </Link>
          );
        })}
      </div>
      {!user && (
        <div className="account">
          <Link href="/login" className="btn btn-sm btn-primary">Войти</Link>
        </div>
      )}
      {user && <PaletteButton />}
      {user && <NotificationsBell />}
      {user && (
        <div className="account" ref={boxRef}>
          <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open}
            aria-label="Меню аккаунта" onClick={() => setOpen((v) => !v)}>
            {user.label.slice(0, 1)}
          </button>
          {open && (
            <div className="menu" role="menu">
              <div className="menu-head">
                <strong>{user.label}</strong>
                <span>{user.role === 'admin' ? 'Администратор' : 'Пользователь'}</span>
              </div>
              {student && STUDENT_MENU.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
                  <Icon size={18} />{label}
                </Link>
              ))}
              {student && <div className="menu-sep" />}
              <Link href="/profile" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
                <IconSliders size={18} />Настройки аккаунта
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
