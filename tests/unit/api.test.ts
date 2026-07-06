import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as listSims } from '@/app/api/simulations/route';
import { GET as getSim, DELETE as delSim } from '@/app/api/simulations/[id]/route';
import { saveSettings, loadSettings } from '@/lib/settings';
import { createSimulation } from '@/lib/storage';

beforeEach(() => {
  process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
});

const profile = { id: 'p1', name: 'n', baseURL: 'http://x', apiKey: 'sk-secret-1234',
  generationModel: 'g', visionModel: 'v' };

describe('settings api', () => {
  it('GET masks api keys', async () => {
    saveSettings({ activeProviderId: 'p1', providers: [profile], qualityMode: 'max' });
    const res = await getSettings();
    const body = await res.json();
    expect(body.providers[0].apiKey).toBe('••••1234');
  });

  it('GET masks short keys without leaking them', async () => {
    const shortKeyProfile = { ...profile, id: 'p2', apiKey: 'abcd' };
    saveSettings({ activeProviderId: 'p2', providers: [shortKeyProfile], qualityMode: 'max' });
    const res = await getSettings();
    const body = await res.json();
    expect(body.providers[0].apiKey).toBe('••••');
  });

  it('PUT with masked key keeps original', async () => {
    saveSettings({ activeProviderId: 'p1', providers: [profile], qualityMode: 'max' });
    const req = new Request('http://t/api/settings', { method: 'PUT',
      body: JSON.stringify({ activeProviderId: 'p1', qualityMode: 'fast',
        providers: [{ ...profile, apiKey: '••••1234' }] }) });
    await putSettings(req);
    const s = loadSettings();
    expect(s.providers[0].apiKey).toBe('sk-secret-1234');
    expect(s.qualityMode).toBe('fast');
  });
});

describe('simulations api', () => {
  it('list, get, delete', async () => {
    const meta = createSimulation(
      { title: 'т', prompt: 'п', subject: 'Физика', tags: [] }, '<html>x</html>');
    const list = await (await listSims()).json();
    expect(list).toHaveLength(1);
    const params = Promise.resolve({ id: meta.id });
    const one = await (await getSim(new Request('http://t'), { params })).json();
    expect(one.html).toBe('<html>x</html>');
    await delSim(new Request('http://t'), { params: Promise.resolve({ id: meta.id }) });
    expect(await (await listSims()).json()).toHaveLength(0);
  });
});
