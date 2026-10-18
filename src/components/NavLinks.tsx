'use client';
import { useEffect, useRef, useState } from 'react';
import NotificationsBell from './NotificationsBell';
import { PaletteButton } from './CommandPalette';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconAdmin, IconBook, IconBulb, IconCourses, IconFormula, IconLab, IconLibrary, IconLogout, IconMoon, IconOrg,
  IconPlus, IconSliders, IconSun, IconTable, IconTeach, IconUser, IconClose,
} from './icons';
import { IconStar } from './cabinet/icons';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';
import type { NavSection, NavSectionKey } from '@/lib/org/policy';
import { useLocale, useSetLocale, useT } from '@/i18n/client';
import { LOCALES, LOCALE_SHORT } from '@/i18n/config';
import { nav } from '@/i18n/messages/nav';
import LanguageSwitcher from './LanguageSwitcher';

// Иконки живут на клиенте: компонент нельзя передать из серверного layout.
export const ICONS: Record<NavSectionKey, typeof IconPlus> = {
  learn: IconBook,
  catalog: IconCourses,
  teach: IconTeach,
  create: IconPlus,
  research: IconFormula,
  library: IconLibrary,
  labs: IconLab,
  org: IconOrg,
  admin: IconAdmin,
};

export function isSectionActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  // «Моё обучение» и «Каталог» делят префикс /learn: курс и урок относятся к обучению,
  // а страницы профиля студента (оценки, заметки) не подсвечивают ни один раздел.
  if (href === '/learn') {
    return pathname === '/learn' || pathname.startsWith('/learn/topics') || pathname.startsWith('/learn/courses');
  }
  return pathname.startsWith(href);
}

interface NavUser { label: string; role: string }

/** Личные страницы студента живут в меню аккаунта, а не в шапке. */
const STUDENT_MENU: { href: string; label: 'studentProfile' | 'grades' | 'mistakes' | 'notes'; Icon: typeof IconUser }[] = [
  { href: '/learn/me', label: 'studentProfile', Icon: IconUser },
  { href: '/learn/grades', label: 'grades', Icon: IconTable },
  { href: '/learn/mistakes', label: 'mistakes', Icon: IconBulb },
  { href: '/learn/notes', label: 'notes', Icon: IconStar },
];

export default function NavLinks({ sections, user, student = false, registrationOpen = false }: {
  sections: NavSection[]; user?: NavUser; student?: boolean; registrationOpen?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT(nav);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const locale = useLocale();
  const setLocale = useSetLocale();
  const langBtn = (
    <button type="button" className="nav-lang" aria-label={t('languageGroup')} title={t('languageGroup')}
      onClick={() => setLocale(LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length])}>{LOCALE_SHORT[locale]}</button>
  );
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => { setSheet(false); }, [pathname]);
  // Быстрый переключатель в шапке: светлая ↔ тёмная (с учётом «как в системе»).
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  function toggleTheme() { pickTheme(isDark() ? 'light' : 'dark'); }
  const boxRef = useRef<HTMLDivElement>(null);

  // Не выбрано — как в системе (так же решает скрипт в <head>).
  useEffect(() => { setTheme(readStoredTheme() ?? 'system'); }, []);

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

  const links = (
    <>
      {sections.map(({ key, href }) => {
        const Icon = ICONS[key];
        return (
          <Link key={key} href={href} className={isSectionActive(href, pathname) ? 'active' : ''}>
            <Icon size={17} /><span>{t(key)}</span>
          </Link>
        );
      })}
      <Link href="/showcase" className={isSectionActive('/showcase', pathname) ? 'active' : ''}>
        <IconStar size={17} /><span>{t('showcase')}</span>
      </Link>
    </>
  );
  const themeBtn = (
    <button type="button" className="nav-icon-btn" onClick={toggleTheme} aria-label={t('themeToggle')} title={t('themeToggle')}>
      <IconSun size={18} className="nav-ico-sun" /><IconMoon size={18} className="nav-ico-moon" />
    </button>
  );
  return (
    <>
      <div className="navlinks">{links}</div>
      <button type="button" className="nav-burger" aria-label={t('menu')} aria-expanded={sheet} onClick={() => setSheet((v) => !v)}>
        {sheet ? <IconClose size={20} /> : <><span /><span /><span /></>}
      </button>
      {sheet && (
        <div className="nav-sheet" onClick={() => setSheet(false)}>
          <div className="nav-sheet-card" onClick={(e) => e.stopPropagation()}>
            <div className="nav-sheet-links">{links}</div>
            <div className="nav-sheet-row">
              <LanguageSwitcher compact label={t('languageGroup')} />
              {themeBtn}
            </div>
            {!user && (
              <div className="nav-sheet-row">
                <Link href="/login" className="btn">{t('login')}</Link>
                {registrationOpen && <Link href="/register" className="btn btn-primary">{t('tryIt')}</Link>}
              </div>
            )}
          </div>
        </div>
      )}
      {!user && (
        <div className="account">
          {themeBtn}
          {langBtn}
          <Link href="/login" className="nav-login">{t('login')}</Link>
          {registrationOpen && <Link href="/register" className="nav-try">{t('tryIt')}<span>→</span></Link>}
        </div>
      )}
      {/* Тема и язык — всегда в шапке, одним кликом, и у гостя, и у вошедшего. */}
      {user && <div className="nav-quick">{themeBtn}{langBtn}</div>}
      {user && <PaletteButton />}
      {user && <NotificationsBell />}
      {user && (
        <div className="account" ref={boxRef}>
          <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open}
            aria-label={t('accountMenu')} onClick={() => setOpen((v) => !v)}>
            {user.label.slice(0, 1)}
          </button>
          {open && (
            <div className="menu" role="menu">
              <div className="menu-head">
                <strong>{user.label}</strong>
                <span>{user.role === 'admin' ? t('admin_role') : t('user_role')}</span>
              </div>
              {student && STUDENT_MENU.map(({ href, label, Icon }) => (
                <Link key={href} href={href} className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
                  <Icon size={18} />{t(label)}
                </Link>
              ))}
              {student && <div className="menu-sep" />}
              <Link href="/profile" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
                <IconSliders size={18} />{t('accountSettings')}
              </Link>
              <div className="menu-sep" />
              <button type="button" className="menu-item" role="menuitem" onClick={logout}>
                <IconLogout size={18} />{t('logout')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
