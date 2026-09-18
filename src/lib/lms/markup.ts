/**
 * Простая разметка текста урока → HTML. Сначала экранируется ВСЁ, потом в уже
 * безопасном тексте распознаются разрешённые конструкции: абзацы, **жирный**,
 * *курсив*, списки «- », заголовки «## », ссылки [текст](адрес). Адрес — только
 * http(s) или путь сайта от корня. Формулы $…$ и $$…$$ рисует переданный снаружи рендерер. Модуль чистый и без зависимостей: его зовут
 * и сервер, и клиентский предпросмотр в редакторе.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Адрес уже экранирован: кавычки и угловые скобки в нём — сущности и из атрибута не выйдут.
// Звёздочки в адрес не пускаем, чтобы жирный и курсив не разметили его изнутри.
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s*]+)\)/g;
const SAFE_URL_RE = /^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i;

function inline(escaped: string): string {
  return escaped
    .replace(LINK_RE, (whole, text: string, url: string) => (SAFE_URL_RE.test(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : whole))
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

/** Рисует формулу: (tex, блочная ли) → готовый HTML. Без него формула остаётся текстом в $…$. */
export type MathRenderer = (tex: string, display: boolean) => string;

const MATH_RE = /\$(\S(?:[^$\n]*\S)?)\$/g;

export function renderMarkup(src: string, math?: MathRenderer): string {
  // Формулы вынимаем до экранирования и возвращаем после разметки: иначе «*» и «_» в TeX стали бы курсивом.
  const format = (s: string) => {
    if (!math) return inline(escapeHtml(s));
    const found: string[] = [];
    const masked = s.replace(MATH_RE, (_, tex: string) => `\u0000${found.push(tex) - 1}\u0000`);
    return inline(escapeHtml(masked)).replace(/\u0000(\d+)\u0000/g, (_, i: string) => math(found[Number(i)], false));
  };
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(format).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((item) => `<li>${format(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const display = math ? /^\$\$(.+)\$\$$/.exec(line) : null;
    if (display && math) {
      flushPara();
      flushList();
      out.push(`<div class="markup-math">${math(display[1].trim(), true)}</div>`);
      continue;
    }
    if (line === '') {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      out.push(`<h3>${format(heading[1])}</h3>`);
      continue;
    }
    const item = /^[-•]\s+(.+)$/.exec(line);
    if (item) {
      flushPara();
      list.push(item[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join('\n');
}
