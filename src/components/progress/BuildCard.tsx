'use client';
import { useState } from 'react';
import type { LayerInfo, ProgressState } from './deriveProgress';
import { IconCheck, IconMinus } from '../icons';
import { useFormat, useT } from '@/i18n/client';
import { workbenchProgress } from '@/i18n/messages/workbench-progress';


/**
 * Как собирается тренажёр: ядро физики с числовыми проверками и слои поверх основы.
 * Раньше человек видел только «генерируем…» — теперь видно, что физика проверена
 * числами до того, как нарисована сцена, и какие части достраиваются.
 */
export default function BuildCard({ physics, layers }: {
  physics: ProgressState['physicsCheck'];
  layers: LayerInfo[];
}) {
  const [open, setOpen] = useState(false);
  const t = useT(workbenchProgress);
  const f = useFormat();
  if (!physics && layers.length === 0) return null;
  const passed = physics ? physics.results.filter((r) => r.ok).length : 0;
  // Мягкий провал (параметр — настройка опыта, а не физика) не красит всё ядро в предупреждение.
  const hardOk = !!physics && physics.results.every((r) => r.ok || r.soft);
  return (
    <div className="build-card">
      {physics && (
        <div className={`build-row ${hardOk ? 'ok' : 'warn'}`}>
          <span className="build-dot" aria-hidden>{hardOk ? <IconCheck size={13} /> : '!'}</span>
          <button type="button" className="build-title" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {t('physicsChecks', { passed, total: physics.results.length })}
          </button>
        </div>
      )}
      {physics && open && (
        <ul className="build-checks">
          {physics.results.map((r, i) => (
            <li key={i} className={r.ok ? 'ok' : r.soft ? 'soft' : 'fail'}>
              {r.ok ? <IconCheck size={12} /> : <IconMinus size={12} />}
              <span>{f.message(r.label)}{!r.ok && r.detail ? ` — ${f.message(r.detail)}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {layers.map((l) => (
        <div key={l.name} className={`build-row layer-${l.status}`}>
          <span className="build-dot" aria-hidden>
            {l.status === 'ok' ? <IconCheck size={13} /> : l.status === 'skipped' ? <IconMinus size={13} /> : ''}
          </span>
          <span className="build-title">
            {l.status === 'start' ? t('layerBuilding', { title: f.message(l.title) }) : l.status === 'skipped' ? t('layerSkipped', { title: f.message(l.title) }) : f.message(l.title)}
          </span>
        </div>
      ))}
    </div>
  );
}
