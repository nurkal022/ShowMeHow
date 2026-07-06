import fs from 'node:fs';
import path from 'node:path';
import type { Settings, ProviderProfile, QualityMode } from './types';

export function dataDir(): string {
  return process.env.SHOWMEHOW_DATA_DIR ?? path.join(process.cwd(), 'data');
}

const DEFAULTS: Settings = { activeProviderId: null, providers: [], qualityMode: 'max' };

export function loadSettings(): Settings {
  const file = path.join(dataDir(), 'settings.json');
  if (!fs.existsSync(file)) return structuredClone(DEFAULTS);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...structuredClone(DEFAULTS), ...raw };
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
