import { describe, expect, it } from 'vitest';
import { speechText } from '@/lib/lms/speech-text';

describe('текст для озвучки', () => {
  it('снимает разметку, ссылки и команды TeX', () => {
    expect(speechText('## Итог\n**Скорость** растёт: $v = \\frac{s}{t}$, см. [учебник](https://x.kz).\n- шаг $a \\cdot t$'))
      .toBe('Итог\nСкорость растёт: v = s / t, см. учебник.\nшаг a · t');
  });
});
