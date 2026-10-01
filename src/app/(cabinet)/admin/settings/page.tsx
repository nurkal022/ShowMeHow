import { requireAdminPage } from '@/lib/http/page-guards';
import { getPlatformSettings, usageByOrg } from '@/lib/platform-settings';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import RegistrationToggle from '@/components/admin/RegistrationToggle';
import { getLocale } from '@/i18n/server';
import { formatNumber, translator } from '@/i18n/core';
import { localizeMessage } from '@/i18n/catalog';
import { admin as adminDict } from '@/i18n/messages/admin';


export default async function AdminSettingsPage() {
  const admin = await requireAdminPage('/admin/settings');
  if (!admin) return null;
  const [settings, usage] = await Promise.all([getPlatformSettings(), usageByOrg(30)]);
  const total = usage.reduce((a, r) => a + r.tokens, 0);
  const locale = await getLocale();
  const t = translator(adminDict, locale);
  const fmt = (n: number) => formatNumber(n, locale);
  return (
    <>
      <CabinetHeader title={t('settingsTitle')} subtitle={t('settingsSub')} />
      <section className="panel">
        <h2>{t('access')}</h2>
        <RegistrationToggle open={settings.registrationOpen} />
      </section>
      <section className="cab-card">
        <header className="cab-card-head">
          <div><h2>{t('usage')}</h2><span className="muted">{t('usageTotal', { n: fmt(total) })}</span></div>
        </header>
        {usage.length === 0 ? <p className="muted cab-empty">{t('usageEmpty')}</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>{t('u_who')}</th><th>{t('u_people')}</th><th>{t('u_gens')}</th><th>{t('u_tokens')}</th><th>{t('u_share')}</th></tr></thead>
              <tbody>
                {usage.map((r) => {
                  const share = total ? Math.round((r.tokens / total) * 100) : 0;
                  return (
                    <tr key={r.orgName}>
                      <td data-label={t('u_who')}><strong>{localizeMessage(r.orgName, locale)}</strong></td>
                      <td data-label={t('u_people')}>{r.people}</td>
                      <td data-label={t('u_gens')}>{fmt(r.generations)}</td>
                      <td data-label={t('u_tokens')}><span className="num">{fmt(r.tokens)}</span></td>
                      <td data-label={t('u_share')}><span className="usage-share"><i style={{ width: `${share}%` }} /></span>{`${share}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
