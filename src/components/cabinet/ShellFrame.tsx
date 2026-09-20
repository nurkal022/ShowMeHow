'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  IconAlert, IconBack, IconCourses, IconLogo, IconSpark, IconLogout, IconMonitor, IconMoon, IconOrg, IconPlus, IconSun, IconTeach, IconUser,
} from '@/components/icons';
import {
  IconCatalog, IconChart, IconChevronRight, IconDashboard, IconGroup, IconInbox, IconList, IconMenu, IconPeople, IconSettings,
} from './icons';
import {
  SIDEBAR_KEY, breadcrumbs, groupAllows,
  type CabinetGroupKey, type CabinetIcon, type CabinetMenu, type CabinetMenuGroup, type CabinetMenuItem,
} from '@/lib/cabinet/menu';
import { withOrgParam } from '@/lib/lms/links';
import type { Theme } from '@/lib/theme';
import { isCabinetItemActive } from './CabinetNav';
import { useDismiss } from './useDismiss';
import NotificationsBell from '@/components/NotificationsBell';
import { PaletteButton } from '@/components/CommandPalette';
import { useImpersonate } from '@/components/admin/useImpersonate';
import type { SwitchTarget } from '@/lib/admin/switch';
import { ORG_ROLE_LABELS } from '@/lib/org/types';
import { useThemeChoice } from './useThemeChoice';

const ICONS: Record<CabinetIcon, typeof IconPlus> = {
  dashboard: IconDashboard, orgs: IconOrg, users: IconPeople, catalog: IconCatalog, log: IconList,
  teachers: IconTeach, groups: IconGroup, settings: IconSettings, courses: IconCourses, plus: IconPlus, review: IconInbox, report: IconChart, risk: IconAlert, ask: IconSpark,
};

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Светлая', Icon: IconSun },
  { value: 'dark', label: 'Тёмная', Icon: IconMoon },
  { value: 'system', label: 'Как в системе', Icon: IconMonitor },
];

const SECTION_OF: Record<string, CabinetGroupKey> = { admin: 'platform', org: 'org', teach: 'teach' };

interface ShellUser { name: string; contact: string; platformAdmin: boolean }

export default function ShellFrame({ menu, user, switchTargets = [], children }: {
  menu: CabinetMenu; user: ShellUser; switchTargets?: SwitchTarget[]; children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '/';
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  // Свёрнутость живёт в localStorage и в атрибуте <html>: его до отрисовки ставит скрипт из Shell.
  useEffect(() => {
    let stored = false;
    try { stored = localStorage.getItem(SIDEBAR_KEY) === 'collapsed'; } catch { /* приватный режим */ }
    setCollapsed(stored);
    if (stored) document.documentElement.setAttribute('data-cab-sidebar', 'collapsed');
    return () => document.documentElement.removeAttribute('data-cab-sidebar');
  }, []);

  // Переход по ссылке закрывает выдвижную панель на телефоне.
  useEffect(() => { setDrawer(false); }, [pathname]);

  useEffect(() => {
    if (!drawer) return;
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setDrawer(false); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [drawer]);

  function toggleSidebar() {
    // На телефоне бургер выдвигает панель поверх страницы, на широком экране — сворачивает её.
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 900px)').matches) {
      setDrawer((v) => !v);
      return;
    }
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.setAttribute('data-cab-sidebar', 'collapsed');
    else document.documentElement.removeAttribute('data-cab-sidebar');
    try { localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open'); } catch { /* не беда */ }
  }

  return (
    <div className={drawer ? 'cab cab-drawer-open' : 'cab'}>
      <aside className="cab-sidebar no-print" aria-label="Меню кабинета">
        {/* useSearchParams требует границы Suspense — но только вокруг меню, не вокруг страницы:
            иначе ответ начал бы уходить до того, как страница решит, что она 404. */}
        <Suspense fallback={<SidebarBrand href="/" />}>
          <SidebarMenu menu={menu} pathname={pathname} onNavigate={() => setDrawer(false)} />
        </Suspense>

        <Link href="/" className="cab-nav-item cab-back" title="На сайт">
          <IconBack size={18} /><span>На сайт</span>
        </Link>
      </aside>
      <button type="button" className="cab-scrim no-print" aria-label="Закрыть меню" tabIndex={drawer ? 0 : -1}
        onClick={() => setDrawer(false)} />

      <div className="cab-main">
        <header className="cab-topbar no-print">
          <button type="button" className="cab-icon-btn" onClick={toggleSidebar}
            aria-label="Меню" aria-expanded={drawer || !collapsed}>
            <IconMenu size={20} />
          </button>
          <Suspense fallback={<div className="cab-crumbs" />}>
            <Crumbs menu={menu} pathname={pathname} />
          </Suspense>
          <PaletteButton />
          <ThemeButton />
          <NotificationsBell />
          <AccountMenu user={user} switchTargets={switchTargets} />
        </header>
        <main className="cab-content">{children}</main>
      </div>
    </div>
  );
}

function SidebarBrand({ href }: { href: string }) {
  return (
    <Link href={href} className="cab-brand" title="Tesseract">
      <span className="brand-mark"><IconLogo size={15} /></span>
      <span className="cab-brand-text">Tesseract<small>кабинет</small></span>
    </Link>
  );
}

/** Что из меню видно при текущем адресе: часть групп появляется только вместе с ?org=. */
function useMenuState(menu: CabinetMenu, pathname: string) {
  const org = useSearchParams().get('org');
  const section = SECTION_OF[pathname.split('/')[1] ?? ''];
  const groups = menu.groups.filter((g) => !g.needsOrgParam || !!org);
  const roleOfOrg = org ? menu.orgs.find((o) => o.slug === org)?.role : undefined;
  return { org, section, groups, roleOfOrg };
}

function SidebarMenu({ menu, pathname, onNavigate }: { menu: CabinetMenu; pathname: string; onNavigate: () => void }) {
  const router = useRouter();
  const { org, section, groups, roleOfOrg } = useMenuState(menu, pathname);

  // Смена организации — тоже переход: выдвижная панель на телефоне закрывается.
  useEffect(() => { onNavigate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [org]);

  /** ?org= едет в ссылку, если раздел этой организации человеку доступен. */
  function hrefOf(group: CabinetMenuGroup, item: CabinetMenuItem): string {
    if (!group.orgScoped || !org) return item.href;
    if (roleOfOrg && !groupAllows(group.key, roleOfOrg)) return item.href;
    return withOrgParam(item.href, org);
  }

  return (
    <>
      <SidebarBrand href={groups[0]?.items[0]?.href ?? '/'} />

      <SidebarOrg menu={menu} org={org} section={section}
        onPick={(slug, role) => {
          const root = section === 'org' && role === 'org_admin' ? '/org' : section === 'teach' ? '/teach'
            : role === 'org_admin' ? '/org' : '/teach';
          router.push(withOrgParam(root, slug));
        }} />

      <nav className="cab-nav">
        {groups.map((group) => (
          <div className="cab-nav-group" key={group.key}>
            <div className="cab-nav-title">{group.title}</div>
            {group.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = !item.action && isCabinetItemActive(item, pathname);
              return (
                <Link key={item.href} href={hrefOf(group, item)} title={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`cab-nav-item${active ? ' active' : ''}${item.action ? ' action' : ''}`}>
                  <Icon size={18} /><span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

function Crumbs({ menu, pathname }: { menu: CabinetMenu; pathname: string }) {
  const { org, section, groups } = useMenuState(menu, pathname);
  const crumbs = breadcrumbs(pathname);
  // Ссылками крошки становятся, только если раздел есть в меню человека:
  // учителю группы «Организация» недоступна, и вести его туда незачем.
  const linked = !!section && groups.some((g) => g.key === section);
  return (
    <nav className="cab-crumbs" aria-label="Хлебные крошки">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href}>
              {i > 0 && <IconChevronRight size={14} />}
              {last || !linked
                ? <span aria-current={last ? 'page' : undefined}>{c.label}</span>
                : <Link href={withOrgParam(c.href, section === 'platform' ? null : org)}>{c.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Организация в боковой панели: выбор, если их несколько, иначе просто название. */
function SidebarOrg({ menu, org, section, onPick }: {
  menu: CabinetMenu; org: string | null; section: CabinetGroupKey | undefined;
  onPick: (slug: string, role: CabinetMenu['orgs'][number]['role']) => void;
}) {
  // В «Организации» выбирать можно только там, где человек админ.
  const choices = section === 'org' ? menu.orgs.filter((o) => o.role === 'org_admin') : menu.orgs;
  const known = org ? choices.find((o) => o.slug === org) : undefined;
  if (section === 'platform' && !org) return null;
  if (org && !known) {
    // Админ платформы зашёл в чужую организацию по ссылке из админки.
    return <div className="cab-org" title={org}><IconOrg size={16} /><span className="cab-org-name">{org}</span></div>;
  }
  if (choices.length === 0) return null;
  const current = known ?? choices[0];
  if (choices.length === 1) {
    return (
      <div className="cab-org" title={current.name}>
        <IconOrg size={16} /><span className="cab-org-name">{current.name}</span>
      </div>
    );
  }
  return (
    <label className="cab-org cab-org-select" title={current.name}>
      <IconOrg size={16} />
      <span className="visually-hidden">Организация</span>
      <select value={current.slug}
        onChange={(e) => {
          const picked = choices.find((o) => o.slug === e.target.value);
          if (picked) onPick(picked.slug, picked.role);
        }}>
        {choices.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
      </select>
    </label>
  );
}

function ThemeButton() {
  const [theme, pick] = useThemeChoice();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  const Current = THEME_OPTIONS.find((o) => o.value === theme)?.Icon ?? IconSun;
  return (
    <div className="cab-pop" ref={ref}>
      <button type="button" className="cab-icon-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label="Тема оформления" onClick={() => setOpen((v) => !v)}>
        <Current size={19} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button key={value} type="button" role="menuitemradio" aria-checked={theme === value}
              className={theme === value ? 'menu-item active' : 'menu-item'}
              onClick={() => { pick(value); setOpen(false); }}>
              <Icon size={18} />{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ user, switchTargets }: { user: ShellUser; switchTargets: SwitchTarget[] }) {
  const router = useRouter();
  const [impersonate, switching, switchError] = useImpersonate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="cab-pop" ref={ref}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={open}
        aria-label="Меню аккаунта" onClick={() => setOpen((v) => !v)}>
        {(user.name || user.contact).slice(0, 1)}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.name || user.contact}</strong>
            <span>{user.platformAdmin ? 'Администратор платформы' : user.contact}</span>
          </div>
          <Link href="/account" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <IconUser size={18} />Профиль и настройки
          </Link>
          <Link href="/" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <IconBack size={18} />На сайт
          </Link>
          {user.platformAdmin && <SwitchSection targets={switchTargets} busy={switching} error={switchError}
            onPick={(t) => impersonate(t.userId, t.orgSlug)} onOther={() => setOpen(false)} />}
          <div className="menu-sep" />
          <button type="button" className="menu-item" role="menuitem" onClick={logout}>
            <IconLogout size={18} />Выйти
          </button>
        </div>
      )}
    </div>
  );
}

/** «Войти как» в меню админа платформы: быстрые роли по школам и переход к поиску людей. */
function SwitchSection({ targets, busy, error, onPick, onOther }: {
  targets: SwitchTarget[]; busy: boolean; error: string;
  onPick: (t: SwitchTarget) => void; onOther: () => void;
}) {
  const orgs = [...new Set(targets.map((t) => t.orgName))];
  return (
    <>
      <div className="menu-sep" />
      <div className="menu-sub">Войти как</div>
      {orgs.map((org) => (
        <div key={org}>
          {orgs.length > 1 && <div className="menu-sub">{org}</div>}
          {targets.filter((t) => t.orgName === org).map((t) => (
            <button key={t.userId + t.role} type="button" className="menu-item" role="menuitem" disabled={busy}
              title={`${ORG_ROLE_LABELS[t.role]}: ${t.label}`} onClick={() => onPick(t)}>
              <IconUser size={18} />{ORG_ROLE_LABELS[t.role]} · {t.label}
            </button>
          ))}
        </div>
      ))}
      <Link href="/admin/users" className="menu-item" role="menuitem" onClick={onOther}>
        <IconPeople size={18} />Другой человек…
      </Link>
      {error && <div className="menu-sub" role="alert">{error}</div>}
    </>
  );
}
