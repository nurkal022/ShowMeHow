/**
 * Простая разметка текста урока → HTML. Сначала экранируется ВСЁ, потом в уже
 * безопасном тексте распознаются разрешённые конструкции: абзацы, **жирный**,
 * *курсив*, списки «- », заголовки «## », ссылки [текст](адрес). Адрес — только
 * http(s) или путь сайта от корня. Модуль чистый и без зависимостей: его зовут
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

const format = (s: string) => inline(escapeHtml(s));

export function renderMarkup(src: string): string {
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
