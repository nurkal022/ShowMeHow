import type { ProviderProfile, Role } from './types';

/** Роли, которые возвращают полный HTML-документ, — им нужен крупный лимит токенов. */
export const HTML_ROLES: Role[] = ['generator', 'fixer', 'refiner'];

/** Роли, работающие по скриншотам: по умолчанию идут на vision-модель. */
const VISION_ROLES: Role[] = ['critic', 'judge'];

const HTML_MAX_TOKENS = 16000;
const JSON_MAX_TOKENS = 4000;

export function resolveRole(
  p: ProviderProfile,
  role: Role,
): { model: string; maxTokens: number; extraBody: Record<string, unknown> } {
  const cfg = p.roles?.[role];
  const fallbackModel = VISION_ROLES.includes(role) ? p.visionModel : p.generationModel;
  const extraBody: Record<string, unknown> = { ...p.extraBody, ...cfg?.extraBody };
  if (cfg?.temperature !== undefined) extraBody.temperature = cfg.temperature;
  return {
    model: cfg?.model || fallbackModel,
    maxTokens: cfg?.maxTokens ?? (HTML_ROLES.includes(role) ? HTML_MAX_TOKENS : JSON_MAX_TOKENS),
    extraBody,
  };
}
