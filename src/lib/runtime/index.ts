export { HARNESS_JS } from './harness';
export { UIKIT_DOC } from './doc';
import { UIKIT_CSS as KIT_CSS } from './kit-css';
import { KIT_CORE_JS } from './kit-core';
import { KIT_CHART_JS } from './kit-chart';
import { KIT_WIDGETS_JS } from './kit-widgets';
import { KIT_LESSON_JS, KIT_LESSON_CSS } from './kit-lesson';
import { KIT_EXPOSE_JS } from './kit-expose';
import { SIMPHYS_JS, KIT_THREE_JS } from './kit-phys';

export const UIKIT_CSS = KIT_CSS + KIT_LESSON_CSS;

/**
 * Полный JS UI-kit'а. Первым идёт SimPhys — физические помощники, которыми пользуется ядро PHYS. Собирается конкатенацией ES5-чанков: ядро, затем виджеты
 * (график, показания, формула и т.д.), виджеты урока с наложением настроек, 3D-сцена и мост
 * интроспекции. Порядок важен — чанки обращаются к уже созданному window.SimUI.
 */
export const UIKIT_JS = [SIMPHYS_JS, KIT_CORE_JS, KIT_CHART_JS, KIT_WIDGETS_JS, KIT_LESSON_JS, KIT_THREE_JS, KIT_EXPOSE_JS].join('\n');
