import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET as listSims } from '@/app/api/simulations/route';
import { GET as getSim, DELETE as delSim } from '@/app/api/simulations/[id]/route';
import { GET as getExport } from '@/app/api/simulations/[id]/export/route';
import { GET as getThumbnail } from '@/app/api/simulations/[id]/thumbnail/route';
import { GET as getHistory, POST as postHistory } from '@/app/api/simulations/[id]/history/route';
import { createSimulation, updateArtifact, getRenderableArtifact } from '@/lib/storage';
import { reinstrument } from '@/lib/artifact';
import { __setRepoForTests, createMemoryRepo } from '@/lib/db/repo';
import { TEMP_OWNER_ID } from '@/lib/auth/current';

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  __setRepoForTests(createMemoryRepo());
});

describe('simulations api', () => {
  it('list, get, delete', async () => {
    const meta = await createSimulation(
      TEMP_OWNER_ID, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
    const list = await (await listSims()).json();
    expect(list).toHaveLength(1);
    const params = Promise.resolve({ id: meta.id });
    const one = await (await getSim(new Request('http://t'), { params })).json();
    // GET now serves getRenderableArtifact — a freshly re-instrumented copy, not the raw bytes.
    expect(one.html).toBe(reinstrument('<html>x</html>'));
    await delSim(new Request('http://t'), { params: Promise.resolve({ id: meta.id }) });
    expect(await (await listSims()).json()).toHaveLength(0);
  });

  const UNKNOWN_UUID = '00000000-0000-0000-0000-000000000000';
  const EVIL_ID = '../evil';

  it('GET returns 400 for a path-traversal id and 404 for an unknown id', async () => {
    const evil = await getSim(new Request('http://t'), { params: Promise.resolve({ id: EVIL_ID }) });
    expect(evil.status).toBe(400);
    const unknown = await getSim(new Request('http://t'), { params: Promise.resolve({ id: UNKNOWN_UUID }) });
    expect(unknown.status).toBe(404);
  });

  it('export route returns 400 for a path-traversal id and 404 for an unknown id', async () => {
    const evil = await getExport(new Request('http://t'), { params: Promise.resolve({ id: EVIL_ID }) });
    expect(evil.status).toBe(400);
    const unknown = await getExport(new Request('http://t'), { params: Promise.resolve({ id: UNKNOWN_UUID }) });
    expect(unknown.status).toBe(404);
  });

  it('thumbnail route returns 400 for a path-traversal id and 404 for an unknown id', async () => {
    const evil = await getThumbnail(new Request('http://t'), { params: Promise.resolve({ id: EVIL_ID }) });
    expect(evil.status).toBe(400);
    const unknown = await getThumbnail(new Request('http://t'), { params: Promise.resolve({ id: UNKNOWN_UUID }) });
    expect(unknown.status).toBe(404);
  });

  it('DELETE returns 400 for a path-traversal id but is idempotent 200 for an unknown valid id', async () => {
    const evil = await delSim(new Request('http://t'), { params: Promise.resolve({ id: EVIL_ID }) });
    expect(evil.status).toBe(400);
    const unknown = await delSim(new Request('http://t'), { params: Promise.resolve({ id: UNKNOWN_UUID }) });
    expect(unknown.status).toBe(200);
  });
});

describe('getRenderableArtifact', () => {
  const META = { title: 'T', prompt: 'p', subject: 'Физика', tags: ['x'] };

  it('injects the current runtime into a raw stored artifact', async () => {
    const { id } = await createSimulation(
      TEMP_OWNER_ID,
      META,
      '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>',
    );
    const html = (await getRenderableArtifact(TEMP_OWNER_ID, id))!;
    expect(html).toContain('<!--showmehow-runtime-->');
    expect(html).toContain('<!--/showmehow-runtime-->');
  });

  it('upgrades a legacy-instrumented stored artifact to a single current block', async () => {
    const legacy = '<!DOCTYPE html><html><head>' +
      '<!--showmehow-runtime--><script>/*old*/</script><style>.o{}</style><script>/*old*/</script>' +
      '<title>t</title></head><body></body></html>';
    const { id } = await createSimulation(TEMP_OWNER_ID, META, legacy);
    const html = (await getRenderableArtifact(TEMP_OWNER_ID, id))!;
    expect(html).not.toContain('/*old*/');
    expect(html.split('<!--showmehow-runtime-->').length - 1).toBe(1);
  });
});

describe('history api', () => {
  it('lists history after an update and restores a version round-trip', async () => {
    const meta = await createSimulation(
      TEMP_OWNER_ID, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>v1</html>');
    await updateArtifact(TEMP_OWNER_ID, meta.id, '<html>v2</html>');
    const params = Promise.resolve({ id: meta.id });

    const list = await (await getHistory(new Request('http://t'), { params })).json();
    expect(list).toHaveLength(1);

    const res = await postHistory(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ name: list[0] }) }),
      { params },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // POST /history now returns getRenderableArtifact — freshly re-instrumented.
    expect(body.html).toBe(reinstrument('<html>v1</html>'));
  });

  it('GET returns 404 for an unknown simulation id', async () => {
    const res = await getHistory(new Request('http://t'),
      { params: Promise.resolve({ id: 'does-not-exist' }) });
    expect(res.status).toBe(404);
  });

  it('POST returns 400 for a path-traversal name', async () => {
    const meta = await createSimulation(
      TEMP_OWNER_ID, { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>v1</html>');
    await updateArtifact(TEMP_OWNER_ID, meta.id, '<html>v2</html>');
    const res = await postHistory(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ name: '../../etc/passwd' }) }),
      { params: Promise.resolve({ id: meta.id }) },
    );
    expect(res.status).toBe(400);
  });

  it('POST returns 404 for an unknown simulation id', async () => {
    const res = await postHistory(
      new Request('http://t', { method: 'POST', body: JSON.stringify({ name: 'whatever.html' }) }),
      { params: Promise.resolve({ id: 'does-not-exist' }) },
    );
    expect(res.status).toBe(404);
  });
});
