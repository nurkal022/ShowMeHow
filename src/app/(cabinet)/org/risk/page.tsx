import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { studentRisks } from '@/lib/org/reports';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import RiskBoard from '@/components/org/RiskBoard';
import { Ring } from '@/components/cabinet/viz';
import { getT } from '@/i18n/server';
import { org } from '@/i18n/messages/org';

/** Раннее предупреждение: у кого риск отстать и почему — до того, как это видно в оценках. */
export default async function RiskPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/risk', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const t = await getT(org);
  const risks = await studentRisks(m.orgId);
  const n = (l: string) => risks.filter((r) => r.level === l).length;
  const share = (x: number) => (risks.length ? Math.round((x / risks.length) * 100) : 0);
  return (
    <>
      <CabinetHeader title={t('riskTitle')} subtitle={t('riskSub', { org: m.orgName, n: risks.length })} />
      <section className="risk-summary">
        <div className={n('high') ? 'risk-tile high' : 'risk-tile'}><Ring value={share(n('high'))} size={64} stroke={6} tone="var(--danger)" label={t('riskHighRing', { n: n('high') })}><b>{n('high')}</b></Ring><div><strong>{t('riskHigh')}</strong><span className="muted">{t('riskHighHint')}</span></div></div>
        <div className="risk-tile medium"><Ring value={share(n('medium'))} size={64} stroke={6} tone="#eb6834" label={t('riskMediumRing', { n: n('medium') })}><b>{n('medium')}</b></Ring><div><strong>{t('riskMedium')}</strong><span className="muted">{t('riskMediumHint')}</span></div></div>
        <div className="risk-tile low"><Ring value={share(n('low'))} size={64} stroke={6} tone="var(--cab-amber)" label={t('riskLowRing', { n: n('low') })}><b>{n('low')}</b></Ring><div><strong>{t('riskLow')}</strong><span className="muted">{t('riskLowHint')}</span></div></div>
        <div className="risk-tile ok"><Ring value={share(n('ok'))} size={64} stroke={6} tone="var(--success)" label={t('riskOkRing', { n: n('ok') })}><b>{n('ok')}</b></Ring><div><strong>{t('riskOk')}</strong><span className="muted">{t('riskOkHint')}</span></div></div>
      </section>
      <RiskBoard slug={m.orgSlug} students={risks} />
      <p className="muted risk-note">{t('riskNote')}</p>
    </>
  );
}
