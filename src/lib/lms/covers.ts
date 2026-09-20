/** Обложка курса: цвет — от предмета, чтобы «Физика» везде была одного цвета. Модуль чистый. */
const COVERS = [
  ['#4f46e5', '#7c3aed'], ['#0ea5e9', '#2563eb'], ['#10b981', '#0d9488'], ['#f59e0b', '#ea580c'],
  ['#ec4899', '#db2777'], ['#8b5cf6', '#6366f1'], ['#14b8a6', '#0891b2'], ['#f43f5e', '#e11d48'],
];

export function coverStyle(key: string): React.CSSProperties {
  let h = 0;
  for (const ch of key.toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = COVERS[h % COVERS.length];
  return { ['--c1' as string]: a, ['--c2' as string]: b };
}
