import { describe, it, expect } from 'vitest';
import { instrument, reinstrument, simLangOf, setSimLang } from '@/lib/artifact';
import { KIT_I18N_JS } from '@/lib/runtime/kit-i18n';
import { withLangRule, PLANNER_SYSTEM } from '@/lib/pipeline/prompts';
import { normalizeSpec } from '@/lib/pipeline/spec';

const DOC = '<!DOCTYPE html><html lang="en"><head></head><body></body></html>';

function kitT(attr: string | null) {
  const win: Record<string, unknown> = {};
  const document = { documentElement: { getAttribute: () => attr } };
  new Function('window', 'document', KIT_I18N_JS)(win, document);
  return win.__simT as (k: string, v?: Record<string, unknown>) => string;
}

describe('язык тренажёра', () => {
  it('флаг ставится на <html> и переживает пере-инструментирование', () => {
    const html = instrument(DOC, 'kk');
    expect(simLangOf(html)).toBe('kk');
    expect(html).toContain('<html lang="kk" data-sim-lang="kk">');
    expect(simLangOf(reinstrument(html))).toBe('kk');
  });

  it('русский без флага не меняет HTML; старые симуляции — без языка', () => {
    expect(setSimLang(DOC, 'ru')).toBe(DOC);
    expect(simLangOf(DOC)).toBeNull();
    expect(instrument(DOC)).toBe(instrument(DOC, 'ru'));
  });

  it('кит выбирает подписи по флагу, без флага — русский', () => {
    expect(kitT(null)('pause')).toBe('⏸ Пауза');
    expect(kitT('kk')('check')).toBe('Тексеру');
    expect(kitT('en')('stepOf', { i: 2, n: 5 })).toBe('Step 2 of 5: ');
    expect(kitT('xx')('reset')).toBe('↺ Сброс');
  });

  it('указание языка дописывается к системному промпту, русский — без приписки', () => {
    const msgs = [{ role: 'system' as const, content: PLANNER_SYSTEM }, { role: 'user' as const, content: 'маятник' }];
    expect(withLangRule(msgs, 'planner', 'ru')).toBe(msgs);
    const kk = withLangRule(msgs, 'planner', 'kk');
    expect(kk[0].content).toContain(PLANNER_SYSTEM);
    expect(kk[0].content).toMatch(/казахском/);
    expect(withLangRule(msgs, 'judge', 'en')).toBe(msgs);
  });

  it('план хранит язык kk/en', () => {
    const raw = { title: 'Маятник', physics: 'x', learningGoals: ['a'], parameters: [{ name: 'L', min: 1, max: 2 }] };
    expect(normalizeSpec({ ...raw, lang: 'kk' }).spec.lang).toBe('kk');
    expect(normalizeSpec({ ...raw, lang: 'ru' }).spec.lang).toBeUndefined();
  });
});
