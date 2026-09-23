/** Точка в превью: доли ширины/высоты и что под ней (виджет кита или сцена). */
export function pickNote(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null) return '';
  const p = raw as { x?: unknown; y?: unknown; target?: unknown };
  const x = typeof p.x === 'number' && p.x >= 0 && p.x <= 1 ? Math.round(p.x * 100) : null;
  const y = typeof p.y === 'number' && p.y >= 0 && p.y <= 1 ? Math.round(p.y * 100) : null;
  if (x === null || y === null) return '';
  const target = typeof p.target === 'string' ? p.target.trim().slice(0, 160) : '';
  return `\n\n(Преподаватель указал на место в тренажёре: ${x}% от левого края, ${y}% от верха` +
    `${target ? `; там: ${target}` : '; там сцена'}. «Это», «здесь», «вот это» в просьбе — про это место.)`;
}

