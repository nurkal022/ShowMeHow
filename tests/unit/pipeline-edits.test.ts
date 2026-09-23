import { describe, expect, it } from 'vitest';
import { applyEdits, parseEdits, parseRefineReport } from '@/lib/pipeline/edits';

const SRC = `<script>
  const chart = SimUI.chart({ title: 'x' });
  function tick() {
    chart.pushData(t, [v]);
  }
</script>`;

describe('точечные правки', () => {
  it('разбирает JSON в ограде и без неё', () => {
    expect(parseEdits('```json\n{"edits":[{"find":"a","replace":"b"}]}\n```')).toEqual([{ find: 'a', replace: 'b' }]);
    expect(parseEdits('вот: {"edits":[{"find":"a","replace":""}]}')).toEqual([{ find: 'a', replace: '' }]);
    expect(parseEdits('<html></html>')).toBeNull();
    expect(parseEdits('{"edits":[]}')).toBeNull();
  });
  it('применяет точное совпадение', () => {
    expect(applyEdits(SRC, [{ find: 'chart.pushData(t, [v]);', replace: 'chart.push(t, [v]);' }])).toContain('chart.push(t, [v]);');
  });
  it('находит фрагмент без учёта отступов', () => {
    const out = applyEdits(SRC, [{ find: 'function tick() {\nchart.pushData(t, [v]);', replace: 'function tick() {\n    chart.push(t, [v]);' }]);
    expect(out).toContain('chart.push(t, [v]);');
    expect(out).not.toContain('pushData');
  });
  it('всё или ничего: одна непопавшая правка отменяет остальные', () => {
    expect(applyEdits(SRC, [{ find: 'chart.pushData', replace: 'chart.push' }, { find: 'нет такого', replace: 'x' }])).toBeNull();
  });
  it('неоднозначный фрагмент не применяется', () => {
    expect(applyEdits('a\na\n', [{ find: 'a', replace: 'b' }])).toBeNull();
  });
});

describe('parseRefineReport', () => {
  it('читает отчёт рядом с правками', () => {
    const out = '{"summary":"Замедлил анимацию","changed":["период 2 с"," "],"skipped":[],"next":["Добавить график"],"edits":[{"find":"a","replace":"b"}]}';
    expect(parseRefineReport(out)).toEqual({
      summary: 'Замедлил анимацию', changed: ['период 2 с'], skipped: [], next: ['Добавить график'],
    });
  });
  it('молчание модели — не ошибка, а отсутствие отчёта', () => {
    expect(parseRefineReport('{"edits":[{"find":"a","replace":"b"}]}')).toBeNull();
    expect(parseRefineReport('<html></html>')).toBeNull();
  });
});
