import { describe, expect, it } from 'vitest';
import { extractJson, repairJsonEscapes } from '@/lib/artifact';

describe('LaTeX внутри JSON от модели', () => {
  it('недопустимые экранирования не роняют разбор', () => {
    const raw = '{"physics": "Период $T = 2\\pi\\sqrt{L/g}$, угол \\alpha"}';
    expect(extractJson<{ physics: string }>(raw).physics).toBe('Период $T = 2\\pi\\sqrt{L/g}$, угол \\alpha');
  });
  it('допустимые, но LaTeX-овые (\\frac, \\theta, \\nu) не портят формулу', () => {
    const raw = '{"f": "$\\frac{1}{T}$ и $\\theta$, $\\nu$, $\\beta$, $\\rho$"}';
    expect(extractJson<{ f: string }>(raw).f).toBe('$\\frac{1}{T}$ и $\\theta$, $\\nu$, $\\beta$, $\\rho$');
  });
  it('настоящие экранирования остаются', () => {
    const raw = '{"a": "строка\\nдругая, кавычка \\" и слеш \\\\ и \\u0041"}';
    expect(extractJson<{ a: string }>(raw).a).toBe('строка\nдругая, кавычка " и слеш \\ и A');
    expect(repairJsonEscapes('{"x": 1}')).toBe('{"x": 1}');
  });
});
