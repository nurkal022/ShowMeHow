import { INSTRUMENTS, sectionByKey, type Instrument, type Level, type Style } from './data';

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

const STYLE_TEXT: Record<Style, string> = {
  schematic: 'в схематичной подаче: векторы, оси, подписанные обозначения, минимум декора, как в учебнике',
  realistic: 'реалистично: объекты похожи на настоящие, с материалами, тенями и правильными пропорциями',
  data: 'с упором на данные: главное — живые графики и числовые показания, сама картинка второстепенна',
};

const LEVEL_TEXT: Record<Level, string> = {
  grade7to9: 'для 7-9 класса: простые формулы, бытовые аналогии, без интегралов и векторной записи',
  grade10to11: 'для 10-11 класса: формулы в общем виде, обозначения из школьного курса, можно векторы',
  students: 'для студентов: строгие формулировки, уравнения движения, допускается математический аппарат вуза',
};

const INSTRUMENT_TEXT: Record<Instrument, string> = {
  slider: 'ползунки для параметров',
  readout: 'числовые показания величин',
  chart: 'живой график',
  formula: 'формулу закона с подстановкой значений',
  presets: 'пресеты — готовые состояния',
  steps: 'пошаговый режим: кнопка «следующий шаг» вместо непрерывного потока',
};

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
 * Собирает связный русский текст, а не список полей: планировщик получает его
 * наравне с тем, что человек набрал бы руками.
 *
 * В конец добавляется короткий структурный блок. Планировщик всё равно строит
 * PlanSpec из текста, но по блоку он видит выбор однозначно — и обещанный
 * стендом ползунок не теряется в пересказе. Свободные пожелания идут ПОСЛЕ
 * блока и последними: то, что человек дописал сам, весит больше любого выбора
 * из списка.
 */
export function buildPrompt(d: ConstructorDraft): string {
  const section = sectionByKey(d.section);
  const what = d.phenomenon.trim();
  // Явление не выбрано — раздел всё равно задаёт тему, а выбор показательного
  // явления внутри неё остаётся за моделью.
  const topic = section
    ? (what
      ? `${section.label.toLowerCase()}: ${what}`
      : `${section.label.toLowerCase()} — выбери сам показательное явление раздела`)
    : what || 'выбери сам тему, которую интереснее всего показать в движении';
  const modeText = d.mode === '3d' ? 'трёхмерная (3D)' : 'плоская (2D)';
  const params = d.parameters.length
    ? `Управляемые параметры на ползунках: ${d.parameters.join(', ')}.`
    : 'Подбери сам два-четыре параметра, которые лучше всего показывают суть явления, и вынеси их на ползунки.';
  const tools = d.instruments.length
    ? `Приборы: ${d.instruments.map((i) => INSTRUMENT_TEXT[i]).join(', ')}.`
    : '';

  const prose = [
    `Сделай интерактивную симуляцию, ${topic}.`,
    `Сцена ${modeText}, ${STYLE_TEXT[d.style]}.`,
    params,
    tools,
    `Уровень объяснения — ${LEVEL_TEXT[d.level]}.`,
  ].filter(Boolean).join(' ');

  const spec = [
    'Выбор в конструкторе:',
    `- режим: ${d.mode}`,
    `- параметры: ${d.parameters.length ? d.parameters.join(', ') : 'на твоё усмотрение'}`,
    `- приборы: ${d.instruments.length
      ? d.instruments.map((i) => INSTRUMENTS.find((x) => x.value === i)?.label ?? i).join(', ')
      : 'на твоё усмотрение'}`,
  ].join('\n');

  const extra = d.notes.trim() ? `\n\nОтдельно важно: ${d.notes.trim()}` : '';
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
