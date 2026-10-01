'use client';
import { useLocale, useT } from '@/i18n/client';
import { lms } from '@/i18n/messages/lms';
import { calloutToneLabels, type CalloutTone } from '@/lib/lms/block-schema';

/**
 * Подписи на языке интерфейса внутри серверных блоков (ContentBlocks рендерится и на сервере,
 * и в клиентском редакторе): крошечные клиентские листья, разметка вокруг не меняется.
 */
export function LmsText({ k }: { k: keyof typeof lms.ru }) {
  const t = useT(lms);
  return <>{t(k)}</>;
}

export function CalloutToneLabel({ tone }: { tone: CalloutTone }) {
  return <>{calloutToneLabels(useLocale())[tone]}</>;
}

/** iframe видео: title по умолчанию — «Видео» на языке интерфейса. */
export function VideoIframe({ src, caption }: { src: string; caption: string }) {
  const t = useT(lms);
  return (
    <iframe src={src} title={caption || t('video')} loading="lazy" allowFullScreen
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
  );
}
