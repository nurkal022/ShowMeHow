import { localizeSection, sectionByKey, type Instrument, type Level, type Style } from './data';
import { translator } from '@/i18n/core';
import type { Locale } from '@/i18n/config';
import { workbenchStand } from '@/i18n/messages/workbench-stand';

export interface ConstructorDraft {
  section: string;
  phenomenon: string;
  mode: '2d' | '3d';
  style: Style;
  /** Выбранные параметры; пустой массив означает «предложи сам». */
  parameters: string[];
  /** Приборы кита, которые должны появиться в симуляции. */
  instruments: Instrument[];
  /** Свободные пожелания: то, чего нет ни в одном списке. */
  notes: string;
  level: Level;
}

/**
 * Приборы урока подсказывают уровень тренажёра: задание — это исследование, шаги
 * и таблица — лаборатория. Подсказка, а не приказ: планировщик волен решить иначе.
 */
export function levelHint(instruments: Instrument[]): 'lab' | 'research' | null {
  if (instruments.includes('task')) return 'research';
  if (instruments.includes('lesson') || instruments.includes('table')) return 'lab';
  return null;
}

/**
 * Готов ли запрос к отправке. Достаточно ЛИБО раздела, ЛИБО своих слов: явление
 * выбирать не обязательно — «покажи что-нибудь из оптики» это законный запрос,
 * и блокировать кнопку из-за незаполненного поля значит ограничивать там, где
 * стенд обещал не ограничивать.
 */
export function isComplete(d: Partial<ConstructorDraft>): boolean {
  return !!(d.section || d.phenomenon?.trim() || d.notes?.trim());
}

/**
 * Собирает связный текст на языке интерфейса, а не список полей: планировщик получает его
 * наравне с тем, что человек набрал бы руками.
 *
 * В конец добавляется короткий структурный блок. Планировщик всё равно строит
 * PlanSpec из текста, но по блоку он видит выбор однозначно — и обещанный
 * стендом ползунок не теряется в пересказе. Свободные пожелания идут ПОСЛЕ
 * блока и последними: то, что человек дописал сам, весит больше любого выбора
 * из списка.
 */
export function buildPrompt(d: ConstructorDraft, locale: Locale = 'ru'): string {
  const t = translator(workbenchStand, locale);
  const base = sectionByKey(d.section);
  const section = base ? localizeSection(base, locale) : undefined;
  const what = d.phenomenon.trim();
  // Явление не выбрано — раздел всё равно задаёт тему, а выбор показательного
  // явления внутри неё остаётся за моделью.
  const topic = section
    ? (what
      ? t('pTopicWhat', { section: section.label.toLowerCase(), what })
      : t('pTopicSection', { section: section.label.toLowerCase() }))
    : what || t('pTopicNone');
  const modeText = d.mode === '3d' ? t('pMode3d') : t('pMode2d');
  const params = d.parameters.length
    ? t('pParams', { list: d.parameters.join(', ') })
    : t('pParamsAuto');
  const tools = d.instruments.length
    ? t('pTools', { list: d.instruments.map((i) => t(`pInst_${i}`)).join(', ') })
    : '';

  const prose = [
    t('pMake', { topic }),
    t('pScene', { mode: modeText, style: t(`pStyle_${d.style}`) }),
    params,
    tools,
    t('pLevel', { level: t(`pLevel_${d.level}`) }),
  ].filter(Boolean).join(' ');

  const hint = levelHint(d.instruments);
  const spec = [
    t('pSpecHead'),
    t('pSpecMode', { mode: d.mode }),
    ...(hint ? [t('pSpecLevel', { hint })] : []),
    t('pSpecParams', { list: d.parameters.length ? d.parameters.join(', ') : t('pYourChoice') }),
    t('pSpecTools', { list: d.instruments.length
      ? d.instruments.map((i) => t(`inst_${i}`)).join(', ')
      : t('pYourChoice') }),
  ].join('\n');

  const extra = d.notes.trim() ? `\n\n${t('pExtra', { notes: d.notes.trim() })}` : '';
  return `${prose}\n\n${spec}${extra}`;
}

/**
 * Свои слова, разбитые на короткие куски для выносок на сцене. Показываем
 * человеку, что дописанное услышано, ещё до генерации.
 */
export function noteTags(notes: string): string[] {
  return notes
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.length > 22 ? `${s.slice(0, 21)}…` : s));
}
