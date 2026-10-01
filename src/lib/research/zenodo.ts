import { parseTable, tableToCsv } from './data';
import { buildPlot, renderDoc, type ModelDoc, type PlotDoc, type ResearchKind } from './doc';
import { formatWithError } from './fit';
import type { Locale } from '@/i18n/config';
import { translator } from '@/i18n/core';
import { researchFigure } from '@/i18n/messages/research-figure';

/**
 * Публикация в Zenodo (CERN): постоянный архив и цитируемый DOI для графика,
 * модели, тренажёра или проекта целиком. Модуль без базы, DOM и node-зависимостей:
 * клиент получает fetch извне (в тестах — поддельный), сборка метаданных и файлов —
 * чистые функции, цитаты зовёт и панель в браузере.
 * Документация: https://developers.zenodo.org (legacy deposit API, его держит и новый Zenodo).
 */

/** То, что остаётся у материала после публикации. title/creators/uploadType — для строк цитирования. */
export interface ZenodoInfo {
  doi: string;
  conceptDoi: string | null;
  recordId: number;
  url: string;
  sandbox: boolean;
  version: string;
  publishedAt: string;
  title?: string;
  creators?: string[];
  uploadType?: ZenodoUploadType;
}

export class ZenodoError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

export const ZENODO_LICENSES = [
  { id: 'cc-by-4.0', label: 'CC BY 4.0 — с указанием авторства' },
  { id: 'cc-by-sa-4.0', label: 'CC BY-SA 4.0 — с тем же условием' },
  { id: 'cc0-1.0', label: 'CC0 — общественное достояние' },
  { id: 'mit', label: 'MIT — для кода' },
] as const;
export type ZenodoLicense = typeof ZENODO_LICENSES[number]['id'];

export type ZenodoUploadType = 'dataset' | 'software' | 'other';

/** Тип записи: данные с графиком — набор данных, интерактивная HTML-модель — программа. */
export function uploadTypeFor(what: ResearchKind | 'project'): ZenodoUploadType {
  return what === 'sim' ? 'software' : 'dataset';
}

export const zenodoBase = (sandbox: boolean) => (sandbox ? 'https://sandbox.zenodo.org/api' : 'https://zenodo.org/api');
export const TOKEN_URL = (sandbox: boolean) =>
  `https://${sandbox ? 'sandbox.' : ''}zenodo.org/account/settings/applications/tokens/new/`;

/* ------------------------------------- ошибки ------------------------------------- */

const BAD_TOKEN = 'Токен Zenodo недействителен или без прав deposit:write/deposit:actions.';

/** Ответ Zenodo → фраза для человека. 400 разворачиваем в список полей: иначе автор не поймёт, что поправить. */
export function zenodoErrorMessage(status: number, body: unknown): string {
  const b = (body && typeof body === 'object' ? body : {}) as { message?: unknown; errors?: unknown };
  if (status === 401 || status === 403) return BAD_TOKEN;
  if (status === 404) return 'Запись в Zenodo не найдена: её удалили или она создана другим аккаунтом.';
  if (status === 413) return 'Zenodo не принял файл: слишком большой.';
  if (status === 429) return 'Zenodo просит подождать: слишком много запросов. Попробуйте через минуту.';
  if (status >= 500) return `Zenodo временно недоступен (код ${status}). Попробуйте позже — черновик на Zenodo не опубликован.`;
  const errors = Array.isArray(b.errors) ? b.errors : [];
  const lines = errors.map((e) => {
    const x = (e ?? {}) as { field?: unknown; message?: unknown; messages?: unknown };
    const msg = Array.isArray(x.messages) ? x.messages.join('; ') : typeof x.message === 'string' ? x.message : '';
    const field = typeof x.field === 'string' ? x.field.replace(/^metadata\./, '') : '';
    return [field, msg.trim().replace(/\.+$/, '')].filter(Boolean).join(': ');
  }).filter(Boolean);
  const head = typeof b.message === 'string' && b.message ? b.message : `ошибка ${status}`;
  return lines.length ? `Zenodo отклонил запрос: ${lines.join('; ')}.` : `Zenodo отклонил запрос: ${head}.`;
}

/* ------------------------------------- клиент ------------------------------------- */

export interface ZenodoDeposition {
  id: number;
  record_id?: number;
  doi?: string;
  conceptdoi?: string;
  state?: string;
  submitted?: boolean;
  metadata?: { prereserve_doi?: { doi?: string; recid?: number }; version?: string };
  links?: { bucket?: string; latest_draft?: string; html?: string; record_html?: string; latest_html?: string };
}
export interface ZenodoFileEntry { id: string; filename: string }
export interface ZenodoFile { name: string; data: string | Uint8Array }

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ZenodoClientOptions { token: string; sandbox?: boolean; fetch?: FetchLike }

export type ZenodoClient = ReturnType<typeof createZenodoClient>;

export function createZenodoClient({ token, sandbox = false, fetch: f = fetch }: ZenodoClientOptions) {
  const base = zenodoBase(sandbox);
  const origin = new URL(base).origin;

  /**
   * Абсолютные адреса (bucket, latest_draft) приходят из ответов Zenodo. Токен уходит
   * только на тот же хост: странный ответ не должен увести Bearer на чужой сервер.
   */
  const resolve = (url: string) => {
    if (url.startsWith('/')) return base + url;
    if (new URL(url).origin !== origin) throw new ZenodoError('Zenodo вернул адрес на другом сервере — публикация остановлена.');
    return url;
  };

  async function call<T>(method: string, url: string, body?: { json?: unknown; raw?: string | Uint8Array }): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (body?.json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body.json); }
    if (body?.raw !== undefined) { headers['Content-Type'] = 'application/octet-stream'; payload = body.raw as BodyInit; }
    let res: Response;
    try {
      res = await f(resolve(url), { method, headers, body: payload });
    } catch (e) {
      if (e instanceof ZenodoError) throw e;
      throw new ZenodoError(`Не удалось связаться с Zenodo: ${e instanceof Error ? e.message : String(e)}.`);
    }
    const text = await res.text().catch(() => '');
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* не JSON — для ошибки хватит кода */ }
    if (!res.ok) throw new ZenodoError(zenodoErrorMessage(res.status, data), res.status);
    return data as T;
  }

  const client = {
    base,
    sandbox,
    /** Проверка токена при подключении: список своих депозитов доступен только с deposit:write. */
    check: () => call<unknown>('GET', '/deposit/depositions?size=1'),
    createDeposition: () => call<ZenodoDeposition>('POST', '/deposit/depositions', { json: {} }),
    getDeposition: (id: number) => call<ZenodoDeposition>('GET', `/deposit/depositions/${id}`),
    listFiles: (id: number) => call<ZenodoFileEntry[] | null>('GET', `/deposit/depositions/${id}/files`).then((r) => r ?? []),
    deleteFile: (id: number, fileId: string) => call<unknown>('DELETE', `/deposit/depositions/${id}/files/${encodeURIComponent(fileId)}`),
    uploadFile: (bucket: string, name: string, data: string | Uint8Array) =>
      call<unknown>('PUT', `${bucket.replace(/\/$/, '')}/${encodeURIComponent(name)}`, { raw: data }),
    setMetadata: (id: number, metadata: ZenodoMetadata) =>
      call<ZenodoDeposition>('PUT', `/deposit/depositions/${id}`, { json: { metadata } }),
    publish: (id: number) => call<ZenodoDeposition>('POST', `/deposit/depositions/${id}/actions/publish`),
    /** Черновик не опубликован — его можно выбросить, чтобы на Zenodo не копились брошенные депозиты. */
    discard: (id: number) => call<unknown>('DELETE', `/deposit/depositions/${id}`),
    /**
     * Новая версия опубликованной записи. Ответ — исходная запись, а сам черновик
     * лежит по links.latest_draft: забираем его, чтобы получить id и bucket.
     */
    async newVersion(recordId: number): Promise<ZenodoDeposition> {
      const r = await call<ZenodoDeposition>('POST', `/deposit/depositions/${recordId}/actions/newversion`);
      const draftUrl = r?.links?.latest_draft;
      if (!draftUrl) throw new ZenodoError('Zenodo не создал черновик новой версии.');
      return call<ZenodoDeposition>('GET', draftUrl);
    },
  };
  return client;
}

export interface PublishedDeposit { doi: string; conceptDoi: string | null; recordId: number; url: string }

/**
 * Весь путь публикации: черновик (новый или новая версия) → файлы → метаданные → publish.
 * Файлы собираются после создания черновика: Zenodo заранее резервирует DOI, и он
 * попадает в README. При сбое до публикации черновик выбрасывается.
 */
export async function publishDeposit(client: ZenodoClient, opts: {
  recordId?: number | null;
  metadata: ZenodoMetadata;
  files: (doi: string | null) => ZenodoFile[] | Promise<ZenodoFile[]>;
}): Promise<PublishedDeposit> {
  const draft = opts.recordId ? await client.newVersion(opts.recordId) : await client.createDeposition();
  if (!draft?.id) throw new ZenodoError('Zenodo не создал черновик записи.');
  try {
    // Новая версия наследует файлы прошлой; набор мог поменяться — начинаем с чистого листа.
    if (opts.recordId) for (const f of await client.listFiles(draft.id)) await client.deleteFile(draft.id, f.id);
    const bucket = draft.links?.bucket;
    if (!bucket) throw new ZenodoError('Zenodo не вернул адрес для загрузки файлов.');
    const files = await opts.files(draft.metadata?.prereserve_doi?.doi ?? null);
    for (const file of files) await client.uploadFile(bucket, file.name, file.data);
    await client.setMetadata(draft.id, opts.metadata);
    const done = await client.publish(draft.id);
    if (!done?.doi) throw new ZenodoError('Zenodo не вернул DOI после публикации.');
    const recordId = done.record_id ?? done.id;
    const site = client.base.replace(/\/api$/, '');
    return {
      doi: done.doi, conceptDoi: done.conceptdoi ?? null, recordId,
      url: done.links?.record_html ?? done.links?.html ?? `${site}/records/${recordId}`,
    };
  } catch (e) {
    await client.discard(draft.id).catch(() => {});
    throw e;
  }
}

/* ------------------------------------ метаданные ------------------------------------ */

export interface ZenodoCreatorInput { name: string; affiliation?: string; orcid?: string }

export interface ZenodoMetadataInput {
  title: string;
  description: string;
  creators: ZenodoCreatorInput[];
  keywords?: string[];
  license: string;
  uploadType: ZenodoUploadType;
  relatedDoi?: string | null;
  version?: string | null;
  liveUrl?: string | null;
  /** YYYY-MM-DD; по умолчанию сегодня. */
  date?: string;
}

export interface ZenodoMetadata {
  upload_type: ZenodoUploadType;
  title: string;
  description: string;
  creators: { name: string; affiliation?: string; orcid?: string }[];
  keywords?: string[];
  license: string;
  access_right: 'open';
  publication_date: string;
  version: string;
  language?: string;
  notes?: string;
  related_identifiers?: { identifier: string; relation: string; scheme: string }[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PATRONYMIC = /(вич|вна|ична|инична|оглы|кызы|қызы|улы|ұлы)$/i;
const SURNAME = /(ов|ев|ёв|ин|ын|ова|ева|ёва|ина|ына|ский|цкий|ская|цкая|енко|ук|юк|ых|их)$/i;

/**
 * Имя автора в формате DataCite «Фамилия, Имя». Порядок слов в русском имени
 * бывает любым, поэтому угадываем: отчество в конце или типичное окончание
 * фамилии в начале → фамилия первая; иначе западный порядок «Имя Фамилия».
 * В форме человек видит результат и может поправить.
 */
export function creatorName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.includes(',')) return s.split(',').map((p) => p.trim()).filter(Boolean).join(', ');
  const words = s.split(' ');
  if (words.length < 2) return s;
  const last = words[words.length - 1];
  const familyFirst = PATRONYMIC.test(last) || (SURNAME.test(words[0]) && !SURNAME.test(last));
  return familyFirst ? `${words[0]}, ${words.slice(1).join(' ')}` : `${last}, ${words.slice(0, -1).join(' ')}`;
}

export function normalizeOrcid(raw: string): string | null {
  const s = raw.trim().replace(/^https?:\/\/(www\.)?orcid\.org\//i, '').toUpperCase();
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(s) ? s : null;
}

export function normalizeDoi(raw: string): string | null {
  const s = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null;
}

/** ISO 639-3 по алфавиту заголовка и описания: казахские буквы → kaz, кириллица → rus, иначе eng. */
function detectLanguage(text: string): string {
  if (/[әғқңөұүһі]/i.test(text)) return 'kaz';
  if (/[а-яё]/i.test(text)) return 'rus';
  return 'eng';
}

function textToHtml(text: string): string {
  return text.trim().split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Форма автора → метаданные депозита. Проверки здесь: Zenodo отвечает на ошибки менее понятно. */
export function buildMetadata(input: ZenodoMetadataInput): ZenodoMetadata {
  const title = input.title.trim();
  if (!title) throw new ZenodoError('Нужно название записи.');
  if (title.length > 500) throw new ZenodoError('Название — не длиннее 500 символов.');
  const creators = input.creators.filter((c) => c.name.trim()).map((c, i) => {
    const out: ZenodoMetadata['creators'][number] = { name: creatorName(c.name) };
    if (c.affiliation?.trim()) out.affiliation = c.affiliation.trim();
    if (c.orcid?.trim()) {
      const orcid = normalizeOrcid(c.orcid);
      if (!orcid) throw new ZenodoError(`ORCID автора ${i + 1} — в виде 0000-0002-1825-0097.`);
      out.orcid = orcid;
    }
    return out;
  });
  if (!creators.length) throw new ZenodoError('Нужен хотя бы один автор.');
  if (!ZENODO_LICENSES.some((l) => l.id === input.license)) throw new ZenodoError('Неизвестная лицензия.');
  const keywords = [...new Set((input.keywords ?? []).map((k) => k.trim()).filter(Boolean))].slice(0, 30);
  const related: NonNullable<ZenodoMetadata['related_identifiers']> = [];
  if (input.relatedDoi?.trim()) {
    const doi = normalizeDoi(input.relatedDoi);
    if (!doi) throw new ZenodoError('DOI статьи — в виде 10.1234/abcd.');
    related.push({ identifier: doi, relation: 'isSupplementTo', scheme: 'doi' });
  }
  const text = input.description.trim() || title;
  const live = input.liveUrl
    ? `<p>Интерактивная версия: <a href="${esc(input.liveUrl)}">${esc(input.liveUrl)}</a></p>` : '';
  const meta: ZenodoMetadata = {
    upload_type: input.uploadType,
    title,
    description: textToHtml(text) + live,
    creators,
    license: input.license,
    access_right: 'open',
    publication_date: input.date ?? today(),
    version: input.version?.trim() || '1',
    language: detectLanguage(`${title} ${text}`),
    notes: 'Подготовлено в Tesseract. Рисунки восстанавливаются из данных: figure.svg — вектор для статьи, README.md — описание файлов.',
  };
  if (keywords.length) meta.keywords = keywords;
  if (related.length) meta.related_identifiers = related;
  return meta;
}

/* -------------------------------------- файлы -------------------------------------- */

export interface FileSource {
  kind: ResearchKind;
  title: string;
  caption: string;
  doc: unknown;
  /** Страница /r/<token>, если материал (или его проект) опубликован по ссылке. */
  liveUrl: string | null;
  /** Самодостаточный HTML тренажёра (для kind = 'sim'). */
  simHtml?: string | null;
}

export interface FilesContext {
  author: string;
  year: number;
  version: string;
  license: string;
  /** Зарезервированный DOI черновика; без него README объясняет, где его взять. */
  doi?: string | null;
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
};

/** Латинские имена файлов: архивы и старые программы спотыкаются о кириллицу в путях. */
export function slugify(s: string): string {
  const t = [...s.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('');
  return t.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const KIND_TEXT: Record<ResearchKind, string> = {
  plot: 'график по экспериментальным данным с аппроксимацией',
  model: 'математическая модель с параметрами и рисунком',
  sim: 'интерактивный тренажёр (HTML-модель)',
};

function citeLine(title: string, ctx: FilesContext): string {
  const where = ctx.doi ? `https://doi.org/${ctx.doi}` : 'DOI указан на странице записи в Zenodo';
  return `${ctx.author || 'Автор'} (${ctx.year}). ${title} (версия ${ctx.version}). Zenodo. ${where}`;
}

/** Файлы одного материала; prefix «01-slug-» — когда материал входит в запись проекта. */
function itemParts(item: FileSource, prefix: string): { files: ZenodoFile[]; readme: string[] } {
  const files: ZenodoFile[] = [];
  const readme: string[] = [];
  const name = (n: string) => `${prefix}${n}`;
  const list: string[] = [];
  const how: string[] = [];

  if (item.kind === 'plot' || item.kind === 'model') {
    const svg = renderDoc(item.kind, item.doc);
    if (svg) {
      files.push({ name: name('figure.svg'), data: svg });
      list.push(`- \`${name('figure.svg')}\` — рисунок в векторе (для статьи, открывается в браузере, Inkscape, Word).`);
    }
  }
  if (item.kind === 'plot') {
    const doc = item.doc as PlotDoc;
    const table = parseTable(doc.data ?? '');
    if (table.rows) {
      files.push({ name: name('data.csv'), data: tableToCsv(table.headers.map(csvCell), table.columns) });
      list.push(`- \`${name('data.csv')}\` — исходные данные (${table.rows} строк; столбцы: ${table.headers.join('; ')}), CSV с точкой в числах.`);
    }
    let built: ReturnType<typeof buildPlot> | null = null;
    try { built = buildPlot(doc); } catch { built = null; }
    const fits = (built?.fits ?? []).map((r, i) => r && ({
      series: doc.series[i]?.label || table.headers[doc.series[i]?.y ?? -1] || `Серия ${i + 1}`,
      model: doc.series[i]?.fit?.model ?? null,
      expr: r.expr, params: r.params, r2: r.r2, rmse: r.rmse, chi2red: r.chi2red, n: r.n, converged: r.converged,
    })).filter((x): x is NonNullable<typeof x> => !!x);
    if (fits.length) {
      files.push({ name: name('fit.json'), data: JSON.stringify(fits, null, 2) });
      list.push(`- \`${name('fit.json')}\` — результаты аппроксимации: параметры с погрешностями, R², RMSE, χ²/ν.`);
      readme.push('### Аппроксимация', '');
      fits.forEach((f) => {
        readme.push(`- ${f.series}: y = ${f.expr}; ${f.params.map((p) => `${p.name} = ${formatWithError(p.value, p.error)}`).join('; ')}; R² = ${f.r2.toFixed(4)}`);
      });
      readme.push('');
    }
    how.push('Рисунок — `figure.svg` в любом браузере; данные — `data.csv` в Excel, LibreOffice, Origin или Python (pandas.read_csv).');
  }
  if (item.kind === 'model') {
    const doc = item.doc as ModelDoc;
    files.push({ name: name('model.json'), data: JSON.stringify(doc, null, 2) });
    list.push(`- \`${name('model.json')}\` — полное описание модели: уравнения, параметры, диапазон, начальные условия.`);
    readme.push(doc.mode === 'ode' ? '### Система ОДУ' : '### Уравнения', '', '```', ...(doc.lines ?? []).filter((l) => l.trim()), '```', '');
    if (doc.params?.length) {
      readme.push('### Параметры', '', '| Параметр | Значение | Мин. | Макс. |', '|---|---|---|---|');
      doc.params.forEach((p) => readme.push(`| ${p.name} | ${p.value} | ${p.min} | ${p.max} |`));
      readme.push('');
    }
    readme.push(`Диапазон: ${doc.mode === 'ode' ? 't' : 'x'} от ${doc.from} до ${doc.to}.`);
    if (doc.mode === 'ode' && doc.initial && Object.keys(doc.initial).length) {
      readme.push(`Начальные условия: ${Object.entries(doc.initial).map(([k, v]) => `${k}(${doc.from}) = ${v}`).join(', ')}.`);
    }
    readme.push('');
    how.push('Рисунок — `figure.svg` в любом браузере; `model.json` — обычный JSON, его читает любой язык.');
  }
  if (item.kind === 'sim') {
    if (!item.simHtml) throw new ZenodoError(`Тренажёр «${item.title}» не найден в библиотеке — его удалили?`);
    files.push({ name: name('model.html'), data: item.simHtml });
    list.push(`- \`${name('model.html')}\` — интерактивная модель одним файлом.`);
    how.push(`Скачайте \`${name('model.html')}\` и откройте в любом браузере (Chrome, Firefox, Safari, Edge) — работает без интернета и без установки.`);
  }
  return { files, readme: ['#### Файлы', '', ...list, '', '#### Как открыть', '', ...how, '', ...readme] };
}

function license(ctx: FilesContext) { return ZENODO_LICENSES.find((l) => l.id === ctx.license)?.label ?? ctx.license; }

function readmeTail(title: string, liveUrl: string | null, ctx: FilesContext): string[] {
  return [
    '## Живая версия', '',
    liveUrl ? `Интерактивная страница со слайдерами и тренажёрами: ${liveUrl}` : 'Живая версия по ссылке не опубликована — всё нужное есть в файлах записи.',
    '',
    '## Как цитировать', '',
    citeLine(title, ctx), '',
    'BibTeX, ГОСТ и APA — на странице записи в Zenodo (кнопка «Cite»).', '',
    `Лицензия: ${license(ctx)}.`, '',
    '_Подготовлено в Tesseract._', '',
  ];
}

export function buildItemFiles(item: FileSource, ctx: FilesContext): ZenodoFile[] {
  const { files, readme } = itemParts(item, '');
  const md = [
    `# ${item.title}`, '',
    ...(item.caption.trim() ? [item.caption.trim(), ''] : []),
    '## Что это', '',
    `${ctx.author ? `${ctx.author}: ` : ''}${KIND_TEXT[item.kind]}.`, '',
    ...readme.map((l) => l.replace(/^#### /, '## ')),
    ...readmeTail(item.title, item.liveUrl, ctx),
  ];
  return [...files, { name: 'README.md', data: md.join('\n') }];
}

export function buildProjectFiles(
  project: { title: string; description: string; liveUrl: string | null }, items: FileSource[], ctx: FilesContext,
): ZenodoFile[] {
  if (!items.length) throw new ZenodoError('В проекте нет материалов — публиковать нечего.');
  const files: ZenodoFile[] = [];
  const sections: string[] = [];
  items.forEach((it, i) => {
    const prefix = `${String(i + 1).padStart(2, '0')}-${slugify(it.title)}-`;
    const part = itemParts(it, prefix);
    files.push(...part.files);
    sections.push(`### ${i + 1}. ${it.title}`, '', `${KIND_TEXT[it.kind][0].toUpperCase()}${KIND_TEXT[it.kind].slice(1)}.`, '');
    if (it.caption.trim()) sections.push(it.caption.trim(), '');
    sections.push(...part.readme);
  });
  const md = [
    `# ${project.title}`, '',
    ...(project.description.trim() ? [project.description.trim(), ''] : []),
    '## Что это', '',
    `Материалы проекта${ctx.author ? ` (${ctx.author})` : ''}: ${items.length} шт. Файлы каждого материала начинаются с его номера — \`01-…\`, \`02-…\`.`, '',
    '## Материалы', '',
    ...sections,
    ...readmeTail(project.title, project.liveUrl, ctx),
  ];
  return [...files, { name: 'README.md', data: md.join('\n') }];
}

/** Размер файла в байтах — для списка «что уйдёт в Zenodo». */
export const fileSize = (f: ZenodoFile) => (typeof f.data === 'string' ? new TextEncoder().encode(f.data).length : f.data.length);

/* ------------------------------------- цитаты ------------------------------------- */

export interface CiteInput { doi: string; title: string; creators: string[]; version: string; year: number; uploadType?: ZenodoUploadType }

const initials = (given: string) => given.split(/[\s-]+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');
const splitName = (n: string) => {
  const [family, given = ''] = n.split(',').map((s) => s.trim());
  return { family, given };
};

/** Готовые строки ссылки: ГОСТ Р 7.0.100, APA 7 и BibTeX — то, что просят журналы и диссертационные советы. */
export function citations(c: CiteInput, locale: Locale = 'ru'): { gost: string; apa: string; bibtex: string } {
  const t = translator(researchFigure, locale);
  const url = `https://doi.org/${c.doi}`;
  const people = c.creators.map(splitName);
  const first = people[0] ?? { family: t('citeAuthor'), given: '' };
  const gostHead = `${first.family}${first.given ? ` ${initials(first.given)}` : ''}`;
  const gostAll = people.map((p) => `${p.given ? `${initials(p.given)} ` : ''}${p.family}`).join(', ');
  const gost = t('doiCiteGost', { head: gostHead, title: c.title, all: gostAll, version: c.version, year: c.year, url, doi: c.doi });
  const apaNames = people.map((p) => `${p.family}${p.given ? `, ${initials(p.given)}` : ''}`);
  const apaAuthors = apaNames.length > 1 ? `${apaNames.slice(0, -1).join(', ')}, & ${apaNames[apaNames.length - 1]}` : apaNames[0] ?? '';
  const type = c.uploadType === 'software' ? ' [Computer software]' : c.uploadType === 'dataset' ? ' [Data set]' : '';
  const apa = `${apaAuthors} (${c.year}). ${c.title} (Version ${c.version})${type}. Zenodo. ${url}`;
  const bib = (s: string) => s.replace(/([&%$#_{}])/g, '\\$1');
  const key = `${slugify(first.family).replace(/-/g, '')}${c.year}${slugify(c.title).split('-')[0] ?? ''}`;
  const bibtex = [
    `@misc{${key},`,
    `  author       = {${people.map((p) => bib(p.given ? `${p.family}, ${p.given}` : p.family)).join(' and ')}},`,
    `  title        = {{${bib(c.title)}}},`,
    `  year         = {${c.year}},`,
    `  publisher    = {Zenodo},`,
    `  version      = {${bib(c.version)}},`,
    `  doi          = {${c.doi}},`,
    `  url          = {${url}},`,
    `  howpublished = {\\url{${url}}}`,
    '}',
  ].join('\n');
  return { gost, apa, bibtex };
}

/** Следующая версия для формы: «1» → «2», «1.2» → «1.3»; нечисловую оставляем человеку. */
export function nextVersion(v: string | null | undefined): string {
  if (!v) return '1';
  const m = /^(.*?)(\d+)$/.exec(v.trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : v;
}
