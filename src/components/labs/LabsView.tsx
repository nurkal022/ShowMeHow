'use client';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { LabEntry } from '@/lib/labs';
import { labUrl } from '@/lib/labs';
import { IconLab, IconPlay, IconPlus, IconVr } from '@/components/icons';

export default function LabsView({ labs }: { labs: LabEntry[] }) {
  const [vrFor, setVrFor] = useState<LabEntry | null>(null);
  const [soon, setSoon] = useState(false);
  // WebXR живёт только в защищённом контексте (HTTPS или localhost). Пока боевой
  // стенд отдаётся по http, вход в VR предлагать нечестно — прячем его и говорим,
  // чего не хватает. null — «ещё не знаем»: на сервере isSecureContext недоступен,
  // и без этого состояния подсказка мигала бы при гидрации.
  const [secure, setSecure] = useState<boolean | null>(null);
  useEffect(() => { setSecure(window.isSecureContext); }, []);
  return (
    <div className="library labs">
      <div className="library-head">
        <h1>Лаборатории</h1>
        <button type="button" className="btn btn-primary" onClick={() => setSoon(true)}>
          <IconPlus size={17} />Создать лабораторию
        </button>
      </div>
      <p className="muted labs-lead">
        Трёхмерные сцены: открываются в браузере и рассматриваются мышью.
        Наведите на предмет — появится подпись; предметы берутся руками.
      </p>
      {secure === false && (
        <p className="muted labs-note">
          Вход в очках Quest появится, когда сайт откроется по HTTPS: WebXR работает
          только на защищённом соединении. Сами сцены доступны уже сейчас.
        </p>
      )}
      <div className="cards">
        {labs.map((lab) => (
          <article key={lab.slug} className="sim-card lab-card">
            <a className="card-thumb" href={labUrl(lab.slug)} target="_blank" rel="noopener">
              <img src={`/labs/${lab.slug}.png`} alt="" loading="lazy" />
              <span className="card-thumb-hint"><IconPlay size={16} />Открыть</span>
            </a>
            <div className="card-body">
              <h3><a href={labUrl(lab.slug)} target="_blank" rel="noopener">{lab.title}</a></h3>
              <div className="card-sub"><span className="chip">{lab.subject}</span>
                <span>{lab.stations.join(' · ')}</span></div>
              <p className="lab-blurb">{lab.blurb}</p>
              <div className="card-actions">
                <a className="btn btn-sm" href={labUrl(lab.slug)} target="_blank" rel="noopener">
                  <IconPlay size={15} />Открыть
                </a>
                {secure && (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVrFor(lab)}>
                    <IconVr size={16} />В VR
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {vrFor && <VrDialog lab={vrFor} onClose={() => setVrFor(null)} />}
      {soon && (
        <div className="modal-backdrop" onClick={() => setSoon(false)}>
          <div className="modal soon-modal" role="dialog" aria-modal="true" aria-labelledby="soon-title"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><IconLab size={22} /><h2 id="soon-title">Скоро</h2></div>
            <p className="muted">Лаборатории по описанию, как симуляции, — в работе.
              Пока доступны четыре готовые сцены.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={() => setSoon(false)}>Понятно</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** QR со ссылкой на сцену: очки сканируют его камерой и открывают страницу. */
function VrDialog({ lab, onClose }: { lab: LabEntry; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [href, setHref] = useState('');
  useEffect(() => {
    const url = new URL(labUrl(lab.slug), location.href).toString();
    setHref(url);
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 220, margin: 1 }).catch(() => {});
    }
  }, [lab.slug]);
  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal vr-modal" role="dialog" aria-modal="true" aria-labelledby="vr-title"
        onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><IconVr size={22} /><h2 id="vr-title">{lab.title} в VR</h2></div>
        <ol className="vr-steps">
          <li>Наденьте очки Quest и откройте браузер.</li>
          <li>Наведите камеру на код или введите адрес.</li>
          <li>На странице нажмите «Войти в VR».</li>
        </ol>
        <div className="vr-qr"><canvas ref={canvasRef} width={220} height={220} /></div>
        <code className="vr-href">{href}</code>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <a className="btn" href={labUrl(lab.slug)} target="_blank" rel="noopener">Открыть здесь</a>
          <button type="button" className="btn btn-primary" onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
