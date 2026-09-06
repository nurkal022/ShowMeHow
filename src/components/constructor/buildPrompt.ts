import { sectionByKey, type Level, type Style } from './data';

export interface ConstructorDraft {
  section: string;
  phenomenon: string;
  mode: '2d' | '3d';
  style: Style;
  /** Выбранные параметры; пустой массив означает «предложи сам». */
  parameters: string[];
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

/** Обязательны раздел, явление, режим, стиль и уровень; параметры — нет. */
export function isComplete(d: Partial<ConstructorDraft>): boolean {
  return !!(d.section && d.phenomenon?.trim() && d.mode && d.style && d.level);
}

/**
 * Собирает связный русский текст, а не список полей: планировщик получает его
 * наравне с тем, что человек набрал бы руками.
 */
export function buildPrompt(d: ConstructorDraft): string {
  const section = sectionByKey(d.section);
  const topic = section ? `${section.label.toLowerCase()}: ${d.phenomenon.trim()}` : d.phenomenon.trim();
  const modeText = d.mode === '3d' ? 'трёхмерная (3D)' : 'плоская (2D)';
  const params = d.parameters.length
    ? `Управляемые параметры на ползунках: ${d.parameters.join(', ')}.`
    : 'Подбери сам два-четыре параметра, которые лучше всего показывают суть явления, и вынеси их на ползунки.';
  return [
    `Сделай интерактивную симуляцию, ${topic}.`,
    `Сцена ${modeText}, ${STYLE_TEXT[d.style]}.`,
    params,
    `Уровень объяснения — ${LEVEL_TEXT[d.level]}.`,
  ].join(' ');
}
