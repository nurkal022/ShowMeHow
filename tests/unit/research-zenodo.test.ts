import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, SecretError } from '@/lib/research/secret';
import {
  buildItemFiles, buildMetadata, buildProjectFiles, citations, createZenodoClient, creatorName, nextVersion, publishDeposit,
  ZenodoError, zenodoErrorMessage, type FilesContext,
} from '@/lib/research/zenodo';
import { newModelDoc, newPlotDoc } from '@/lib/research/doc';

describe('secret', () => {
  let dir: string;
  const env = { ...process.env };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-secret-'));
    process.env.SHOWMEHOW_DATA_DIR = dir;
    delete process.env.SHOWMEHOW_SECRET_KEY;
  });
  afterEach(() => { process.env = { ...env }; fs.rmSync(dir, { recursive: true, force: true }); });

  it('шифрует и расшифровывает, ключ создаётся в data/secret.key с правами 0600', () => {
    const s = encryptSecret('zenodo-token-123', 'zenodo:u1');
    expect(s).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(s).not.toContain('zenodo-token-123');
    expect(decryptSecret(s, 'zenodo:u1')).toBe('zenodo-token-123');
    const stat = fs.statSync(path.join(dir, 'secret.key'));
    expect(stat.mode & 0o777).toBe(0o600);
    // Одинаковый текст — разный шифротекст (случайный IV).
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('ловит подмену данных, метки и чужой aad', () => {
    const s = encryptSecret('secret', 'zenodo:u1');
    const [v, iv, tag, data] = s.split(':');
    const flip = (b64: string) => { const b = Buffer.from(b64, 'base64'); b[0] ^= 1; return b.toString('base64'); };
    expect(() => decryptSecret([v, iv, tag, flip(data)].join(':'), 'zenodo:u1')).toThrow(SecretError);
    expect(() => decryptSecret([v, iv, flip(tag), data].join(':'), 'zenodo:u1')).toThrow(SecretError);
    expect(() => decryptSecret(s, 'zenodo:u2')).toThrow(SecretError);
    expect(() => decryptSecret('garbage', 'zenodo:u1')).toThrow(SecretError);
  });

  it('ключ из окружения: другой ключ не расшифрует', () => {
    process.env.SHOWMEHOW_SECRET_KEY = 'a'.repeat(64);
    const s = encryptSecret('t');
    expect(decryptSecret(s)).toBe('t');
    process.env.SHOWMEHOW_SECRET_KEY = 'any passphrase';
    expect(() => decryptSecret(s)).toThrow(SecretError);
    expect(fs.existsSync(path.join(dir, 'secret.key'))).toBe(false);
  });
});

/* ------------------------------- поддельный Zenodo ------------------------------- */

interface Call { method: string; url: string; headers: Record<string, string>; body: unknown }

function fakeZenodo(routes: (c: Call) => { status: number; body?: unknown } | undefined) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: unknown = init?.body;
    if (headers['Content-Type'] === 'application/json' && typeof body === 'string') body = JSON.parse(body);
    const call = { method: init?.method ?? 'GET', url, headers, body };
    calls.push(call);
    const r = routes(call) ?? { status: 404, body: { status: 404, message: 'nope' } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  };
  return { calls, fetch };
}

const API = 'https://sandbox.zenodo.org/api';
const BUCKET = `${API}/files/bucket-1`;
const META = buildMetadata({
  title: 'Разряд конденсатора', description: 'Данные', creators: [{ name: 'Иван Петров' }],
  license: 'cc-by-4.0', uploadType: 'dataset', version: '1', date: '2026-09-26',
});

describe('Zenodo client', () => {
  it('полный путь публикации: депозит → bucket PUT → метаданные → publish', async () => {
    const z = fakeZenodo((c) => {
      if (c.method === 'POST' && c.url === `${API}/deposit/depositions`) {
        return { status: 201, body: { id: 77, links: { bucket: BUCKET }, metadata: { prereserve_doi: { doi: '10.5072/zenodo.77' } } } };
      }
      if (c.method === 'PUT' && c.url.startsWith(BUCKET)) return { status: 201, body: {} };
      if (c.method === 'PUT' && c.url === `${API}/deposit/depositions/77`) return { status: 200, body: { id: 77 } };
      if (c.method === 'POST' && c.url === `${API}/deposit/depositions/77/actions/publish`) {
        return { status: 202, body: { id: 77, record_id: 77, doi: '10.5072/zenodo.77', conceptdoi: '10.5072/zenodo.76', links: { record_html: 'https://sandbox.zenodo.org/records/77' } } };
      }
    });
    const client = createZenodoClient({ token: 'tok', sandbox: true, fetch: z.fetch });
    let seenDoi: string | null = null;
    const done = await publishDeposit(client, {
      metadata: META,
      files: (doi) => { seenDoi = doi; return [{ name: 'README.md', data: `DOI ${doi}` }, { name: 'figure.png', data: new Uint8Array([1, 2]) }]; },
    });
    expect(done).toEqual({ doi: '10.5072/zenodo.77', conceptDoi: '10.5072/zenodo.76', recordId: 77, url: 'https://sandbox.zenodo.org/records/77' });
    expect(seenDoi).toBe('10.5072/zenodo.77');
    expect(z.calls.map((c) => `${c.method} ${c.url.replace(API, '')}`)).toEqual([
      'POST /deposit/depositions',
      'PUT /files/bucket-1/README.md',
      'PUT /files/bucket-1/figure.png',
      'PUT /deposit/depositions/77',
      'POST /deposit/depositions/77/actions/publish',
    ]);
    expect(z.calls.every((c) => c.headers.Authorization === 'Bearer tok')).toBe(true);
    expect(z.calls[1].headers['Content-Type']).toBe('application/octet-stream');
    expect(z.calls[1].body).toBe('DOI 10.5072/zenodo.77');
    expect(z.calls[3].body).toEqual({ metadata: META });
  });

  it('новая версия: newversion → latest_draft → удаление старых файлов → загрузка → publish', async () => {
    const z = fakeZenodo((c) => {
      if (c.method === 'POST' && c.url === `${API}/deposit/depositions/77/actions/newversion`) {
        return { status: 201, body: { id: 77, links: { latest_draft: `${API}/deposit/depositions/78` } } };
      }
      if (c.method === 'GET' && c.url === `${API}/deposit/depositions/78`) {
        return { status: 200, body: { id: 78, links: { bucket: `${API}/files/bucket-2` }, metadata: { prereserve_doi: { doi: '10.5072/zenodo.78' } } } };
      }
      if (c.method === 'GET' && c.url === `${API}/deposit/depositions/78/files`) {
        return { status: 200, body: [{ id: 'f1', filename: 'old.svg' }, { id: 'f2', filename: 'README.md' }] };
      }
      if (c.method === 'DELETE') return { status: 204 };
      if (c.method === 'PUT') return { status: 200, body: {} };
      if (c.method === 'POST' && c.url.endsWith('/78/actions/publish')) {
        return { status: 202, body: { id: 78, doi: '10.5072/zenodo.78', conceptdoi: '10.5072/zenodo.76', links: { html: 'https://sandbox.zenodo.org/deposit/78' } } };
      }
    });
    const client = createZenodoClient({ token: 'tok', sandbox: true, fetch: z.fetch });
    const done = await publishDeposit(client, { recordId: 77, metadata: META, files: () => [{ name: 'README.md', data: 'v2' }] });
    expect(done.recordId).toBe(78);
    expect(done.doi).toBe('10.5072/zenodo.78');
    expect(z.calls.map((c) => `${c.method} ${c.url.replace(API, '')}`)).toEqual([
      'POST /deposit/depositions/77/actions/newversion',
      'GET /deposit/depositions/78',
      'GET /deposit/depositions/78/files',
      'DELETE /deposit/depositions/78/files/f1',
      'DELETE /deposit/depositions/78/files/f2',
      'PUT /files/bucket-2/README.md',
      'PUT /deposit/depositions/78',
      'POST /deposit/depositions/78/actions/publish',
    ]);
  });

  it('ошибка до публикации выбрасывает черновик; 400 разворачивается в список полей', async () => {
    const z = fakeZenodo((c) => {
      if (c.method === 'POST' && c.url.endsWith('/deposit/depositions')) return { status: 201, body: { id: 5, links: { bucket: BUCKET } } };
      if (c.method === 'PUT' && c.url.startsWith(BUCKET)) return { status: 201, body: {} };
      if (c.method === 'PUT') {
        return { status: 400, body: { status: 400, message: 'Validation error.', errors: [{ field: 'metadata.creators.0.orcid', message: 'Not a valid ORCID.' }] } };
      }
      if (c.method === 'DELETE') return { status: 204 };
    });
    const client = createZenodoClient({ token: 'tok', sandbox: true, fetch: z.fetch });
    const err = await publishDeposit(client, { metadata: META, files: () => [{ name: 'a.txt', data: 'a' }] }).catch((e) => e);
    expect(err).toBeInstanceOf(ZenodoError);
    expect(err.message).toBe('Zenodo отклонил запрос: creators.0.orcid: Not a valid ORCID.');
    expect(z.calls.at(-1)).toMatchObject({ method: 'DELETE', url: `${API}/deposit/depositions/5` });
  });

  it('человеческие ошибки', async () => {
    expect(zenodoErrorMessage(401, {})).toMatch(/Токен Zenodo недействителен.*deposit:write\/deposit:actions/);
    expect(zenodoErrorMessage(403, null)).toMatch(/Токен Zenodo/);
    expect(zenodoErrorMessage(400, { errors: [{ field: 'metadata.title', messages: ['Required.', 'Too short.'] }] }))
      .toBe('Zenodo отклонил запрос: title: Required.; Too short.');
    expect(zenodoErrorMessage(503, null)).toMatch(/временно недоступен/);
    const z = fakeZenodo(() => ({ status: 401, body: { message: 'unauthorized' } }));
    await expect(createZenodoClient({ token: 'bad', fetch: z.fetch }).check()).rejects.toThrow(/Токен Zenodo недействителен/);
    expect(z.calls[0].url).toBe('https://zenodo.org/api/deposit/depositions?size=1');
    const down = createZenodoClient({ token: 't', fetch: async () => { throw new Error('ECONNREFUSED'); } });
    await expect(down.check()).rejects.toThrow('Не удалось связаться с Zenodo: ECONNREFUSED.');
  });

  it('не отправляет токен на чужой хост из ответа', async () => {
    const z = fakeZenodo((c) => (c.method === 'POST' ? { status: 201, body: { id: 1, links: { bucket: 'https://evil.example/files/x' } } } : { status: 204 }));
    const client = createZenodoClient({ token: 'tok', fetch: z.fetch });
    await expect(publishDeposit(client, { metadata: META, files: () => [{ name: 'a', data: 'a' }] })).rejects.toThrow(/другом сервере/);
    expect(z.calls.some((c) => c.url.includes('evil.example'))).toBe(false);
  });
});

describe('buildMetadata', () => {
  it('авторы «Фамилия, Имя», ORCID, связанный DOI, лицензия, язык', () => {
    const m = buildMetadata({
      title: 'Затухающие колебания', description: 'Строка 1\nстрока <2>\n\nАбзац',
      creators: [
        { name: 'Иван Петров', affiliation: ' КазНУ ', orcid: 'https://orcid.org/0000-0002-1825-0097' },
        { name: 'Иванов Иван Иванович' },
        { name: 'Marie Curie' },
        { name: 'Curie,Pierre' },
        { name: '   ' },
      ],
      keywords: ['физика', ' физика ', '', 'колебания'],
      license: 'cc-by-sa-4.0', uploadType: 'dataset', relatedDoi: 'https://doi.org/10.1103/PhysRev.47.777',
      liveUrl: 'https://t.example/r/abc', date: '2026-01-02',
    });
    expect(m.creators).toEqual([
      { name: 'Петров, Иван', affiliation: 'КазНУ', orcid: '0000-0002-1825-0097' },
      { name: 'Иванов, Иван Иванович' },
      { name: 'Curie, Marie' },
      { name: 'Curie, Pierre' },
    ]);
    expect(m.related_identifiers).toEqual([{ identifier: '10.1103/PhysRev.47.777', relation: 'isSupplementTo', scheme: 'doi' }]);
    expect(m.license).toBe('cc-by-sa-4.0');
    expect(m.keywords).toEqual(['физика', 'колебания']);
    expect(m.access_right).toBe('open');
    expect(m.upload_type).toBe('dataset');
    expect(m.language).toBe('rus');
    expect(m.version).toBe('1');
    expect(m.publication_date).toBe('2026-01-02');
    expect(m.description).toBe('<p>Строка 1<br>строка &lt;2&gt;</p><p>Абзац</p><p>Интерактивная версия: <a href="https://t.example/r/abc">https://t.example/r/abc</a></p>');
  });

  it('отказывает на неверных ORCID, DOI, лицензии и без авторов', () => {
    const base = { title: 'T', description: '', creators: [{ name: 'A B' }], license: 'cc-by-4.0', uploadType: 'dataset' as const };
    expect(() => buildMetadata({ ...base, creators: [{ name: 'A B', orcid: '1234' }] })).toThrow(/ORCID/);
    expect(() => buildMetadata({ ...base, relatedDoi: 'not-a-doi' })).toThrow(/DOI/);
    expect(() => buildMetadata({ ...base, license: 'gpl' })).toThrow(/лицензия/);
    expect(() => buildMetadata({ ...base, creators: [] })).toThrow(/автор/);
    expect(buildMetadata(base).description).toBe('<p>T</p>');
  });

  it('creatorName и nextVersion', () => {
    expect(creatorName('Петрова Анна')).toBe('Петрова, Анна');
    expect(creatorName('Plato')).toBe('Plato');
    expect(nextVersion('1')).toBe('2');
    expect(nextVersion('1.9')).toBe('1.10');
    expect(nextVersion(null)).toBe('1');
  });
});

describe('файлы записи и цитаты', () => {
  const ctx: FilesContext = { author: 'Петров, Иван', year: 2026, version: '1', license: 'cc-by-4.0', doi: '10.5281/zenodo.1' };

  it('график: figure.svg, data.csv (заголовки с запятой в кавычках), fit.json, README', () => {
    const files = buildItemFiles({ kind: 'plot', title: 'Разряд', caption: 'Рис. 1', doc: newPlotDoc(), liveUrl: 'https://t/r/x' }, ctx);
    expect(files.map((f) => f.name)).toEqual(['figure.svg', 'data.csv', 'fit.json', 'README.md']);
    const csv = String(files[1].data).split('\n');
    expect(csv[0]).toBe('"t, с","U, В","σU, В"');
    expect(csv[1]).toBe('0,9.92,0.15');
    const fits = JSON.parse(String(files[2].data));
    expect(fits[0].params.length).toBeGreaterThan(0);
    const readme = String(files[3].data);
    expect(readme).toContain('https://t/r/x');
    expect(readme).toContain('https://doi.org/10.5281/zenodo.1');
  });

  it('модель: model.json и уравнения с параметрами в README; тренажёр — model.html', () => {
    const files = buildItemFiles({ kind: 'model', title: 'Колебания', caption: '', doc: newModelDoc(), liveUrl: null }, ctx);
    expect(files.map((f) => f.name)).toEqual(['figure.svg', 'model.json', 'README.md']);
    expect(String(files[2].data)).toContain('x = A*exp(-g*t)*cos(w*t)');
    expect(String(files[2].data)).toContain('| g | 0.3 | 0 | 2 |');
    const sim = buildItemFiles({ kind: 'sim', title: 'Маятник', caption: '', doc: {}, liveUrl: null, simHtml: '<html></html>' }, ctx);
    expect(sim.map((f) => f.name)).toEqual(['model.html', 'README.md']);
    expect(String(sim[1].data)).toMatch(/без интернета/);
    expect(() => buildItemFiles({ kind: 'sim', title: 'X', caption: '', doc: {}, liveUrl: null, simHtml: null }, ctx)).toThrow(ZenodoError);
  });

  it('проект: префиксы 01-slug-, общий README', () => {
    const files = buildProjectFiles({ title: 'Работа', description: 'Аннотация', liveUrl: null }, [
      { kind: 'model', title: 'Затухающие колебания', caption: '', doc: newModelDoc(), liveUrl: null },
      { kind: 'sim', title: 'Маятник', caption: '', doc: {}, liveUrl: null, simHtml: '<html/>' },
    ], ctx);
    expect(files.map((f) => f.name)).toEqual([
      '01-zatuhayuschie-kolebaniya-figure.svg', '01-zatuhayuschie-kolebaniya-model.json', '02-mayatnik-model.html', 'README.md',
    ]);
    expect(String(files[3].data)).toContain('Аннотация');
  });

  it('ГОСТ, APA и BibTeX', () => {
    const c = citations({ doi: '10.5281/zenodo.1', title: 'Разряд', creators: ['Петров, Иван Сергеевич', 'Curie, Marie'], version: '2', year: 2026, uploadType: 'dataset' });
    expect(c.gost).toBe('Петров И. С. Разряд [Электронный ресурс] / И. С. Петров, M. Curie. — Версия 2. — Zenodo, 2026. — URL: https://doi.org/10.5281/zenodo.1. — DOI: 10.5281/zenodo.1.');
    expect(c.apa).toBe('Петров, И. С., & Curie, M. (2026). Разряд (Version 2) [Data set]. Zenodo. https://doi.org/10.5281/zenodo.1');
    expect(c.bibtex).toMatch(/^@misc\{petrov2026razryad,/);
    expect(c.bibtex).toContain('author       = {Петров, Иван Сергеевич and Curie, Marie}');
    expect(c.bibtex).toContain('publisher    = {Zenodo}');
    expect(c.bibtex).toContain('doi          = {10.5281/zenodo.1}');
    expect(c.bibtex).toContain('howpublished = {\\url{https://doi.org/10.5281/zenodo.1}}');
  });
});
