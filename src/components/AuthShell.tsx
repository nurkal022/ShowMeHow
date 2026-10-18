import { getLocale } from '@/i18n/server';
import { translator } from '@/i18n/core';
import { auth } from '@/i18n/messages/auth';
import { landingAsset } from '@/lib/public-assets';

/**
 * Вход и регистрация в стиле «Космос»: слева картинка с обещанием продукта, справа форма
 * на стекле. На телефоне картинка становится узкой шапкой над формой. Своя картинка
 * (auth-login/auth-register, см. materials/landing-images.md) заменяет запасную из лендинга, когда положена.
 */
export default async function AuthShell({ mode, children }: { mode: 'login' | 'register'; children: React.ReactNode }) {
  const t = translator(auth, await getLocale());
  const own = landingAsset(mode === 'login' ? 'auth-login.webp' : 'auth-register.webp');
  const art = own ?? (mode === 'login' ? '/landing/bg-space.webp' : '/landing/bg-eng.webp');
  return (
    <div className="space space-auth">
      <div className="space-auth-art" style={{ ['--art' as string]: `url(${art})` }}>
        <h2>{mode === 'login' ? t('artLogin') : t('artRegister')}</h2>
        <p>{t('artLead')}</p>
        <div className="space-auth-facts"><span>{t('artFact1')}</span><span>{t('artFact2')}</span><span>{t('artFact3')}</span></div>
      </div>
      <div className="space-auth-form">{children}</div>
    </div>
  );
}
