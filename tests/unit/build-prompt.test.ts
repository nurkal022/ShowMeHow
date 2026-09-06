import { describe, it, expect } from 'vitest';
import { buildPrompt, isComplete, noteTags } from '@/components/constructor/buildPrompt';
import { INSTRUMENTS, SECTIONS } from '@/components/constructor/data';
import { MOTIFS } from '@/components/constructor/stage/motifs';

const base = {
  section: 'mechanics', phenomenon: 'математический маятник', mode: '2d' as const,
  style: 'schematic' as const, parameters: ['масса', 'длина'],
  instruments: ['slider' as const, 'chart' as const], notes: '', level: 'grade10to11' as const,
};

describe('конструктор промпта', () => {
  it('включает явление, режим, стиль, параметры и уровень', () => {
    const p = buildPrompt(base);
    expect(p).toContain('математический маятник');
    expect(p).toContain('2D');
    expect(p).toContain('схематичной');
    expect(p).toContain('масса, длина');
    expect(p).toContain('10-11 класса');
  });

  it('пустой список параметров просит подобрать их самостоятельно', () => {
    const p = buildPrompt({ ...base, parameters: [] });
    expect(p).toContain('Подбери сам');
    expect(p).not.toContain('Управляемые параметры');
  });

  it('своё явление попадает в текст дословно', () => {
    expect(buildPrompt({ ...base, phenomenon: 'качели во дворе' })).toContain('качели во дворе');
  });

  it('выбранные приборы названы и прозой, и в структурном блоке', () => {
    const p = buildPrompt(base);
    expect(p).toContain('живой график');
    expect(p).toContain('Выбор в конструкторе:');
    expect(p).toContain('- приборы: Ползунки, График');
    expect(p).toContain('- режим: 2d');
  });

  it('без приборов и параметров блок оставляет выбор генератору', () => {
    const p = buildPrompt({ ...base, instruments: [], parameters: [] });
    expect(p).toContain('- приборы: на твоё усмотрение');
    expect(p).toContain('- параметры: на твоё усмотрение');
  });

  it('свои слова идут последними — они весят больше выбора из списка', () => {
    const p = buildPrompt({ ...base, notes: 'два маятника связаны пружиной' });
    expect(p).toContain('Отдельно важно: два маятника связаны пружиной');
    expect(p.indexOf('Отдельно важно')).toBeGreaterThan(p.indexOf('Выбор в конструкторе'));
  });

  it('пустые пожелания не оставляют пустого хвоста', () => {
    expect(buildPrompt({ ...base, notes: '   ' })).not.toContain('Отдельно важно');
  });

  it('раздела достаточно: явление выбирать не обязательно', () => {
    expect(isComplete({ ...base, parameters: [] })).toBe(true);
    // Раздел без явления — законный запрос «покажи что-нибудь из механики».
    expect(isComplete({ ...base, phenomenon: '  ' })).toBe(true);
    // Свои слова без раздела — тоже.
    expect(isComplete({ section: '', phenomenon: '', notes: 'качели во дворе' })).toBe(true);
    // Пусто вообще — отправлять нечего.
    expect(isComplete({ section: '', phenomenon: '  ', notes: '' })).toBe(false);
  });

  it('раздел без явления оставляет выбор явления генератору', () => {
    const p = buildPrompt({ ...base, phenomenon: '' });
    expect(p).toContain('механика');
    expect(p).toContain('выбери сам показательное явление');
  });

  it('без раздела и явления просит выбрать тему самому', () => {
    const p = buildPrompt({ ...base, section: '', phenomenon: '', notes: 'что-нибудь про волны' });
    expect(p).toContain('выбери сам тему');
    expect(p).toContain('что-нибудь про волны');
  });
});

describe('выноски своих слов', () => {
  it('режет по запятым и переводам строки, пустое отбрасывает', () => {
    expect(noteTags('трение,  , два тела\nпружина')).toEqual(['трение', 'два тела', 'пружина']);
  });

  it('длинную фразу укорачивает, чтобы выноска не разъехалась', () => {
    const [tag] = noteTags('очень длинное пожелание которое не влезет в выноску');
    expect(tag).toHaveLength(22);
    expect(tag.endsWith('…')).toBe(true);
  });

  it('пустая строка не даёт выносок', () => {
    expect(noteTags('   ')).toEqual([]);
  });
});

describe('таблица разделов', () => {
  it('ключи уникальны, а списки непусты', () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) {
      expect(s.phenomena.length).toBeGreaterThan(0);
      expect(s.parameters.length).toBeGreaterThan(0);
    }
  });

  it('у каждого раздела есть нарисованный мотив', () => {
    for (const s of SECTIONS) {
      expect(MOTIFS[s.motif], `мотив ${s.motif} раздела ${s.key}`).toBeTypeOf('function');
    }
  });

  it('у каждого раздела есть формула и величина для приборов', () => {
    // Раньше эти строки лежали отдельной таблицей в Stage.tsx, и новый раздел
    // молча оставался без формулы. Держим их рядом с самим разделом.
    for (const s of SECTIONS) {
      expect(s.tex.trim(), s.key).not.toBe('');
      expect(s.quantity.trim(), s.key).not.toBe('');
    }
  });

  it('у каждого раздела есть формула и величина для приборов', () => {
    // Раздел без них дал бы на стенде пустую панель формулы и табло без имени —
    // заметить это глазами можно только зайдя именно в этот раздел.
    for (const s of SECTIONS) {
      expect(s.tex.trim(), `формула раздела ${s.key}`).not.toBe('');
      expect(s.quantity.trim(), `величина раздела ${s.key}`).not.toBe('');
    }
  });

  it('раздел не предлагает приборов, которых кит не умеет', () => {
    const known = new Set(INSTRUMENTS.map((i) => i.value));
    for (const s of SECTIONS) {
      for (const i of s.instruments) expect(known.has(i), `${s.key}: ${i}`).toBe(true);
    }
  });
});
