/** Шаблон Next пересоздаётся при каждом переходе — анимация входа страницы запускается сама. */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
