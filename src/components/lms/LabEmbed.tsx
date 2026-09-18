'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LABS, labUrl } from '@/lib/labs';
import { IconPlay, IconVr } from '@/components/icons';

/** VR-лаборатория внутри урока: сцена открыта без входа, QR — для очков. */
export default function LabEmbed({ slug, caption }: { slug: string; caption: string }) {
  const lab = LABS.find((l) => l.slug === slug);
  const [qr, setQr] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!qr || !canvasRef.current) return;
    const url = new URL(labUrl(slug), window.location.href).toString();
    QRCode.toCanvas(canvasRef.current, url, { width: 180, margin: 1 }).catch(() => {});
  }, [qr, slug]);

  if (!lab) return <p className="empty-state">Лаборатория недоступна.</p>;
  return (
    <figure className="embed">
      <div className="embed-frame">
        <iframe src={labUrl(slug)} title={lab.title} loading="lazy" allow="xr-spatial-tracking; fullscreen" />
      </div>
      <figcaption className="embed-caption">
        <span><strong>{lab.title}</strong>{caption ? ` — ${caption}` : ''}</span>
        <span className="spacer" />
        <a className="btn btn-sm btn-ghost" href={labUrl(slug)} target="_blank" rel="noopener noreferrer">
          <IconPlay size={15} />Открыть
        </a>
        <button type="button" className="btn btn-sm btn-ghost" aria-expanded={qr} onClick={() => setQr((v) => !v)}>
          <IconVr size={15} />QR для очков
        </button>
      </figcaption>
      {qr && <div className="vr-qr"><canvas ref={canvasRef} width={180} height={180} /></div>}
    </figure>
  );
}
