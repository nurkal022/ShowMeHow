import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlockSummary from '@/components/teach/BlockSummary';
import { defaultBody, sanitizeBlockBody, type BlockBody } from '@/lib/lms/block-schema';
import type { Block } from '@/lib/lms/blocks';

const SIM = '11111111-2222-3333-4444-555555555555';
const block = (body: BlockBody): Block => ({
  id: 'b1', topicId: 't1', position: 1, revision: 1, updatedAt: '2026-09-01T00:00:00.000Z', body });
const render = (b: Block, simulationTitle: string | null = null, missing = false) =>
  renderToStaticMarkup(createElement(BlockSummary, { block: b, simulationTitle, missing }));

describe('сводка блока в редакторе', () => {
  it('текст: разметка или подсказка', () => {
    expect(render(block(defaultBody('text')))).toContain('Текст пока пустой. Нажмите «Изменить».');
    expect(render(block({ kind: 'text', payload: { title: 'Период', body: '**важно**' } })))
      .toContain('<strong>важно</strong>');
  });
  it('тренажёр: не выбран, выбран, удалён', () => {
    expect(render(block(defaultBody('simulation')))).toContain('Тренажёр не выбран.');
    const chosen = block({ kind: 'simulation', payload: { simulationId: SIM, caption: 'Меняйте длину', preset: {}, locked: [] } });
    expect(render(chosen, 'Маятник')).toContain('Тренажёр «Маятник» — Меняйте длину');
    expect(render(chosen, null, true)).toContain('Тренажёр удалён автором.');
  });
  it('лаборатория и задание с правильными ответами для учителя', () => {
    expect(render(block({ kind: 'lab', payload: { slug: 'physics', caption: '' } }))).toContain('Оптический стол');
    const html = render(block(sanitizeBlockBody('assignment', { prompt: 'Сколько?', points: 5, allowRetry: true,
      spec: { type: 'choice', options: [{ id: 'a', text: '4', correct: true }, { id: 'b', text: '5' }] } })));
    expect(html).toContain('Выбор варианта · 5 баллов · без стенда · можно сдать повторно');
    expect(html).toContain('✓ 4');
    expect(html).toContain('· 5');
    expect(render(block(sanitizeBlockBody('assignment', { prompt: 'x', points: 1,
      spec: { type: 'number', answer: 2, tolerance: 0.1, unit: 'с' } })))).toContain('Правильный ответ: 2 ± 0,1 с');
  });
});
