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

/**
 * Профиль из переменных окружения. Основной путь настройки после того, как
 * страница настроек убрана из интерфейса: Next.js подхватывает .env.local сам.
 * Требуются как минимум ключ и модель генерации — без них профиль не имеет смысла.
 */
export function envProvider(): ProviderProfile | null {
  const apiKey = process.env.SHOWMEHOW_API_KEY;
  const generationModel = process.env.SHOWMEHOW_MODEL;
  if (!apiKey || !generationModel) return null;
  return {
    id: 'env',
    name: 'Из переменных окружения',
    baseURL: process.env.SHOWMEHOW_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    generationModel,
    visionModel: process.env.SHOWMEHOW_VISION_MODEL || '',
  };
}

/**
 * Окружение побеждает файл: развёртывание задаётся переменными, а data/settings.json
 * остаётся запасным путём для ручной правки и per-role настроек.
 */
export function activeProvider(s: Settings = loadSettings()): ProviderProfile | null {
  return envProvider() ?? s.providers.find((p) => p.id === s.activeProviderId) ?? null;
}

/** Единая формулировка ошибки отсутствия провайдера — используется и в пайплайне, и в API. */
export const NO_PROVIDER_MESSAGE =
  'Провайдер не настроен. Задайте SHOWMEHOW_API_KEY и SHOWMEHOW_MODEL ' +
  '(при необходимости SHOWMEHOW_BASE_URL и SHOWMEHOW_VISION_MODEL) в файле .env.local ' +
  'и перезапустите сервер.';

/**
 * Резолвит режим качества для запроса: явный `mode` в теле запроса побеждает,
 * иначе используем сохранённый пользователем qualityMode из настроек.
 */
export function resolveMode(bodyMode: QualityMode | undefined): QualityMode {
  return bodyMode ?? loadSettings().qualityMode;
}
