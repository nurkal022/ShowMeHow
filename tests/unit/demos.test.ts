import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listBundledDemos, installDemos } from '@/lib/demos';
import { listSimulations, getArtifact, getThumbnailPath } from '@/lib/storage';
import type { RenderReport } from '@/lib/types';
import type { RenderFn } from '@/lib/renderer';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';
const TEST_OWNER_ID = '11111111-1111-1111-1111-111111111111';

const FIXTURE_HTML = `<!DOCTYPE html><html><head><title>fixture</title></head><body>
<canvas id="c" width="400" height="300"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  let x = 0;
  (function loop() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = '#4f8ff7'; ctx.fillRect((x += 2) % 400, 100, 40, 40);
    requestAnimationFrame(loop);
  })();
</script></body></html>`;

const FIXTURE_META = {
  title: 'Тестовая демка',
  prompt: 'нарисуй тестовую анимацию',
  subject: 'Физика',
  tags: ['тест', 'canvas'],
};

function writeDemo(demosDir: string, slug: string, opts: { meta?: boolean; artifact?: boolean } = {}) {
  const { meta = true, artifact = true } = opts;
  const dir = path.join(demosDir, slug);
  fs.mkdirSync(dir, { recursive: true });
  if (meta) fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(FIXTURE_META, null, 2));
  if (artifact) fs.writeFileSync(path.join(dir, 'artifact.html'), FIXTURE_HTML);
}

const fakeRender: RenderFn = async (): Promise<RenderReport> => ({
  ok: true,
  errors: [],
  animated: true,
  screenshots: [Buffer.from('fake-png-bytes')],
});

describe('demos', () => {
  let demosDir: string;

  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-data-'));
    demosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-demos-'));
    process.env.SHOWMEHOW_DEMOS_DIR = demosDir;
    __setRepoForTests(createMemoryRepo());
  });

  it('listBundledDemos finds a fixture demo with both files', () => {
    writeDemo(demosDir, 'test-demo');
    const demos = listBundledDemos();
    expect(demos).toHaveLength(1);
    expect(demos[0]).toMatchObject({
      slug: 'test-demo',
      title: 'Тестовая демка',
      prompt: 'нарисуй тестовую анимацию',
      subject: 'Физика',
      tags: ['тест', 'canvas'],
    });
    expect(demos[0].html).toContain('requestAnimationFrame');
  });

  it('listBundledDemos skips a folder missing meta.json', () => {
    writeDemo(demosDir, 'no-meta', { meta: false });
    expect(listBundledDemos()).toHaveLength(0);
  });

  it('listBundledDemos skips a folder missing artifact.html', () => {
    writeDemo(demosDir, 'no-artifact', { artifact: false });
    expect(listBundledDemos()).toHaveLength(0);
  });

  it('installDemos installs the fixture with a fake render (instrumented artifact, demo tag, thumbnail)', async () => {
    writeDemo(demosDir, 'test-demo');
    const result = await installDemos(TEST_OWNER_ID, fakeRender);
    expect(result.installed).toEqual(['test-demo']);
    expect(result.skipped).toEqual([]);

    const sims = await listSimulations(TEST_OWNER_ID);
    expect(sims).toHaveLength(1);
    expect(sims[0].demo).toBe('test-demo');
    expect(sims[0].title).toBe('Тестовая демка');

    const html = await getArtifact(TEST_OWNER_ID, sims[0].id);
    expect(html).toContain('showmehow-runtime');

    const thumb = await getThumbnailPath(TEST_OWNER_ID, sims[0].id);
    expect(thumb).not.toBeNull();
  });

  it('installDemos is idempotent: second run skips already-installed demo, library does not grow', async () => {
    writeDemo(demosDir, 'test-demo');
    await installDemos(TEST_OWNER_ID, fakeRender);
    const second = await installDemos(TEST_OWNER_ID, fakeRender);
    expect(second.installed).toEqual([]);
    expect(second.skipped).toEqual(['test-demo']);
    expect(await listSimulations(TEST_OWNER_ID)).toHaveLength(1);
  });

  it('concurrent installDemos calls share one run: no duplicate installs', async () => {
    writeDemo(demosDir, 'test-demo');
    writeDemo(demosDir, 'another-demo');
    const [first, second] = await Promise.all(
      [installDemos(TEST_OWNER_ID, fakeRender), installDemos(TEST_OWNER_ID, fakeRender)]);
    expect(first).toEqual(second);
    expect(first.installed.sort()).toEqual(['another-demo', 'test-demo']);
    expect(first.skipped).toEqual([]);
    expect(await listSimulations(TEST_OWNER_ID)).toHaveLength(2);
    // после завершения in-flight запуск сбрасывается — следующий вызов не переиспользует старый промис
    const third = await installDemos(TEST_OWNER_ID, fakeRender);
    expect(third.installed).toEqual([]);
    expect(third.skipped.sort()).toEqual(['another-demo', 'test-demo']);
  });
});
