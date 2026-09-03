export { HARNESS_JS } from './harness';
export { UIKIT_CSS } from './kit-css';
export { UIKIT_DOC } from './doc';
import { KIT_CORE_JS } from './kit-core';

/**
 * Полный JS UI-kit'а. Собирается конкатенацией ES5-чанков: ядро, затем виджеты
 * и мост интроспекции (добавляются следующими задачами). Порядок важен —
 * виджеты обращаются к уже созданному window.SimUI.
 */
export const UIKIT_JS = [KIT_CORE_JS].join('\n');
