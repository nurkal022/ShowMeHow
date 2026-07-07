import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings, saveSettings, activeProvider, dataDir, resolveMode } from '@/lib/settings';

describe('settings', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  });

  it('returns defaults when file missing', () => {
    const s = loadSettings();
    expect(s.qualityMode).toBe('max');
    expect(s.providers).toEqual([]);
    expect(s.activeProviderId).toBeNull();
  });

  it('round-trips settings', () => {
    const s = loadSettings();
    s.providers.push({ id: 'p1', name: 'test', baseURL: 'http://x', apiKey: 'k',
      generationModel: 'm', visionModel: 'mv' });
    s.activeProviderId = 'p1';
    saveSettings(s);
    const loaded = loadSettings();
    expect(loaded.activeProviderId).toBe('p1');
    expect(activeProvider(loaded)?.name).toBe('test');
    expect(fs.existsSync(path.join(dataDir(), 'settings.json'))).toBe(true);
  });

  it('activeProvider is null when id not found', () => {
    expect(activeProvider(loadSettings())).toBeNull();
  });

  it('falls back to defaults on corrupt JSON in settings.json', () => {
    fs.writeFileSync(path.join(dataDir(), 'settings.json'), '{ not valid json');
    const s = loadSettings();
    expect(s).toEqual({ activeProviderId: null, providers: [], qualityMode: 'max' });
  });

  it('falls back to defaults when qualityMode has an invalid value', () => {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(path.join(dataDir(), 'settings.json'),
      JSON.stringify({ activeProviderId: null, providers: [], qualityMode: 'weird' }));
    const s = loadSettings();
    expect(s).toEqual({ activeProviderId: null, providers: [], qualityMode: 'max' });
  });
});

describe('resolveMode', () => {
  beforeEach(() => {
    process.env.SHOWMEHOW_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smh-'));
  });

  it('uses explicit body mode when provided', () => {
    saveSettings({ ...loadSettings(), qualityMode: 'fast' });
    expect(resolveMode('standard')).toBe('standard');
  });

  it('falls back to saved qualityMode when body mode is undefined', () => {
    saveSettings({ ...loadSettings(), qualityMode: 'standard' });
    expect(resolveMode(undefined)).toBe('standard');
  });

  it('falls back to default max when nothing is saved', () => {
    expect(resolveMode(undefined)).toBe('max');
  });
});
