import { freeVars, parse, type Node } from './expr';
import { fit, FIT_MODELS, type FitResult } from './fit';
import { parseTable, type DataTable } from './data';
import { parseEquation } from './ode';
import { splitFunctionLine, type ModelDoc, type PlotDoc } from './doc';

/**
 * Экспорт графика и модели в Jupyter-блокнот: рецензент или руководитель может
 * повторить расчёт в Python (numpy/scipy) и убедиться, что числа не «нарисованы».
 * Формулы переводятся через наше дерево разбора, а не заменой строк: так скобки и
 * приоритеты гарантированно те же, что при расчёте в браузере.
 */

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield', 'np', 'plt', 'pd',
]);

/** Имя переменной для Python: ключевые слова и наши модули (np, plt) получают «_». */
export function pyName(name: string): string {
  return PY_KEYWORDS.has(name) ? `${name}_` : name;
}

const NP_FUNCS: Record<string, string> = {
  sin: 'np.sin', cos: 'np.cos', tan: 'np.tan', asin: 'np.arcsin', acos: 'np.arccos', atan: 'np.arctan', atan2: 'np.arctan2',
  sinh: 'np.sinh', cosh: 'np.cosh', tanh: 'np.tanh', exp: 'np.exp', ln: 'np.log', log: 'np.log', log10: 'np.log10', log2: 'np.log2',
  sqrt: 'np.sqrt', cbrt: 'np.cbrt', abs: 'np.abs', sign: 'np.sign', floor: 'np.floor', ceil: 'np.ceil', round: 'np.round',
  min: 'np.minimum', max: 'np.maximum', pow: 'np.power',
};

function pyNum(v: number): string {
  if (!Number.isFinite(v)) return 'np.nan';
  return String(v);
}

/** Формула нашего синтаксиса → выражение numpy: ^ → **, ln → np.log, pi → np.pi. */
export function toNumpy(expr: string | Node): string {
  const node = typeof expr === 'string' ? parse(expr) : expr;
  // Приоритеты Python: + - (1) < * / (2) < унарный минус (3) < ** (4).
  const prec = (n: Node) => (n.t === 'bin' ? ({ '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 })[n.op] : n.t === 'neg' ? 3 : 5);
  const wrap = (n: Node, need: boolean) => (need ? `(${walk(n)})` : walk(n));
  function walk(n: Node): string {
    switch (n.t) {
      case 'num': return pyNum(n.v);
      case 'var': return n.name === 'pi' ? 'np.pi' : n.name === 'e' ? 'np.e' : pyName(n.name);
      case 'neg': return `-${wrap(n.a, prec(n.a) < 3)}`;
      case 'bin': {
        const p = prec(n);
        if (n.op === '^') return `${wrap(n.a, prec(n.a) <= 4)}**${wrap(n.b, prec(n.b) < 3)}`;
        const right = n.op === '-' || n.op === '/' ? prec(n.b) <= p : prec(n.b) < p;
        return `${wrap(n.a, prec(n.a) < p)} ${n.op} ${wrap(n.b, right)}`;
      }
      case 'call': {
        const args = n.args.map(walk);
        if (n.fn === 'step') return `np.heaviside(${args[0]}, 1.0)`;
        // min/max от нескольких аргументов: numpy берёт по два — вкладываем.
        if ((n.fn === 'min' || n.fn === 'max') && args.length > 2) return args.reduce((a, b) => `${NP_FUNCS[n.fn]}(${a}, ${b})`);
        return `${NP_FUNCS[n.fn] ?? `np.${n.fn}`}(${args.join(', ')})`;
      }
    }
  }
  return walk(node);
}

/* ------------------------------- блокнот ------------------------------- */

interface Cell { cell_type: 'markdown' | 'code'; id: string; metadata: Record<string, never>; source: string[]; execution_count?: null; outputs?: [] }

function cells(parts: { md?: string; code?: string }[]): Cell[] {
  const src = (s: string) => s.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l));
  return parts.map((p, i) => (p.md !== undefined
    ? { cell_type: 'markdown', id: `cell-${i + 1}`, metadata: {}, source: src(p.md) }
    : { cell_type: 'code', id: `cell-${i + 1}`, metadata: {}, source: src(p.code ?? ''), execution_count: null, outputs: [] }));
}

function notebook(parts: { md?: string; code?: string }[]): string {
  return JSON.stringify({
    cells: cells(parts),
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  }, null, 1);
}

/** Строка Python: JSON-литерал строки — валидный литерал Python. */
const pyStr = (s: string) => JSON.stringify(s);

/** Таблица → CSV с кавычками: заголовки вида «t, с» содержат запятую. */
function tableCsv(t: DataTable): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [t.headers.map(q).join(',')];
  for (let i = 0; i < t.rows; i++) rows.push(t.columns.map((c) => (Number.isFinite(c[i]) ? String(c[i]) : '')).join(','));
  return rows.join('\n');
}

/** CSV внутри тройных кавычек: экранируем обратную косую и сами кавычки. */
const pyBlock = (s: string) => `"""${s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}\n"""`;

function header(title: string, what: string): string {
  return `# ${title.trim() || 'Без названия'}\n\n${what}\n\nЭкспортировано из Tesseract. Нужны: \`numpy\`, \`pandas\`, \`matplotlib\`, \`scipy\`${what.includes('ползунк') ? ', `ipywidgets`' : ''}.`;
}

function axes(doc: PlotDoc | ModelDoc, indent = ''): string {
  return [
    `plt.xlabel(${pyStr(doc.xLabel)})`,
    `plt.ylabel(${pyStr(doc.yLabel)})`,
    doc.title ? `plt.title(${pyStr(doc.title)})` : '',
    doc.xLog ? "plt.xscale('log')" : '',
    doc.yLog ? "plt.yscale('log')" : '',
    doc.grid ? 'plt.grid(True, alpha=0.3)' : '',
    'plt.legend()',
    'plt.tight_layout()',
    'plt.show()',
  ].filter(Boolean).map((l) => indent + l).join('\n');
}

export function plotNotebook(doc: PlotDoc, title: string): string {
  const table = parseTable(doc.data);
  const col = (i: number | null) => (i === null || i >= table.columns.length ? null : i);
  const xs = table.columns[doc.x] ?? [];
  const parts: { md?: string; code?: string }[] = [
    { md: header(title, 'Данные, график с погрешностями и аппроксимация методом наименьших квадратов (`scipy.optimize.curve_fit`).') },
    { code: 'import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\nfrom io import StringIO\nfrom scipy.optimize import curve_fit' },
    { code: `CSV = ${pyBlock(tableCsv(table))}\ndf = pd.read_csv(StringIO(CSV))\nx = df.iloc[:, ${doc.x}].to_numpy(float)\ndf` },
  ];

  const plot: string[] = ['plt.figure(figsize=(7, 4.5))'];
  const fits: string[] = [];
  doc.series.forEach((s, k) => {
    const n = k + 1;
    const y = col(s.y);
    if (y === null) return;
    const err = col(s.err);
    const label = s.label || table.headers[y] || `Серия ${n}`;
    plot.push(`y${n} = df.iloc[:, ${y}].to_numpy(float)`);
    if (err !== null) plot.push(`e${n} = np.abs(df.iloc[:, ${err}].to_numpy(float))`);
    const fmt = s.mode === 'line' ? "'-'" : s.mode === 'both' ? "'o-'" : "'o'";
    plot.push(`plt.errorbar(x, y${n}, yerr=${err !== null ? `e${n}` : 'None'}, fmt=${fmt}, capsize=3, label=${pyStr(label)})`);
    if (!s.fit) return;

    const preset = FIT_MODELS.find((m) => m.key === s.fit!.model);
    const expr = s.fit.model === 'custom' ? (s.fit.expr ?? '') : preset?.expr ?? '';
    let names: string[];
    let py: string;
    try {
      const tree = parse(expr);
      py = toNumpy(tree);
      names = preset?.params ?? [...freeVars(tree)].filter((v) => v !== 'x');
    } catch {
      fits.push(`# Серия ${n}: формулу «${expr}» не удалось перевести в Python.`);
      return;
    }
    // Начальное приближение — наш же результат: curve_fit сходится с него сразу и к тому же минимуму.
    let r: FitResult | null = null;
    try {
      const errs = err !== null ? table.columns[err] : undefined;
      r = fit({ xs, ys: table.columns[y], sigma: errs?.map((e) => (Number.isFinite(e) ? Math.abs(e) : null)), model: s.fit.model, expr: s.fit.expr });
    } catch { /* p0 = единицы */ }
    const p0 = names.map((nm) => pyNum(r?.params.find((p) => p.name === nm)?.value ?? 1));
    const args = names.map(pyName);
    fits.push([
      `# Серия ${n}: y = ${expr}`,
      `def model${n}(x, ${args.join(', ')}):`,
      `    return ${py}`,
      '',
      `mask = np.isfinite(x) & np.isfinite(y${n})${err !== null ? ` & np.isfinite(e${n}) & (e${n} > 0)` : ''}`,
      `popt${n}, pcov${n} = curve_fit(model${n}, x[mask], y${n}[mask], p0=[${p0.join(', ')}]${err !== null ? `, sigma=e${n}[mask], absolute_sigma=True` : ''}, maxfev=20000)`,
      `perr${n} = np.sqrt(np.diag(pcov${n}))`,
      `for name, v, dv in zip(${pyStr(args.join(' '))}.split(), popt${n}, perr${n}):`,
      "    print(f'{name} = {v:.6g} ± {dv:.2g}')",
      `res = y${n}[mask] - model${n}(x[mask], *popt${n})`,
      `r2 = 1 - np.sum(res**2) / np.sum((y${n}[mask] - np.mean(y${n}[mask]))**2)`,
      "print(f'R² = {r2:.5f}')",
      r ? `# В Tesseract: ${r.params.map((p) => `${p.name} = ${p.value.toPrecision(6)} ± ${p.error.toPrecision(2)}`).join(', ')}; R² = ${r.r2.toFixed(5)}` : '',
      `xf = np.linspace(np.nanmin(x[mask]), np.nanmax(x[mask]), 400)`,
      `plt.plot(xf, model${n}(xf, *popt${n}), label=f'Аппроксимация (R² = {r2:.4f})')`,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'));
  });

  parts.push({ code: [...plot, ...fits.map((f) => `\n${f}`), '', axes(doc)].join('\n') });
  return notebook(parts);
}

export function modelNotebook(doc: ModelDoc, title: string): string {
  const lines = doc.lines.filter((l) => l.trim());
  const params = doc.params.map((p) => ({ ...p, py: pyName(p.name) }));
  const sig = params.map((p) => `${p.py}=${pyNum(p.value)}`).join(', ');
  const sliders = params.map((p) => {
    const step = (p.max - p.min) / 200 || 0.01;
    return `${p.py}=FloatSlider(value=${pyNum(p.value)}, min=${pyNum(Math.min(p.min, p.value))}, max=${pyNum(Math.max(p.max, p.value))}, step=${pyNum(Number(step.toPrecision(3)))})`;
  });
  const interactive = params.length
    ? `interact(draw,\n         ${sliders.join(',\n         ')})`
    : 'draw()';

  // Точки эксперимента поверх модели — тем же CSV, что в таблице.
  const data: string[] = [];
  if (doc.data.trim() && doc.dataY !== null) {
    const t = parseTable(doc.data);
    data.push(`CSV = ${pyBlock(tableCsv(t))}`, 'df = pd.read_csv(StringIO(CSV))', `xd = df.iloc[:, ${doc.dataX}].to_numpy(float)`, `yd = df.iloc[:, ${doc.dataY}].to_numpy(float)`);
  }
  const scatter = data.length ? [`    plt.plot(xd, yd, 'o', label=${pyStr('Эксперимент')})`] : [];
  const imports = ['import numpy as np', 'import matplotlib.pyplot as plt', 'from ipywidgets import interact, FloatSlider'];
  if (data.length) imports.push('import pandas as pd', 'from io import StringIO');

  if (doc.mode === 'ode') {
    imports.push('from scipy.integrate import solve_ivp');
    // Битые строки пропускаем: блокнот с рабочими уравнениями полезнее, чем ошибка вместо файла.
    const eqs = lines.flatMap((l) => { try { const e = parseEquation(l); return [{ ...e, py: toNumpy(e.rhs) }]; } catch { return []; } });
    const state = eqs.map((e) => pyName(e.name));
    const rhs = [
      `def rhs(t, state, ${params.map((p) => p.py).join(', ')}):`.replace(', ):', '):'),
      `    ${state.join(', ')}, = state`,
      `    return [${eqs.map((e) => e.py).join(', ')}]`,
    ].join('\n');
    const y0 = eqs.map((e) => pyNum(doc.initial[e.name] ?? 0));
    const draw = [
      `def draw(${sig}):`,
      `    sol = solve_ivp(rhs, (${pyNum(doc.from)}, ${pyNum(doc.to)}), [${y0.join(', ')}], args=(${params.map((p) => p.py).join(', ')}${params.length === 1 ? ',' : ''}),`,
      '                    dense_output=True, rtol=1e-8, atol=1e-10)',
      `    t = np.linspace(${pyNum(doc.from)}, ${pyNum(doc.to)}, 1000)`,
      '    Y = sol.sol(t)',
      '    plt.figure(figsize=(7, 4.5))',
      `    for i, name in enumerate(${pyStr(eqs.map((e) => e.name).join(' '))}.split()):`,
      '        plt.plot(t, Y[i], label=name)',
      ...scatter,
      axes(doc, '    '),
    ].join('\n');
    return notebook([
      { md: header(title, `Система ОДУ, решение \`scipy.integrate.solve_ivp\`, параметры — ползунками.\n\n${lines.map((l) => `- \`${l}\``).join('\n')}`) },
      { code: imports.join('\n') },
      ...(data.length ? [{ code: data.join('\n') }] : []),
      { code: rhs },
      { code: `${draw}\n\n${interactive}` },
    ]);
  }

  // Явные формулы: независимая переменная — x, если она есть в формулах, иначе t (как в редакторе).
  const parsed = lines.flatMap((l) => {
    const { name, rhs } = splitFunctionLine(l);
    try { return [{ name: name ?? rhs, rhs, tree: parse(rhs) }]; } catch { return []; }
  });
  const vars = new Set(parsed.flatMap((p) => [...freeVars(p.tree)]));
  const indep = vars.has('x') ? 'x' : vars.has('t') ? 't' : 'x';
  const draw = [
    `def draw(${sig}):`,
    `    ${indep} = np.linspace(${pyNum(doc.from)}, ${pyNum(doc.to)}, 600)`,
    '    plt.figure(figsize=(7, 4.5))',
    ...parsed.map((p) => {
      const py = toNumpy(p.tree);
      // Формула без переменной — константа: растягиваем на всю ось, иначе plot упадёт.
      const y = freeVars(p.tree).has(indep) ? py : `np.full_like(${indep}, ${py})`;
      return `    plt.plot(${indep}, ${y}, label=${pyStr(p.name)})`;
    }),
    ...scatter,
    axes(doc, '    '),
  ].join('\n');
  return notebook([
    { md: header(title, `Модель по формуле, параметры — ползунками.\n\n${lines.map((l) => `- \`${l}\``).join('\n')}`) },
    { code: imports.join('\n') },
    ...(data.length ? [{ code: data.join('\n') }] : []),
    { code: `${draw}\n\n${interactive}` },
  ]);
}
