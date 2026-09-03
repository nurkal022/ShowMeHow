export { HARNESS_JS } from './harness';
export { UIKIT_CSS } from './kit-css';
export { UIKIT_DOC } from './doc';
import { KIT_CORE_JS } from './kit-core';
import { KIT_CHART_JS } from './kit-chart';
import { KIT_WIDGETS_JS } from './kit-widgets';
import { KIT_EXPOSE_JS } from './kit-expose';

/**
 * Полный JS UI-kit'а. Собирается конкатенацией ES5-чанков: ядро, затем виджеты
 * (график, показания, формула и т.д.) и мост интроспекции. Порядок важен — чанки
 * обращаются к уже созданному window.SimUI.
 */
export const UIKIT_JS = [KIT_CORE_JS, KIT_CHART_JS, KIT_WIDGETS_JS, KIT_EXPOSE_JS].join('\n');
