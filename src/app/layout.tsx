import './globals.css';
import './motion.css';
import './landing.css';
import './trainer.css';
import RevealOnScroll from '@/components/motion/RevealOnScroll';
import CommandPalette from '@/components/CommandPalette';
import { paletteActions } from '@/lib/palette-actions';
import { listMemberships } from '@/lib/org/access';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { Brand } from '@/components/SiteChrome';
import ImpersonationBar from '@/components/ImpersonationBar';
import DemoBar from '@/components/DemoBar';
import { sandboxOf } from '@/lib/demo/access';
import { currentUserAllowingPasswordChangeFromCookies, impersonatorFromCookies } from '@/lib/auth/session';
import { userLabel } from '@/lib/auth/identifier';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import { getLocale } from '@/i18n/server';
import { LocaleProvider } from '@/i18n/client';

export async function generateMetadata() {
  const locale = await getLocale();
  const description = { ru: 'Интерактивные симуляции по описанию', kk: 'Сипаттама бойынша интерактивті симуляциялар', en: 'Interactive simulations from a description' }[locale];
  return { title: 'Tesseract', description };
}

/**
 * Корень держит только общее: html/body, тему, шрифты и подмену страницы формой
 * смены временного пароля. Шапку сайта рисует (site)/layout, оболочку кабинетов —
 * (cabinet)/layout: это две разные рамки вокруг одних и тех же адресов.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Разрешающий вариант: только layout узнаёт о временном пароле и подменяет страницу.
  const user = await currentUserAllowingPasswordChangeFromCookies();
  const locale = await getLocale();
  const mustChangePassword = !!user?.mustChangePassword;
  const impersonator = user ? await impersonatorFromCookies() : null;
  const memberships = user && !mustChangePassword ? await listMemberships(user.id) : [];
  const actions = user && !mustChangePassword ? paletteActions(user, memberships, locale) : null;
  // Демо-режим: у владельца песочницы — переключатель ролей; у пришедшего «посмотреть» без
  // организаций — приглашение её создать. Админ платформы пользуется обычным «Войти как».
  const demoOwner = impersonator ?? user;
  const box = demoOwner && !mustChangePassword && demoOwner.role !== 'admin' ? await sandboxOf(demoOwner.id) : null;
  const demoAs = impersonator && box ? memberships.find((m) => m.orgSlug === box.slug)?.role : null;
  const showDemo = !!box || (!!user && !impersonator && !mustChangePassword && user.role !== 'admin' && memberships.length === 0);
  return (
    // data-theme проставляет скрипт ниже до отрисовки, поэтому значение на сервере
    // и на клиенте расходится намеренно — предупреждение о гидрации здесь ложное.
    <html lang={locale} data-theme="light" suppressHydrationWarning>
      <head>
        {/* Тема применяется до первой отрисовки — иначе тёмная тема моргает белым. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        <LocaleProvider locale={locale}>
        {user && impersonator && !box && <ImpersonationBar viewer={userLabel(user)} />}
        {user && showDemo && (
          <DemoBar slug={box?.slug ?? null} viewer={userLabel(user)}
            as={demoAs === 'teacher' || demoAs === 'student' ? demoAs : null} />
        )}
        {user && mustChangePassword ? (
          // С временным паролем нет ни разделов, ни кабинета: только марка и форма.
          <>
            <nav className="topnav"><Brand /></nav>
            <main><ForcePasswordChange label={userLabel(user)} /></main>
          </>
        ) : children}
        <RevealOnScroll />
        {actions && <CommandPalette actions={actions} />}
        </LocaleProvider>
      </body>
    </html>
  );
}
