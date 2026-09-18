import type { Block } from '@/lib/lms/blocks';
import { assignmentTitle, ASSIGNMENT_TYPE_LABELS, type BlockKind } from '@/lib/lms/block-schema';
import { LABS } from '@/lib/labs';
import { IconLab, IconPlay, IconTask, IconText } from '@/components/icons';

/** Иконка, подпись и пояснение каждого типа блока — для карточек и меню «Добавить блок». */
export const BLOCK_META: Record<BlockKind, { label: string; hint: string; icon: (size: number) => React.ReactNode }> = {
  text: {
    label: 'Текст',
    hint: 'Объяснение, определение или инструкция. Поддерживает заголовки, списки и ссылки.',
    icon: (size) => <IconText size={size} />,
  },
  simulation: {
    label: 'Тренажёр',
    hint: 'Интерактивная симуляция из вашей библиотеки или общего каталога. Можно сгенерировать новую.',
    icon: (size) => <IconPlay size={size} />,
  },
  lab: {
    label: 'Лаборатория',
    hint: 'Одна из готовых 3D-сцен: открывается в браузере и в очках виртуальной реальности.',
    icon: (size) => <IconLab size={size} />,
  },
  assignment: {
    label: 'Задание',
    hint: 'Вопрос с баллами: выбор варианта и число проверяются сами, развёрнутый ответ проверяете вы.',
    icon: (size) => <IconTask size={size} />,
  },
};

export function BlockKindIcon({ kind, size = 18 }: { kind: BlockKind; size?: number }) {
  return <span className={`cf-kind cf-kind-${kind}`} aria-hidden="true">{BLOCK_META[kind].icon(size)}</span>;
}

/** Одна строка о содержимом блока — для свёрнутой карточки. */
export function blockHeadline(block: Block, simulationTitle: string | null): string {
  const b = block.body;
  switch (b.kind) {
    case 'text': {
      const flat = b.payload.body.replace(/[*#\[\]]/g, '').replace(/\s+/g, ' ').trim();
      return b.payload.title || (flat.length > 80 ? `${flat.slice(0, 77)}…` : flat) || 'Без текста';
    }
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
  if (b.kind === 'simulation' && !b.payload.simulationId) return 'Тренажёр не выбран';
  if (missingSimulation) return 'Тренажёр удалён автором';
  if (b.kind === 'assignment' && b.payload.prompt.trim() === 'Новое задание') return 'Задание не заполнено';
  return '';
}
