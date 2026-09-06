import { describe, it, expect } from 'vitest';
import { matchScore } from '@/components/constructor/stage/Examples';
import { SECTIONS, sectionByKey } from '@/components/constructor/data';
import type { SimulationMeta } from '@/lib/types';

function sim(title: string, subject = 'Физика', prompt = '', tags: string[] = []): SimulationMeta {
  return {
    id: 'x', title, prompt, subject, tags,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as SimulationMeta;
}

const optics = sectionByKey('optics')!;
const mechanics = sectionByKey('mechanics')!;
const astro = sectionByKey('astro')!;

describe('подбор живых примеров к разделу', () => {
  it('узнаёт симуляцию раздела по названию', () => {
    expect(matchScore(sim('Преломление света и полное внутреннее отражение'), optics))
      .toBeGreaterThan(0);
    expect(matchScore(sim('Математический маятник'), mechanics)).toBeGreaterThan(0);
    expect(matchScore(sim('Орбиты планет и законы Кеплера', 'Астрономия'), astro))
      .toBeGreaterThan(0);
  });

  it('не тянет чужое: маятник не пример для оптики', () => {
    expect(matchScore(sim('Математический маятник'), optics)).toBe(0);
    expect(matchScore(sim('Преломление света'), mechanics)).toBe(0);
  });

  it('переживает русские окончания: ищется основа, а не точное слово', () => {
    // «преломления» вместо «преломление» — совпадение должно остаться.
    expect(matchScore(sim('Показатель преломления среды'), optics)).toBeGreaterThan(0);
  });

  it('ё и Ё не мешают совпадению', () => {
    const s = sectionByKey('thermo')!;
    expect(matchScore(sim('Теплопроводность стержня'), s)).toBeGreaterThan(0);
  });

  it('смотрит не только в название, но и в запрос с метками', () => {
    expect(matchScore(sim('Опыт номер три', 'Физика', 'диффузия духов в комнате'), sectionByKey('molecular')!))
      .toBeGreaterThan(0);
    expect(matchScore(sim('Опыт', 'Физика', '', ['интерференция']), optics)).toBeGreaterThan(0);
  });

  it('основа слова не цепляет чужое слово подлиннее', () => {
    // «автомат» из информатики раньше находился в «автоматически» любого запроса.
    const cs = sectionByKey('cs')!;
    expect(matchScore(sim('Маятник', 'Физика', 'параметры подбираются автоматически'), cs)).toBe(0);
    expect(matchScore(sim('Клеточный автомат «Жизнь»', 'Информатика'), cs)).toBeGreaterThan(0);
  });

  it('пустая симуляция никому не подходит', () => {
    for (const s of SECTIONS) expect(matchScore(sim(''), s)).toBe(0);
  });
});
