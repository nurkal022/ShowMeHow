import type { PlanSpec, RenderReport } from '../types';
import { coverageFailures } from './stages';
import { listSections } from './sections';

export interface QualityItem { id: string; label: string; status: 'pass' | 'fail' | 'skip'; detail: string }

export interface QualityReport {
  items: QualityItem[];
  passed: number;
  failed: number;
  /** Готовая просьба на починку проваленного — уходит доработкой как обычный текст. */
  fixInstruction: string | null;
}

/**
 * Сводка качества для человека: запуск, пробы поведения, сверка с планом и устройство
 * тренажёра (есть ли разметка, ядро, урок). Порядок — от «не работает» к «чего не хватает».
 */
export function qualityReport(report: RenderReport, spec: PlanSpec | null, html: string): QualityReport {
  const items: QualityItem[] = [];
  items.push({
    id: 'runs', label: 'Запускается без ошибок', status: report.ok ? 'pass' : 'fail',
    detail: report.ok ? '' : report.errors.slice(0, 3).join('; '),
  });
  items.push({
    id: 'moves', label: 'Анимация идёт', status: report.animated ? 'pass' : 'fail',
    detail: report.animated ? '' : 'кадры не меняются со временем',
  });
  for (const r of report.probes?.results ?? []) {
    if (r.id === 'animates') continue;
    items.push({ id: r.id, label: r.label, status: r.status, detail: r.detail });
  }
  if (spec) {
    const gaps = coverageFailures(spec, report);
    items.push({
      id: 'coverage', label: 'Всё из плана на месте', status: gaps.length ? 'fail' : 'pass', detail: gaps.join('; '),
    });
  }
  const sections = new Set(listSections(html).map((s) => s.name));
  if (spec && spec.level && spec.level !== 'demo') {
    items.push({
      id: 'lesson', label: 'Есть сценарий урока', status: sections.has('scenario') ? 'pass' : 'fail',
      detail: sections.has('scenario') ? '' : 'в плане есть шаги урока, а в тренажёре их нет',
    });
  }
  items.push({
    id: 'structure', label: 'Размечен по частям (правится точнее)',
    status: sections.size ? 'pass' : 'skip',
    detail: sections.size ? [...sections].join(', ') : 'старый тренажёр без разметки — правится целиком',
  });
  const failed = items.filter((i) => i.status === 'fail');
  return {
    items,
    passed: items.filter((i) => i.status === 'pass').length,
    failed: failed.length,
    fixInstruction: failed.length
      ? 'Исправь проваленные проверки качества, остальное не трогай:\n- ' +
        failed.map((i) => (i.detail ? `${i.label}: ${i.detail}` : i.label)).join('\n- ')
      : null,
  };
}
