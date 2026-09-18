/** Число с подписью: сводка сверху страницы кабинета. */
export function StatGrid({ children }: { children?: React.ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function Stat({ value, label }: { value: number | string; label: string }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}
