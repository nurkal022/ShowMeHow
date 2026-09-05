import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSettings, saveSettings, activeProvider, dataDir, resolveMode, envProvider } from '@/lib/settings';

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

describe('провайдер из переменных окружения', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('нет ключа или модели -> null', () => {
    delete process.env.SHOWMEHOW_API_KEY;
    delete process.env.SHOWMEHOW_MODEL;
    expect(envProvider()).toBeNull();
    process.env.SHOWMEHOW_API_KEY = 'k';
    expect(envProvider()).toBeNull();
  });

  it('ключ и модель заданы -> профиль с дефолтным baseURL', () => {
    process.env.SHOWMEHOW_API_KEY = 'k';
    process.env.SHOWMEHOW_MODEL = 'm';
    delete process.env.SHOWMEHOW_BASE_URL;
    delete process.env.SHOWMEHOW_VISION_MODEL;
    const p = envProvider()!;
    expect(p.apiKey).toBe('k');
    expect(p.generationModel).toBe('m');
    expect(p.baseURL).toBe('https://api.openai.com/v1');
    expect(p.visionModel).toBe('');
  });

  it('все переменные заданы -> все поля из окружения', () => {
    process.env.SHOWMEHOW_API_KEY = 'k';
    process.env.SHOWMEHOW_MODEL = 'gen';
    process.env.SHOWMEHOW_BASE_URL = 'http://local/v1';
    process.env.SHOWMEHOW_VISION_MODEL = 'vis';
    const p = envProvider()!;
    expect(p.baseURL).toBe('http://local/v1');
    expect(p.visionModel).toBe('vis');
  });

  it('окружение побеждает settings.json', () => {
    process.env.SHOWMEHOW_API_KEY = 'k';
    process.env.SHOWMEHOW_MODEL = 'from-env';
    const fromFile = {
      activeProviderId: 'a', qualityMode: 'max' as const,
      providers: [{ id: 'a', name: 'file', baseURL: 'http://file/v1', apiKey: 'f',
        generationModel: 'from-file', visionModel: '' }],
    };
    expect(activeProvider(fromFile)!.generationModel).toBe('from-env');
  });
});
