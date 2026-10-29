/**
 * Таблица реакций для «Стола реакций». Состояние колбы — набор id уже добавленных
 * реагентов; react() возвращает, что произошло от добавления ещё одного.
 * Эффекты: none | color | precipitate | gas | foam.
 */
export const REAGENTS = [
  { id: 'hcl', name: 'Соляная кислота', formula: 'HCl', color: '#dfe6ee' },
  { id: 'naoh', name: 'Гидроксид натрия', formula: 'NaOH', color: '#e3f2fd' },
  { id: 'indicator', name: 'Лакмус', formula: 'индикатор', color: '#7e57c2' },
  { id: 'phph', name: 'Фенолфталеин', formula: 'фенолфт.', color: '#f4f1f8' },
  { id: 'agno3', name: 'Нитрат серебра', formula: 'AgNO₃', color: '#eceff1' },
  { id: 'nahco3', name: 'Пищевая сода', formula: 'NaHCO₃', color: '#fafafa' },
  { id: 'h2o2', name: 'Пероксид водорода', formula: 'H₂O₂', color: '#e0f7fa' },
  { id: 'ki', name: 'Иодид калия', formula: 'KI', color: '#fff8e1' },
  { id: 'cuso4', name: 'Медный купорос', formula: 'CuSO₄', color: '#29b6f6' },
  { id: 'fecl3', name: 'Хлорид железа(III)', formula: 'FeCl₃', color: '#d9a21b' },
  { id: 'kscn', name: 'Роданид калия', formula: 'KSCN', color: '#f7f7f2' },
  { id: 'pbno3', name: 'Нитрат свинца', formula: 'Pb(NO₃)₂', color: '#f3f3f3' },
  { id: 'zn', name: 'Цинк, гранулы', formula: 'Zn', color: '#9aa4ad' },
];

export const FLAME_SALTS = [
  { id: 'na', name: 'Хлорид натрия', formula: 'NaCl', flame: '#ffb300', note: 'жёлтое — 589 нм' },
  { id: 'cu', name: 'Хлорид меди', formula: 'CuCl₂', flame: '#00e676', note: 'зелёное' },
  { id: 'k', name: 'Хлорид калия', formula: 'KCl', flame: '#b388ff', note: 'фиолетовое' },
  { id: 'li', name: 'Хлорид лития', formula: 'LiCl', flame: '#ff1744', note: 'карминовое' },
  { id: 'sr', name: 'Хлорид стронция', formula: 'SrCl₂', flame: '#ff4081', note: 'малиновое' },
];

// Пары (порядок не важен) → результат. kind — тип реакции для журнала опытов.
export const REACTIONS = [
  { a: 'h2o2', b: 'ki', effect: 'foam', color: '#fff3b0', product: '2H₂O₂ → 2H₂O + O₂↑', title: 'Слоновья зубная паста', kind: 'Каталитическое разложение' },
  { a: 'hcl', b: 'indicator', effect: 'color', color: '#e53935', product: 'кислая среда, pH < 7', title: 'Лакмус краснеет', kind: 'Индикатор' },
  { a: 'naoh', b: 'indicator', effect: 'color', color: '#1e88e5', product: 'щелочная среда, pH > 7', title: 'Лакмус синеет', kind: 'Индикатор' },
  { a: 'naoh', b: 'phph', effect: 'color', color: '#d81b60', product: 'щелочная среда, pH > 8,2', title: 'Фенолфталеин малиновеет', kind: 'Индикатор' },
  { a: 'agno3', b: 'hcl', effect: 'precipitate', color: '#f5f5f5', product: 'AgNO₃ + HCl → AgCl↓ + HNO₃', title: 'Белый творожистый осадок', kind: 'Осаждение' },
  { a: 'nahco3', b: 'hcl', effect: 'gas', color: '#e8eaf6', product: 'NaHCO₃ + HCl → NaCl + H₂O + CO₂↑', title: 'Выделяется углекислый газ', kind: 'Газ' },
  { a: 'cuso4', b: 'naoh', effect: 'precipitate', color: '#1e88e5', product: 'CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄', title: 'Голубой осадок гидроксида меди', kind: 'Осаждение' },
  { a: 'hcl', b: 'naoh', effect: 'color', color: '#e3f2fd', product: 'HCl + NaOH → NaCl + H₂O', title: 'Нейтрализация', kind: 'Кислота + основание' },
  { a: 'fecl3', b: 'kscn', effect: 'color', color: '#8e0b0b', product: 'FeCl₃ + 3KSCN → Fe(SCN)₃ + 3KCl', title: 'Кроваво-красный раствор', kind: 'Качественная реакция на Fe³⁺' },
  { a: 'fecl3', b: 'naoh', effect: 'precipitate', color: '#8d4b1f', product: 'FeCl₃ + 3NaOH → Fe(OH)₃↓ + 3NaCl', title: 'Бурый осадок гидроксида железа', kind: 'Осаждение' },
  { a: 'pbno3', b: 'ki', effect: 'precipitate', color: '#ffd600', product: 'Pb(NO₃)₂ + 2KI → PbI₂↓ + 2KNO₃', title: 'Золотой дождь', kind: 'Осаждение' },
  { a: 'zn', b: 'hcl', effect: 'gas', color: '#dfe6ee', product: 'Zn + 2HCl → ZnCl₂ + H₂↑', title: 'Выделяется водород', kind: 'Замещение' },
];

/** Ключ реакции — для журнала найденных опытов. */
export const reactionKey = (r) => `${r.a}+${r.b}`;

export function mixState() {
  return { added: [], color: '#9ecfff', volume: 0 };
}

export function react(state, id) {
  const r = REAGENTS.find((x) => x.id === id);
  if (!r) throw new Error(`нет реагента ${id}`);
  const hit = REACTIONS.find((p) => (p.a === id && state.added.includes(p.b)) || (p.b === id && state.added.includes(p.a)));
  state.added.push(id);
  state.volume = Math.min(1, state.volume + 0.18);
  if (hit) {
    state.color = hit.color;
    return { effect: hit.effect, color: hit.color, product: hit.product, title: hit.title, kind: hit.kind, key: reactionKey(hit) };
  }
  // Просто раствор: цвет тянется к цвету реагента (бесцветные и гранулы цвет не меняют).
  state.color = ['#fafafa', '#eceff1', '#f4f1f8', '#f7f7f2', '#f3f3f3', '#9aa4ad'].includes(r.color) ? state.color : r.color;
  return { effect: 'none', color: state.color, product: r.formula, title: r.name };
}
