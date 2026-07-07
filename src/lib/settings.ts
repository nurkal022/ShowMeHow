import fs from 'node:fs';
import path from 'node:path';
import type { Settings, ProviderProfile, QualityMode } from './types';

export function dataDir(): string {
  return process.env.SHOWMEHOW_DATA_DIR ?? path.join(process.cwd(), 'data');
}

const DEFAULTS: Settings = { activeProviderId: null, providers: [], qualityMode: 'max' };

const QUALITY_MODES: QualityMode[] = ['fast', 'standard', 'max'];

export function isValidShape(v: unknown): v is Settings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.providers)
    && typeof s.qualityMode === 'string' && QUALITY_MODES.includes(s.qualityMode as QualityMode)
    && (s.activeProviderId === null || typeof s.activeProviderId === 'string');
}

export function loadSettings(): Settings {
  const file = path.join(dataDir(), 'settings.json');
  if (!fs.existsSync(file)) return structuredClone(DEFAULTS);
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const merged = { ...structuredClone(DEFAULTS), ...(raw as object) };
    if (!isValidShape(merged)) {
      console.warn('settings.json has an invalid shape, falling back to defaults');
      return structuredClone(DEFAULTS);
    }
    return merged;
  } catch (e) {
    console.warn('failed to parse settings.json, falling back to defaults:', e);
    return structuredClone(DEFAULTS);
  }
}

export function saveSettings(s: Settings): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(path.join(dataDir(), 'settings.json'), JSON.stringify(s, null, 2));
}

export function activeProvider(s: Settings = loadSettings()): ProviderProfile | null {
  return s.providers.find((p) => p.id === s.activeProviderId) ?? null;
}

/**
 * Резолвит режим качества для запроса: явный `mode` в теле запроса побеждает,
 * иначе используем сохранённый пользователем qualityMode из настроек.
 */
export function resolveMode(bodyMode: QualityMode | undefined): QualityMode {
  return bodyMode ?? loadSettings().qualityMode;
}
