/**
 * Безопасный разбор формул исследователя: «a*exp(-b*x) + c», «sin(w*t)^2».
 * Никакого eval — только свой разбор в дерево и его вычисление. Формулы приходят
 * от пользователя и могут показываться публично, поэтому исполнять их как JS нельзя.
 *
 * Поддерживается: числа (в т. ч. 1e-3 и десятичная запятая не нужна — точка),
 * + - * / ^ (степень правоассоциативна), унарный минус, скобки, функции и константы pi, e.
 */

export type Node =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  atan2: Math.atan2, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, pow: Math.pow,
  // Ступенька Хевисайда — частая в моделях с включением воздействия.
  step: (x: number) => (x >= 0 ? 1 : 0),
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class ExprError extends Error {}

type Tok = { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ k: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-zА-Яа-яα-ωΑ-Ω_][A-Za-zА-Яа-яα-ωΑ-Ω_0-9]*/.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue; }
    // «**» как степень — привычка из Python.
    throw new ExprError(`Непонятный символ «${c}» в формуле.`);
  }
  return out;
}

export function parse(src: string): Node {
  const toks = tokenize(src.replace(/\*\*/g, '^').replace(/·|×/g, '*').replace(/−/g, '-'));
  if (toks.length === 0) throw new ExprError('Формула пустая.');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => toks[p]?.k === 'op' && toks[p].v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Ожидалось «${v}».`);
    p++;
  };

  function expr(): Node {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v as '+' | '-';
      a = { t: 'bin', op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[p++].v as '*' | '/';
        a = { t: 'bin', op, a, b: unary() };
      } else if (peek() && (peek().k === 'num' || peek().k === 'id' || isOp('('))) {
        // Неявное умножение: «2x», «2(x+1)», «a sin(x)».
        a = { t: 'bin', op: '*', a, b: unary() };
      } else return a;
    }
  }
  function unary(): Node {
    if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (isOp('^')) { p++; return { t: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }
  function atom(): Node {
    const tk = peek();
    if (!tk) throw new ExprError('Формула оборвалась.');
    if (tk.k === 'num') { p++; return { t: 'num', v: tk.v }; }
    if (tk.k === 'id') {
      p++;
      if (isOp('(')) {
        const fn = tk.v.toLowerCase();
        if (!FUNCS[fn]) throw new ExprError(`Неизвестная функция «${tk.v}».`);
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) { p++; args.push(expr()); }
        }
        expect(')');
        return { t: 'call', fn, args };
      }
      return { t: 'var', name: tk.v };
    }
    if (isOp('(')) { p++; const e = expr(); expect(')'); return e; }
    throw new ExprError(`Неожиданное «${tk.v}».`);
  }

  const tree = expr();
  if (p < toks.length) throw new ExprError(`Лишнее «${toks[p].v}» в формуле.`);
  return tree;
}

/** Имена переменных формулы без констант — из них собираются слайдеры параметров. */
export function freeVars(node: Node, into = new Set<string>()): Set<string> {
  switch (node.t) {
    case 'var': if (!(node.name in CONSTS)) into.add(node.name); break;
    case 'neg': freeVars(node.a, into); break;
    case 'bin': freeVars(node.a, into); freeVars(node.b, into); break;
    case 'call': node.args.forEach((a) => freeVars(a, into)); break;
  }
  return into;
}

export type Scope = Record<string, number>;

export function evaluate(node: Node, scope: Scope): number {
  switch (node.t) {
    case 'num': return node.v;
    case 'var': {
      const v = scope[node.name];
      if (v !== undefined) return v;
      if (node.name in CONSTS) return CONSTS[node.name];
      return NaN;
    }
    case 'neg': return -evaluate(node.a, scope);
    case 'bin': {
      const a = evaluate(node.a, scope);
      const b = evaluate(node.b, scope);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '^': return Math.pow(a, b);
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'call': return FUNCS[node.fn](...node.args.map((a) => evaluate(a, scope)));
  }
}

/** Разобрать один раз и вызывать много: так рисуются кривые по тысячам точек. */
export function compile(src: string): { fn: (scope: Scope) => number; vars: string[] } {
  const tree = parse(src);
  return { fn: (scope) => evaluate(tree, scope), vars: [...freeVars(tree)] };
}

/** Ошибка формулы словами или null, если формула разбирается. */
export function checkExpr(src: string): string | null {
  try { parse(src); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

/** Формула в LaTeX — для экспорта в статью. Скобки расставляются по приоритетам. */
export function toLatex(node: Node): string {
  const prec = (n: Node) => (n.t === 'bin' ? ({ '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 })[n.op] : n.t === 'neg' ? 2 : 4);
  const wrap = (n: Node, min: number) => (prec(n) < min ? `\\left(${toLatex(n)}\\right)` : toLatex(n));
  switch (node.t) {
    case 'num': return String(node.v);
    case 'var': return node.name === 'pi' ? '\\pi' : node.name.length > 1 ? `\\mathrm{${node.name}}` : node.name;
    case 'neg': return `-${wrap(node.a, 2)}`;
    case 'bin':
      if (node.op === '/') return `\\frac{${toLatex(node.a)}}{${toLatex(node.b)}}`;
      if (node.op === '^') return `${wrap(node.a, 4)}^{${toLatex(node.b)}}`;
      if (node.op === '*') return `${wrap(node.a, 2)} \\cdot ${wrap(node.b, 2)}`;
      return `${wrap(node.a, 1)} ${node.op} ${wrap(node.b, node.op === '-' ? 2 : 1)}`;
    case 'call':
      if (node.fn === 'sqrt') return `\\sqrt{${toLatex(node.args[0])}}`;
      if (node.fn === 'abs') return `\\left|${toLatex(node.args[0])}\\right|`;
      if (node.fn === 'exp') return `e^{${toLatex(node.args[0])}}`;
      return `\\${['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'sinh', 'cosh', 'tanh'].includes(node.fn) ? node.fn : `operatorname{${node.fn}}`}\\left(${node.args.map(toLatex).join(', ')}\\right)`;
  }
}
