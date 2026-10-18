export { HARNESS_JS } from './harness';
export { UIKIT_DOC } from './doc';
import { UIKIT_CSS as KIT_CSS } from './kit-css';
import { KIT_CORE_JS } from './kit-core';
import { KIT_CHART_JS } from './kit-chart';
import { KIT_WIDGETS_JS } from './kit-widgets';
import { KIT_LESSON_JS, KIT_LESSON_CSS } from './kit-lesson';
import { KIT_EXPOSE_JS } from './kit-expose';
import { SIMPHYS_JS, KIT_THREE_JS } from './kit-phys';
import { KIT_I18N_JS } from './kit-i18n';
import { KIT_VIEW2D_JS } from './kit-view2d';
import { KIT_RUN_JS } from './kit-run';
import { KIT_GUARD_JS } from './kit-guard';
import { KIT_PHASES_JS, KIT_PHASES_CSS } from './kit-phases';

export const UIKIT_CSS = KIT_CSS + KIT_LESSON_CSS + KIT_PHASES_CSS;

/**
 * Полный JS UI-kit'а. Первым идёт словарь подписей (__simT, язык — data-sim-lang), затем SimPhys — физические помощники, которыми пользуется ядро PHYS. Собирается конкатенацией ES5-чанков: ядро, затем виджеты
 * (показания, формула и т.д.), палитра и 2D-сцена, график, виджеты урока с наложением настроек,
 * 3D-сцена, мост интроспекции, главный цикл SimUI.run и последней — страховка от выдуманного API
 * (оборачивает window.SimUI в Proxy). Порядок важен — чанки обращаются к уже созданному window.SimUI.
 */
export const UIKIT_JS = compact([
  KIT_I18N_JS, SIMPHYS_JS, KIT_CORE_JS, KIT_WIDGETS_JS, KIT_VIEW2D_JS, KIT_CHART_JS, KIT_LESSON_JS, KIT_THREE_JS,
  KIT_EXPOSE_JS, KIT_PHASES_JS, KIT_RUN_JS, KIT_GUARD_JS,
].join('\n'));

/**
 * Кит уходит в каждый артефакт и в каждую проверку: без отступов и строк-комментариев
 * он на четверть легче. Код не трогается — только целые строки комментариев и ведущие пробелы.
 */
export function compact(js: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of js.split('\n')) {
    const line = raw.trim();
    if (inBlock) { if (line.includes('*/')) inBlock = false; continue; }
    if (line.startsWith('/*')) { if (!line.includes('*/')) inBlock = true; continue; }
    if (line === '' || line.startsWith('//')) continue;
    out.push(line);
  }
  return out.join('\n');
}
