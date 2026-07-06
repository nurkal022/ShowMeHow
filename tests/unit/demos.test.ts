import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listBundledDemos, installDemos } from '@/lib/demos';
import { listSimulations, getArtifact, getThumbnailPath } from '@/lib/storage';
import type { RenderReport } from '@/lib/types';
import type { RenderFn } from '@/lib/renderer';

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
    const result = await installDemos(fakeRender);
    expect(result.installed).toEqual(['test-demo']);
    expect(result.skipped).toEqual([]);

    const sims = listSimulations();
    expect(sims).toHaveLength(1);
    expect(sims[0].demo).toBe('test-demo');
    expect(sims[0].title).toBe('Тестовая демка');

    const html = getArtifact(sims[0].id);
    expect(html).toContain('showmehow-runtime');

    const thumb = getThumbnailPath(sims[0].id);
    expect(thumb).not.toBeNull();
  });

  it('installDemos is idempotent: second run skips already-installed demo, library does not grow', async () => {
    writeDemo(demosDir, 'test-demo');
    await installDemos(fakeRender);
    const second = await installDemos(fakeRender);
    expect(second.installed).toEqual([]);
    expect(second.skipped).toEqual(['test-demo']);
    expect(listSimulations()).toHaveLength(1);
  });
});
