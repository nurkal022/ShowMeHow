import { requireAdminPage } from '@/lib/http/page-guards';
import { getPlatformSettings, usageByOrg } from '@/lib/platform-settings';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import RegistrationToggle from '@/components/admin/RegistrationToggle';

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default async function AdminSettingsPage() {
  const admin = await requireAdminPage('/admin/settings');
  if (!admin) return null;
  const [settings, usage] = await Promise.all([getPlatformSettings(), usageByOrg(30)]);
  const total = usage.reduce((a, r) => a + r.tokens, 0);
  return (
    <>
      <CabinetHeader title="Настройки платформы" subtitle="Доступ и расход — без правки конфигов на сервере" />
      <section className="panel">
        <h2>Доступ</h2>
        <RegistrationToggle open={settings.registrationOpen} />
      </section>
      <section className="cab-card">
        <header className="cab-card-head">
          <div><h2>Расход за 30 дней</h2><span className="muted">{`Всего токенов модели: ${fmt(total)}`}</span></div>
        </header>
        {usage.length === 0 ? <p className="muted cab-empty">Генераций за месяц не было.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Кто</th><th>Людей</th><th>Генераций</th><th>Токенов</th><th>Доля</th></tr></thead>
              <tbody>
                {usage.map((r) => {
                  const share = total ? Math.round((r.tokens / total) * 100) : 0;
                  return (
                    <tr key={r.orgName}>
                      <td data-label="Кто"><strong>{r.orgName}</strong></td>
                      <td data-label="Людей">{r.people}</td>
                      <td data-label="Генераций">{fmt(r.generations)}</td>
                      <td data-label="Токенов"><span className="num">{fmt(r.tokens)}</span></td>
                      <td data-label="Доля"><span className="usage-share"><i style={{ width: `${share}%` }} /></span>{`${share}%`}</td>
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
