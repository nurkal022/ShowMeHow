import type { Block } from '@/lib/lms/blocks';
import {
  assignmentTitle, assignmentTypeLabels, calloutToneLabels, type AssignmentType, type BlockKind,
} from '@/lib/lms/block-schema';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { teachEditor } from '@/i18n/messages/teach-editor';
import { LABS } from '@/lib/labs';
import {
  IconChoice, IconCode, IconDivider, IconEssay, IconFold, IconFormula, IconGaps, IconImage, IconLab, IconMatch,
  IconNumber, IconOrder, IconPlay, IconQuote, IconShort, IconTable, IconTarget, IconTask, IconText, IconVideo,
} from '@/components/icons';

type Meta = { icon: (size: number) => React.ReactNode };

/** Иконка каждого типа блока; подпись и пояснение — blockLabel/blockHint на языке интерфейса. */
export const BLOCK_META: Record<BlockKind, Meta> = {
  text: {
    icon: (size) => <IconText size={size} />,
  },
  callout: {
    icon: (size) => <IconQuote size={size} />,
  },
  formula: {
    icon: (size) => <IconFormula size={size} />,
  },
  image: {
    icon: (size) => <IconImage size={size} />,
  },
  video: {
    icon: (size) => <IconVideo size={size} />,
  },
  code: {
    icon: (size) => <IconCode size={size} />,
  },
  spoiler: {
    icon: (size) => <IconFold size={size} />,
  },
  divider: {
    icon: (size) => <IconDivider size={size} />,
  },
  simulation: {
    icon: (size) => <IconPlay size={size} />,
  },
  lab: {
    icon: (size) => <IconLab size={size} />,
  },
  assignment: {
    icon: (size) => <IconTask size={size} />,
  },
};

export const ASSIGNMENT_META: Record<AssignmentType, Meta & { auto: boolean }> = {
  choice: { auto: true, icon: (s) => <IconChoice size={s} /> },
  short: { auto: true, icon: (s) => <IconShort size={s} /> },
  number: { auto: true, icon: (s) => <IconNumber size={s} /> },
  gaps: { auto: true, icon: (s) => <IconGaps size={s} /> },
  match: { auto: true, icon: (s) => <IconMatch size={s} /> },
  order: { auto: true, icon: (s) => <IconOrder size={s} /> },
  table: { auto: false, icon: (s) => <IconTable size={s} /> },
  sim_state: { auto: true, icon: (s) => <IconTarget size={s} /> },
  text: { auto: false, icon: (s) => <IconEssay size={s} /> },
};
export const ASSIGNMENT_TYPES = Object.keys(ASSIGNMENT_META) as AssignmentType[];

/** Группы меню вставки: так учитель ищет глазами, а не читает одиннадцать плиток подряд. */
export const BLOCK_GROUPS: { title: 'groupMaterial' | 'groupInteractive'; kinds: BlockKind[] }[] = [
  { title: 'groupMaterial', kinds: ['text', 'callout', 'formula', 'image', 'video', 'code', 'spoiler', 'divider'] },
  { title: 'groupInteractive', kinds: ['simulation', 'lab'] },
];

export const blockLabel = (kind: BlockKind, locale: Locale = 'ru') => translator(teachEditor, locale)(`kind_${kind}`);
export const blockHint = (kind: BlockKind, locale: Locale = 'ru') => translator(teachEditor, locale)(`kindHint_${kind}`);
export const assignmentLabel = (type: AssignmentType, locale: Locale = 'ru') => assignmentTypeLabels(locale)[type];
export const assignmentHint = (type: AssignmentType, locale: Locale = 'ru') => translator(teachEditor, locale)(`aHint_${type}`);

export function BlockKindIcon({ kind, size = 18, assignmentType }: { kind: BlockKind; size?: number; assignmentType?: AssignmentType }) {
  const icon = kind === 'assignment' && assignmentType ? ASSIGNMENT_META[assignmentType].icon : BLOCK_META[kind].icon;
  return <span className={`cf-kind cf-kind-${kind}`} aria-hidden="true">{icon(size)}</span>;
}

const flat = (s: string, max = 80) => {
  const t = s.replace(/[*#\[\]$]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3)}…` : t;
};

/** Одна строка о содержимом блока — для свёрнутой карточки. */
export function blockHeadline(block: Block, simulationTitle: string | null, locale: Locale = 'ru'): string {
  const t = translator(teachEditor, locale);
  const b = block.body;
  switch (b.kind) {
    case 'text':
      return b.payload.title || flat(b.payload.body) || t('hNoText');
    case 'callout':
      return b.payload.title || flat(b.payload.body) || calloutToneLabels(locale)[b.payload.tone];
    case 'formula':
      return b.payload.caption || flat(b.payload.latex, 60) || t('hFormulaEmpty');
    case 'image':
      return b.payload.caption || b.payload.alt || (b.payload.src ? t('hImage') : t('hImageEmpty'));
    case 'video':
      return b.payload.caption || b.payload.url || t('hVideoEmpty');
    case 'spoiler':
      return b.payload.title || t('hSpoiler');
    case 'code':
      return b.payload.language || flat(b.payload.code, 60) || t('hCodeEmpty');
    case 'divider':
      return t('hDivider');
    case 'simulation':
      return b.payload.simulationId ? simulationTitle ?? t('hSimUntitled') : t('hSimEmpty');
    case 'lab':
      return LABS.find((l) => l.slug === b.payload.slug)?.title ?? b.payload.slug;
    case 'assignment':
      return `${assignmentTitle(b.payload.prompt)} · ${assignmentTypeLabels(locale)[b.payload.spec.type].toLowerCase()}`;
  }
}

/** Чего блоку не хватает, чтобы ученик увидел что-то осмысленное. Пустая строка — всё на месте. */
export function blockProblem(block: Block, missingSimulation: boolean, locale: Locale = 'ru'): string {
  const t = translator(teachEditor, locale);
  const b = block.body;
  if (b.kind === 'text' && !b.payload.body.trim() && !b.payload.title.trim()) return t('pText');
  if (b.kind === 'callout' && !b.payload.body.trim() && !b.payload.title.trim()) return t('pCallout');
  if (b.kind === 'formula' && !b.payload.latex.trim()) return t('hFormulaEmpty');
  if (b.kind === 'image' && !b.payload.src) return t('hImageEmpty');
  if (b.kind === 'video' && !b.payload.url) return t('hVideoEmpty');
  if (b.kind === 'spoiler' && !b.payload.body.trim()) return t('pSpoiler');
  if (b.kind === 'code' && !b.payload.code.trim()) return t('hCodeEmpty');
  if (b.kind === 'simulation' && !b.payload.simulationId) return t('hSimEmpty');
  if (missingSimulation) return t('pSimDeleted');
  if (b.kind === 'assignment' && b.payload.prompt.trim() === 'Новое задание') return t('pAssignment');
  return '';
}

/** Пустой блок-материал ученику не показывается вовсе. */
export function isBlankBlock(block: Block): boolean {
  return block.body.kind !== 'divider' && block.body.kind !== 'assignment' && block.body.kind !== 'lab'
    && blockProblem(block, false) !== '';
}
