'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LABS, labUrl } from '@/lib/labs';
import { IconPlay, IconVr } from '@/components/icons';

/** VR-лаборатория в уроке ученика: карточка с превью, сцена открывается в новой вкладке, QR — для очков. */
export default function LabCard({ slug, caption }: { slug: string; caption: string }) {
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
    <div className="learn-lab">
      <a className="learn-lab-shot" href={labUrl(slug)} target="_blank" rel="noopener noreferrer" aria-label={`Открыть лабораторию «${lab.title}»`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/labs/${lab.slug}.png`} alt="" loading="lazy" />
        <span className="learn-lab-play"><IconPlay size={22} /></span>
      </a>
      <div className="learn-lab-body">
        <span className="learn-eyebrow"><IconVr size={14} />{`VR-лаборатория · ${lab.subject}`}</span>
        <h3>{lab.title}</h3>
        <p>{caption || lab.blurb}</p>
        <div className="learn-lab-actions">
          <a className="btn btn-sm btn-primary" href={labUrl(slug)} target="_blank" rel="noopener noreferrer">
            <IconPlay size={15} />Открыть
          </a>
          <button type="button" className="btn btn-sm" aria-expanded={qr} onClick={() => setQr((v) => !v)}>
            <IconVr size={15} />QR для очков
          </button>
        </div>
        {qr && (
          <div className="learn-lab-qr">
            <div className="vr-qr"><canvas ref={canvasRef} width={180} height={180} /></div>
            <span className="muted">Наведите камеру очков или телефона — сцена откроется без входа.</span>
          </div>
        )}
      </div>
    </div>
  );
}
