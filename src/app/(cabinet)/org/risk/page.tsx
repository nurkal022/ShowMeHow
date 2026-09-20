import type { SearchParams } from '@/lib/http/params';
import { requireCabinet } from '@/lib/http/org-page';
import { studentRisks } from '@/lib/org/reports';
import CabinetHeader from '@/components/cabinet/CabinetHeader';
import RiskBoard from '@/components/org/RiskBoard';
import { Ring } from '@/components/cabinet/viz';

/** Раннее предупреждение: у кого риск отстать и почему — до того, как это видно в оценках. */
export default async function RiskPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireCabinet('/org/risk', ['org_admin'], searchParams);
  if (!ctx) return null;
  const m = ctx.cabinet.membership;
  const risks = await studentRisks(m.orgId);
  const n = (l: string) => risks.filter((r) => r.level === l).length;
  const share = (x: number) => (risks.length ? Math.round((x / risks.length) * 100) : 0);
  return (
    <>
      <CabinetHeader title="Раннее предупреждение" subtitle={`${m.orgName} · ${risks.length} учеников · считается по заходам, срокам, баллам и их динамике`} />
      <section className="risk-summary">
        <div className={n('high') ? 'risk-tile high' : 'risk-tile'}><Ring value={share(n('high'))} size={64} stroke={6} tone="var(--danger)" label={`Высокий риск: ${n('high')}`}><b>{n('high')}</b></Ring><div><strong>Высокий риск</strong><span className="muted">нужен разговор на этой неделе</span></div></div>
        <div className="risk-tile medium"><Ring value={share(n('medium'))} size={64} stroke={6} tone="#eb6834" label={`Средний риск: ${n('medium')}`}><b>{n('medium')}</b></Ring><div><strong>Средний</strong><span className="muted">стоит присмотреться</span></div></div>
        <div className="risk-tile low"><Ring value={share(n('low'))} size={64} stroke={6} tone="var(--cab-amber)" label={`Низкий риск: ${n('low')}`}><b>{n('low')}</b></Ring><div><strong>Низкий</strong><span className="muted">единичные сигналы</span></div></div>
        <div className="risk-tile ok"><Ring value={share(n('ok'))} size={64} stroke={6} tone="var(--success)" label={`Без риска: ${n('ok')}`}><b>{n('ok')}</b></Ring><div><strong>В порядке</strong><span className="muted">занимаются стабильно</span></div></div>
      </section>
      <RiskBoard slug={m.orgSlug} students={risks} />
      <p className="muted risk-note">Балл риска — сумма понятных причин (не заходит, пропущены сроки, низкий или падающий балл, работы на доработке). Это подсказка для разговора, а не оценка ученика.</p>
    </>
  );
}
