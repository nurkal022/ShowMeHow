/**
 * Наложение настроек тренажёра: JSON-блок в артефакте, который кит читает при
 * создании слайдеров, пресетов и заголовка (см. runtime/kit-lesson.ts). Правка
 * подписи или диапазона — это правка JSON, без модели и без риска сломать код.
 */

export interface ConfigParam {
  label?: string; min?: number; max?: number; step?: number; value?: number; unit?: string;
}

export interface SimConfig {
  title?: string;
  parameters?: Record<string, ConfigParam>;
  presets?: { label: string; values: Record<string, number> }[];
}

const BLOCK = /<script\b[^>]*\bid=["']sim-config["'][^>]*>([\s\S]*?)<\/script>/i;

export function readConfig(html: string): SimConfig {
  const m = html.match(BLOCK);
  if (!m) return {};
  try {
    const raw = JSON.parse(m[1]) as unknown;
    return sanitizeConfig(raw);
  } catch {
    return {};
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function text(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** Только известные поля и конечные числа: блок уходит в страницу, мусору там не место. */
export function sanitizeConfig(raw: unknown): SimConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: SimConfig = {};
  const title = text(o.title, 120);
  if (title) out.title = title;
  if (typeof o.parameters === 'object' && o.parameters !== null && !Array.isArray(o.parameters)) {
    const params: Record<string, ConfigParam> = {};
    for (const [name, v] of Object.entries(o.parameters as Record<string, unknown>)) {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) || typeof v !== 'object' || v === null) continue;
      const p = v as Record<string, unknown>;
      const c: ConfigParam = {};
      const label = text(p.label, 60); if (label) c.label = label;
      const unit = typeof p.unit === 'string' ? p.unit.slice(0, 20) : undefined; if (unit !== undefined) c.unit = unit;
      for (const k of ['min', 'max', 'step', 'value'] as const) {
        const n = num(p[k]); if (n !== undefined) c[k] = n;
      }
      if (c.min !== undefined && c.max !== undefined && c.min > c.max) [c.min, c.max] = [c.max, c.min];
      if (c.step !== undefined && c.step <= 0) delete c.step;
      if (c.value !== undefined) {
        if (c.min !== undefined && c.value < c.min) c.value = c.min;
        if (c.max !== undefined && c.value > c.max) c.value = c.max;
      }
      if (Object.keys(c).length) params[name] = c;
    }
    if (Object.keys(params).length) out.parameters = params;
  }
  if (Array.isArray(o.presets)) {
    const presets = o.presets.map((p) => {
      if (typeof p !== 'object' || p === null) return null;
      const r = p as Record<string, unknown>;
      const label = text(r.label, 40);
      const values: Record<string, number> = {};
      if (typeof r.values === 'object' && r.values !== null) {
        for (const [k, v] of Object.entries(r.values as Record<string, unknown>)) {
          const n = num(v);
          if (n !== undefined && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)) values[k] = n;
        }
      }
      return label && Object.keys(values).length ? { label, values } : null;
    }).filter((p): p is { label: string; values: Record<string, number> } => p !== null).slice(0, 8);
    if (presets.length) out.presets = presets;
  }
  return out;
}

/** Слияние: параметры — по полям, пресеты и название — заменой. */
export function mergeConfig(base: SimConfig, patch: SimConfig): SimConfig {
  const out: SimConfig = { ...base };
  if (patch.title) out.title = patch.title;
  if (patch.presets) out.presets = patch.presets;
  if (patch.parameters) {
    out.parameters = { ...(base.parameters ?? {}) };
    for (const [k, v] of Object.entries(patch.parameters)) out.parameters[k] = { ...(out.parameters[k] ?? {}), ...v };
  }
  return sanitizeConfig(out);
}

/** Записывает блок (заменой или сразу после <head>). Пустое наложение блок удаляет. */
export function writeConfig(html: string, config: SimConfig): string {
  const clean = sanitizeConfig(config);
  const empty = Object.keys(clean).length === 0;
  // </script> внутри JSON закрыл бы тег раньше времени.
  const json = JSON.stringify(clean).replace(/</g, '\\u003c');
  const tag = `<script type="application/json" id="sim-config">${json}</script>`;
  if (BLOCK.test(html)) return html.replace(BLOCK, empty ? '' : tag);
  if (empty) return html;
  const head = html.match(/<head[^>]*>/i);
  if (head) {
    const at = html.indexOf(head[0]) + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  return tag + html;
}
