import { describe, expect, it } from 'vitest';
import { inlineSimLibs, type BytesFetcher } from '@/lib/lms/offline-libs';
import { offlineFileName, offlineLessonHtml, offlineNeeds } from '@/lib/lms/offline';
import type { StudentBlockBody } from '@/lib/lms/block-schema';

const THREE = 'https://cdn.jsdelivr.net/npm/three@0.164.0/build/three.module.min.js';
const ORBIT = 'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/controls/OrbitControls.js';
const UTILS = 'https://cdn.jsdelivr.net/npm/three@0.164.0/examples/jsm/utils/Helpers.js';
const P5 = 'https://cdn.jsdelivr.net/npm/p5@1.9.3/lib/p5.min.js';

const files: Record<string, string> = {
  [THREE]: 'export const Vector3 = 1;',
  [ORBIT]: "import { Vector3 } from 'three';\nimport { h } from '../utils/Helpers.js';\nexport class OrbitControls {}",
  [UTILS]: 'export const h = 1; const s = "</script>";',
  [P5]: 'window.p5 = function () {}; var t = "</script>";',
};
const fetcher: BytesFetcher = async (url) => (files[url] ? Buffer.from(files[url]) : null);
const decode = (d: string) => Buffer.from(d.split(',')[1], 'base64').toString('utf8');

describe('офлайн-урок: библиотеки внутрь тренажёра', () => {
  it('модули three и аддоны уходят в importmap data:-адресами, относительные импорты — полными адресами', async () => {
    const html = `<head><script type="importmap">${JSON.stringify({ imports: { three: THREE, 'three/addons/': ORBIT.replace('controls/OrbitControls.js', '') } })}</script></head>`
      + `<script type="module">import * as THREE from 'three'; import { OrbitControls } from 'three/addons/controls/OrbitControls.js';</script>`;
    const out = await inlineSimLibs(html, fetcher);
    const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(out)![1]).imports as Record<string, string>;
    expect(map.three.startsWith('data:text/javascript;base64,')).toBe(true);
    expect(map[THREE]).toBe(map.three);
    expect(decode(map['three/addons/controls/OrbitControls.js'])).toContain(`from '${UTILS}'`);
    expect(decode(map[UTILS])).toContain('export const h');
  });

  it('классический скрипт с CDN становится встроенным, закрывающий тег в тексте экранируется', async () => {
    const out = await inlineSimLibs(`<script src="${P5}" integrity="sha-x" crossorigin="anonymous"></script><p>ok</p>`, fetcher);
    expect(out).not.toContain(P5);
    expect(out).not.toContain('integrity');
    expect(out).toContain('<\\/script>');
    expect(out).toContain('<p>ok</p>');
  });

  it('чужие адреса не трогаем и не скачиваем', async () => {
    const asked: string[] = [];
    const html = '<script src="https://evil.example/x.js"></script>';
    expect(await inlineSimLibs(html, async (u) => { asked.push(u); return null; })).toBe(html);
    expect(asked).toEqual([]);
  });
});

describe('офлайн-урок: страница', () => {
  const blocks: StudentBlockBody[] = [
    { kind: 'text', payload: { title: 'Закон Ома', body: 'Сила тока $I = U/R$.' } },
    { kind: 'simulation', payload: { simulationId: 'sim1', caption: 'Цепь', preset: { R: 5 }, locked: ['U'] } },
    { kind: 'image', payload: { src: '/api/lms/assets/x', alt: 'схема', caption: '', wide: false } },
    {
      kind: 'assignment', payload: {
        prompt: 'Выберите', points: 10, stand: null, allowRetry: true, rubric: [],
        spec: { type: 'choice', multiple: false, options: [{ id: 'a', text: 'Один' }, { id: 'b', text: 'Два' }] },
      },
    },
  ];

  it('собирает всё в один файл: тренажёр в srcdoc со стартовыми значениями, картинка внутри, формула KaTeX', () => {
    expect(offlineNeeds(blocks)).toEqual({ sims: ['sim1'], images: ['/api/lms/assets/x'] });
    const html = offlineLessonHtml({
      locale: 'ru', courseTitle: 'Физика', topicTitle: 'Ток', origin: 'https://t.kz', siteHref: 'https://t.kz/learn/topics/1',
      blocks, sims: new Map([['sim1', '<p class="x">"сим" & co</p>']]), images: new Map([['/api/lms/assets/x', 'data:image/png;base64,AA']]),
      katexCss: '.katex{}', now: new Date('2026-10-27T10:00:00Z'),
    });
    expect(html).toContain('srcdoc="&lt;p class=&quot;x&quot;>&quot;сим&quot; &amp; co&lt;/p>"'.replace('&lt;', '<').replace('&lt;', '<'));
    expect(html).toContain('data-preset="{&quot;controls&quot;:{&quot;R&quot;:5},&quot;locked&quot;:[&quot;U&quot;]}"');
    expect(html).toContain('src="data:image/png;base64,AA"');
    expect(html).toContain('class="katex');
    expect(html).toContain('Один');
    expect(html).not.toContain('correct');
    expect(html).toContain('27 октября 2026');
  });

  it('имя файла без запрещённых символов', () => {
    expect(offlineFileName('Тема: ток/напряжение?')).toBe('Тема ток напряжение.html');
  });
});
