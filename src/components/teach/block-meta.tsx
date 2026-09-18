import type { Block } from '@/lib/lms/blocks';
import {
  assignmentTitle, ASSIGNMENT_TYPE_LABELS, CALLOUT_TONE_LABELS, type AssignmentType, type BlockKind,
} from '@/lib/lms/block-schema';
import { LABS } from '@/lib/labs';
import {
  IconChoice, IconCode, IconDivider, IconEssay, IconFold, IconFormula, IconGaps, IconImage, IconLab, IconMatch,
  IconNumber, IconOrder, IconPlay, IconQuote, IconShort, IconTarget, IconTask, IconText, IconVideo,
} from '@/components/icons';

type Meta = { label: string; hint: string; icon: (size: number) => React.ReactNode };

/** Иконка, подпись и пояснение каждого типа блока — для карточек и меню «Добавить блок». */
export const BLOCK_META: Record<BlockKind, Meta> = {
  text: {
    label: 'Текст',
    hint: 'Объяснение с заголовками, списками, ссылками и формулами $…$.',
    icon: (size) => <IconText size={size} />,
  },
  callout: {
    label: 'Врезка',
    hint: 'Определение, важное, предупреждение или пример — цветной рамкой.',
    icon: (size) => <IconQuote size={size} />,
  },
  formula: {
    label: 'Формула',
    hint: 'Крупная формула на отдельной строке. Пишется в LaTeX, видна сразу.',
    icon: (size) => <IconFormula size={size} />,
  },
  image: {
    label: 'Картинка',
    hint: 'Схема, фото или график: перетащите файл или вставьте из буфера.',
    icon: (size) => <IconImage size={size} />,
  },
  video: {
    label: 'Видео',
    hint: 'YouTube, Vimeo, Rutube или прямая ссылка на файл.',
    icon: (size) => <IconVideo size={size} />,
  },
  code: {
    label: 'Код',
    hint: 'Листинг программы моноширинным шрифтом.',
    icon: (size) => <IconCode size={size} />,
  },
  spoiler: {
    label: 'Спойлер',
    hint: 'Решение или подсказка, скрытые до клика.',
    icon: (size) => <IconFold size={size} />,
  },
  divider: {
    label: 'Разделитель',
    hint: 'Черта между частями урока.',
    icon: (size) => <IconDivider size={size} />,
  },
  simulation: {
    label: 'Тренажёр',
    hint: 'Интерактивная симуляция из библиотеки, каталога или новая.',
    icon: (size) => <IconPlay size={size} />,
  },
  lab: {
    label: 'Лаборатория',
    hint: '3D-сцена: открывается в браузере и в очках.',
    icon: (size) => <IconLab size={size} />,
  },
  assignment: {
    label: 'Задание',
    hint: 'Вопрос с баллами.',
    icon: (size) => <IconTask size={size} />,
  },
};

export const ASSIGNMENT_META: Record<AssignmentType, Meta & { auto: boolean }> = {
  choice: { label: ASSIGNMENT_TYPE_LABELS.choice, auto: true, hint: 'Один или несколько вариантов.', icon: (s) => <IconChoice size={s} /> },
  short: { label: ASSIGNMENT_TYPE_LABELS.short, auto: true, hint: 'Слово или фраза; можно задать несколько написаний.', icon: (s) => <IconShort size={s} /> },
  number: { label: ASSIGNMENT_TYPE_LABELS.number, auto: true, hint: 'Число с допуском и единицами.', icon: (s) => <IconNumber size={s} /> },
  gaps: { label: ASSIGNMENT_TYPE_LABELS.gaps, auto: true, hint: 'Ученик вписывает слова в текст.', icon: (s) => <IconGaps size={s} /> },
  match: { label: ASSIGNMENT_TYPE_LABELS.match, auto: true, hint: 'Соединить пары: термин — определение.', icon: (s) => <IconMatch size={s} /> },
  order: { label: ASSIGNMENT_TYPE_LABELS.order, auto: true, hint: 'Расставить шаги в правильном порядке.', icon: (s) => <IconOrder size={s} /> },
  sim_state: { label: ASSIGNMENT_TYPE_LABELS.sim_state, auto: true, hint: 'Настроить симуляцию до заданной цели.', icon: (s) => <IconTarget size={s} /> },
  text: { label: ASSIGNMENT_TYPE_LABELS.text, auto: false, hint: 'Свободный текст — проверяете вы.', icon: (s) => <IconEssay size={s} /> },
};
export const ASSIGNMENT_TYPES = Object.keys(ASSIGNMENT_META) as AssignmentType[];

/** Группы меню вставки: так учитель ищет глазами, а не читает одиннадцать плиток подряд. */
export const BLOCK_GROUPS: { title: string; kinds: BlockKind[] }[] = [
  { title: 'Материал', kinds: ['text', 'callout', 'formula', 'image', 'video', 'code', 'spoiler', 'divider'] },
  { title: 'Интерактив', kinds: ['simulation', 'lab'] },
];

export function BlockKindIcon({ kind, size = 18, assignmentType }: { kind: BlockKind; size?: number; assignmentType?: AssignmentType }) {
  const icon = kind === 'assignment' && assignmentType ? ASSIGNMENT_META[assignmentType].icon : BLOCK_META[kind].icon;
  return <span className={`cf-kind cf-kind-${kind}`} aria-hidden="true">{icon(size)}</span>;
}

const flat = (s: string, max = 80) => {
  const t = s.replace(/[*#\[\]$]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3)}…` : t;
};

/** Одна строка о содержимом блока — для свёрнутой карточки. */
export function blockHeadline(block: Block, simulationTitle: string | null): string {
  const b = block.body;
  switch (b.kind) {
    case 'text':
      return b.payload.title || flat(b.payload.body) || 'Без текста';
    case 'callout':
      return b.payload.title || flat(b.payload.body) || CALLOUT_TONE_LABELS[b.payload.tone];
    case 'formula':
      return b.payload.caption || flat(b.payload.latex, 60) || 'Формула не написана';
    case 'image':
      return b.payload.caption || b.payload.alt || (b.payload.src ? 'Картинка' : 'Картинка не выбрана');
    case 'video':
      return b.payload.caption || b.payload.url || 'Видео не выбрано';
    case 'spoiler':
      return b.payload.title || 'Показать решение';
    case 'code':
      return b.payload.language || flat(b.payload.code, 60) || 'Код не написан';
    case 'divider':
      return 'Черта между частями урока';
    case 'simulation':
      return b.payload.simulationId ? simulationTitle ?? 'Тренажёр без названия' : 'Тренажёр не выбран';
    case 'lab':
      return LABS.find((l) => l.slug === b.payload.slug)?.title ?? b.payload.slug;
    case 'assignment':
      return `${assignmentTitle(b.payload.prompt)} · ${ASSIGNMENT_TYPE_LABELS[b.payload.spec.type].toLowerCase()}`;
  }
}

/** Чего блоку не хватает, чтобы ученик увидел что-то осмысленное. Пустая строка — всё на месте. */
export function blockProblem(block: Block, missingSimulation: boolean): string {
  const b = block.body;
  if (b.kind === 'text' && !b.payload.body.trim() && !b.payload.title.trim()) return 'Текст не написан';
  if (b.kind === 'callout' && !b.payload.body.trim() && !b.payload.title.trim()) return 'Врезка пустая';
  if (b.kind === 'formula' && !b.payload.latex.trim()) return 'Формула не написана';
  if (b.kind === 'image' && !b.payload.src) return 'Картинка не выбрана';
  if (b.kind === 'video' && !b.payload.url) return 'Видео не выбрано';
  if (b.kind === 'spoiler' && !b.payload.body.trim()) return 'Спойлер пустой';
  if (b.kind === 'code' && !b.payload.code.trim()) return 'Код не написан';
  if (b.kind === 'simulation' && !b.payload.simulationId) return 'Тренажёр не выбран';
  if (missingSimulation) return 'Тренажёр удалён автором';
  if (b.kind === 'assignment' && b.payload.prompt.trim() === 'Новое задание') return 'Задание не заполнено';
  return '';
}

/** Пустой блок-материал ученику не показывается вовсе. */
export function isBlankBlock(block: Block): boolean {
  return block.body.kind !== 'divider' && block.body.kind !== 'assignment' && block.body.kind !== 'lab'
    && blockProblem(block, false) !== '';
}
