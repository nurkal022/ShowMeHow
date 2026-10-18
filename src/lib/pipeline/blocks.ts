import type { PlanSpec, PlanObservable, PlanView } from '../types';
import { levelOf } from './spec';

/**
 * Блоки тренажёра решает код, а не модель. По плану собираются секции controls и
 * instruments: слайдеры всех параметров, пресеты, показания величин и главный график —
 * всё привязано к PHYS.observe() по именам (key), без кода обновления. Модели остаётся
 * сцена, формула и то, что требует смысла (баннер фаз, кнопки действий).
 *
 * Так слабая модель не пропускает параметр, не путает имена и не тратит ответ на
 * шаблонный код: генерация короче и быстрее, а приборы одинаково аккуратны у всех.
 */

/** JSON для вставки в <script>: «</script>» в подписи закрыл бы тег раньше времени. */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/** Величины, которые не показываем отдельной строкой: время и номер фазы. */
function isService(name: string): boolean {
  // «t» — только строчная: «T» — температура или период, её показываем.
  return name === 't' || /^(time|phase|stage|mode|step|index)$/i.test(name);
}

/** Есть ли у процесса фазы/такты — тогда нужен баннер текущей фазы. */
export function hasPhases(spec: PlanSpec): boolean {
  const text = [spec.physics, spec.visualPlan, ...(spec.entities ?? []).map((e) => e.role), ...(spec.observables ?? []).map((o) => o.name + ' ' + o.label)]
    .join(' ').toLowerCase();
  return /фаз|такт|стади|этап|режим|цикл |phase|stroke|stage/.test(text);
}

/**
 * Главный график: оси из плана, иначе — величины с той же единицей, что и первая (энергии, давления).
 * sweep: по оси x — параметр, а не время: это кривая «величина от параметра» (SimUI.sweep).
 */
export function mainChart(spec: PlanSpec): { title: string; x: string; y: string[]; sweep?: boolean } | null {
  const obs = (spec.observables ?? []).filter((o) => !isService(o.name));
  const view = (spec.views ?? []).find((v) => v.kind === 'chart');
  if (view?.y?.length) {
    const x = view.x ?? 't';
    const sweep = spec.parameters.some((p) => p.name === x);
    return sweep ? { title: view.title, x, y: view.y, sweep } : { title: view.title, x, y: view.y };
  }
  if (!obs.length) return null;
  const first = obs[0];
  const same = obs.filter((o) => o.unit && o.unit === first.unit).slice(0, 3);
  const y = (same.length > 1 ? same : [first]).map((o) => o.name);
  return { title: view?.title || `${first.label} от времени`, x: 't', y };
}

function labelOf(spec: PlanSpec, name: string): { label: string; unit: string } {
  const o = spec.observables?.find((x) => x.name === name);
  if (o) return { label: o.label, unit: o.unit };
  const p = spec.parameters.find((x) => x.name === name);
  if (p) return { label: p.label, unit: p.unit };
  return { label: name === 't' ? 'Время' : name, unit: name === 't' ? 'с' : '' };
}

function axis(spec: PlanSpec, name: string): string {
  const { label, unit } = labelOf(spec, name);
  const short = name.length <= 3 ? name : label;
  return unit ? `${short}, ${unit}` : short;
}

const COLORS = ['blue', 'orange', 'green', 'purple', 'cyan', 'pink'];

export interface Scaffold { controls: string; instruments: string; keys: string[] }

/** Секции controls и instruments по плану. keys — имена, которые обязан вернуть PHYS.observe(). */
export function scaffold(spec: PlanSpec): Scaffold {
  const params = spec.parameters.map((p) => {
    const o: Record<string, unknown> = { name: p.name, label: p.label, min: p.min, max: p.max, step: p.step, value: p.value, unit: p.unit };
    if (p.group) o.group = p.group;
    return '    ' + js(o).replace(/"([A-Za-z_]+)":/g, '$1: ');
  });
  const controls = [
    `  SimUI.title(${js(spec.title)});`,
    spec.learningGoals.length ? `  SimUI.goals(${js(spec.learningGoals)});` : '',
    `  SimUI.params(P, [\n${params.join(',\n')},\n  ]);`,
    spec.presets?.length ? `  SimUI.presets(${js(spec.presets.map((p) => ({ label: p.label, values: p.values })))});` : '',
  ].filter(Boolean).join('\n');

  const obs: PlanObservable[] = (spec.observables ?? []).filter((o) => !isService(o.name)).slice(0, 6);
  const lines: string[] = [];
  if (obs.length) {
    const map: Record<string, { label: string; unit: string }> = {};
    for (const o of obs) map[o.name] = { label: o.label, unit: o.unit };
    lines.push(`  SimUI.readouts(${js(map)});`);
  }
  const chart = mainChart(spec);
  if (chart) {
    const series = chart.y.map((k, i) => ({ name: labelOf(spec, k).label, color: COLORS[i % COLORS.length] }));
    const labels = { xLabel: axis(spec, chart.x), yLabel: chart.y.length === 1 ? axis(spec, chart.y[0]) : labelOf(spec, chart.y[0]).unit };
    if (chart.sweep) {
      lines.push(`  SimUI.sweep(${js({ title: chart.title, param: chart.x, y: chart.y, series, ...labels })});`);
      // Кривая от параметра не показывает процесс во времени — рядом нужен живой график первой величины.
      const live = obs.find((o) => !chart.y.includes(o.name)) ?? obs[0];
      if (live) lines.push(`  SimUI.chart(${js({ title: `${live.label} от времени`, x: 't', y: [live.name], series: [{ name: live.label, color: 'orange' }], xLabel: 't, с', yLabel: axis(spec, live.name), collapsed: true })});`);
    } else {
      lines.push(`  SimUI.chart(${js({ title: chart.title, x: chart.x, y: chart.y, series, ...labels })});`);
    }
  }
  if (spec.presentation === 'phases' && spec.phases?.length) {
    const colors = ['blue', 'yellow', 'purple', 'cyan', 'orange', 'gray', 'green', 'pink'];
    lines.push(`  SimUI.phases(${js({ key: 'phase', mode: 'step',
      items: spec.phases.map((p, i) => ({ name: p.name, text: p.text, color: colors[i % colors.length] })) })});`);
  }
  const keys = ['t', ...obs.map((o) => o.name), ...(chart ? [chart.x, ...chart.y] : []),
    ...(spec.presentation === 'phases' && spec.phases?.length ? ['phase'] : [])];
  return { controls, instruments: lines.join('\n'), keys: [...new Set(keys)] };
}

/** Что модель должна дописать сама — коротко, по признакам плана. */
export function blockHints(spec: PlanSpec): string[] {
  const hints = ['SimUI.formula с главным уравнением из spec.physics; vars — ключи параметров и величин, их значения подставятся сами.'];
  if (spec.presentation === 'phases' && spec.phases?.length) {
    hints.push(`показ по фазам уже собран (SimUI.phases): observe.phase — номер фазы 0..${spec.phases.length - 1} по порядку плана; ` +
      'сцена должна наглядно отличать фазы (клапаны, искра, цвет газа, подписи), баннер фаз НЕ добавляй.');
  } else if (hasPhases(spec)) hints.push('SimUI.banner с фазами процесса и phase: ключ observe с номером фазы (добавь его в observe, если нет).');
  const phase = (spec.views ?? []).find((v: PlanView) => v.kind === 'phase');
  if (phase && levelOf(spec) === 'demo') hints.push(`фазовая диаграмма «${phase.title}»: SimUI.chart({mode:'xy', x, y}).`);
  if (spec.wowMoment) hints.push(`вау-момент «${spec.wowMoment}» — сделай заметным: SimUI.toast в момент события или view.tex/подсветка на сцене.`);
  return hints;
}

/** Бриф для генератора: готовые секции и что дописать. */
export function scaffoldBrief(spec: PlanSpec): string {
  const s = scaffold(spec);
  return `

Секции controls и instruments уже собраны из плана — вставь их ДОСЛОВНО в свои маркеры. Приборы привязаны
по key к PHYS.observe(), поэтому observe обязан возвращать числами: ${s.keys.join(', ')}.
\`\`\`js
  // ==== @section controls ====
${s.controls}
  // ==== @end controls ====

  // ==== @section instruments ====
${s.instruments}
  // ==== @end instruments ====
\`\`\`
В instruments допиши:
- ${blockHints(spec).join('\n- ')}`;
}
