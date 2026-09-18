import Link from 'next/link';

/** 404 внутри кабинета: рамка остаётся, чтобы было куда уйти. */
export default function CabinetNotFound() {
  return (
    <div className="not-found">
      <strong>404</strong>
      <h1>Страница не найдена</h1>
      <p className="muted">Адрес неверный, или у вас нет доступа к этой странице.</p>
      <Link href="/" className="btn btn-primary">На сайт</Link>
    </div>
  );
}
