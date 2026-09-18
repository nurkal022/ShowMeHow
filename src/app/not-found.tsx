import Link from 'next/link';
import SiteChrome from '@/components/SiteChrome';

export const metadata = { title: 'Страница не найдена — Tesseract' };

/** Общий 404: чужой кабинет и несуществующий адрес выглядят одинаково. */
export default function NotFound() {
  return (
    <SiteChrome>
      <div className="not-found">
        <strong>404</strong>
        <h1>Страница не найдена</h1>
        <p className="muted">Адрес неверный, или у вас нет доступа к этой странице.</p>
        <Link href="/" className="btn btn-primary">На главную</Link>
      </div>
    </SiteChrome>
  );
}
