/** Состояние строки таблицы одним словом. */
export type PillTone = 'ok' | 'warn' | 'danger' | 'accent' | 'neutral';

export default function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={tone === 'neutral' ? 'status-pill' : `status-pill ${tone}`}>{children}</span>;
}

export function personStatus(p: { disabled: boolean; mustChangePassword: boolean }): { tone: PillTone; label: string } {
  if (p.disabled) return { tone: 'danger', label: 'заблокирован' };
  if (p.mustChangePassword) return { tone: 'warn', label: 'ждёт смены пароля' };
  return { tone: 'ok', label: 'активен' };
}
