/** Пустое состояние: иконка, одно предложение и одно главное действие. */
export default function EmptyState({ icon, text, children }: {
  icon: React.ReactNode; text: string; children?: React.ReactNode;
}) {
  return (
    <div className="cab-empty">
      <span className="cab-empty-icon">{icon}</span>
      <p>{text}</p>
      {children}
    </div>
  );
}
