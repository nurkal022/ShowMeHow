'use client';
import { useState } from 'react';
import { IconCopy, IconKey } from '@/components/icons';
import Layer from './Layer';
import { useT } from '@/i18n/client';
import { cabinet } from '@/i18n/messages/cabinet';

/** Временный пароль — один раз, с кнопкой «Скопировать». */
export default function SecretDialog({ title, lines, secret, onClose }: {
  title: string; lines: string[]; secret: string; onClose: () => void;
}) {
  const t = useT(cabinet);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Layer>
    <div className="modal-backdrop">
      <div className="modal vr-modal" role="dialog" aria-modal="true" aria-labelledby="secret-title">
        <div className="modal-head"><IconKey size={22} /><h2 id="secret-title">{title}</h2></div>
        {lines.map((line) => <p key={line} className="muted">{line}</p>)}
        <div className="secret" data-testid="one-time-secret">{secret}</div>
        <p className="warn-banner">{t('secretOnce')}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={copy}>
            <IconCopy size={16} />{copied ? t('copied') : t('copy')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>{t('done')}</button>
        </div>
      </div>
    </div>
    </Layer>
  );
}
