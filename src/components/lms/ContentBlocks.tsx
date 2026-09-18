import {
  CALLOUT_TONE_LABELS, videoEmbed,
  type CalloutPayload, type CodePayload, type FormulaPayload, type ImagePayload, type SpoilerPayload, type VideoPayload,
} from '@/lib/lms/block-schema';
import { IconAlert, IconBook, IconBulb, IconChevron, IconInfo, IconSpark } from '@/components/icons';
import Markup, { Tex } from './Markup';

/** Блоки-материалы урока: одинаково выглядят у ученика и в карточке редактора. Без состояния — рендерятся на сервере. */

const TONE_ICON = { info: IconInfo, definition: IconBook, important: IconSpark, warning: IconAlert, example: IconBulb };

export function CalloutBlock({ payload }: { payload: CalloutPayload }) {
  const Icon = TONE_ICON[payload.tone];
  return (
    <aside className={`lb-callout tone-${payload.tone}`}>
      <span className="lb-callout-icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="lb-callout-body">
        <strong className="lb-callout-title">{payload.title || CALLOUT_TONE_LABELS[payload.tone]}</strong>
        {payload.body && <Markup text={payload.body} />}
      </div>
    </aside>
  );
}

export function FormulaBlock({ payload }: { payload: FormulaPayload }) {
  return (
    <figure className="lb-formula">
      <Tex tex={payload.latex} />
      {payload.caption && <figcaption>{payload.caption}</figcaption>}
    </figure>
  );
}

export function ImageBlock({ payload }: { payload: ImagePayload }) {
  return (
    <figure className={payload.wide ? 'lb-image wide' : 'lb-image'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={payload.src} alt={payload.alt} loading="lazy" />
      {payload.caption && <figcaption>{payload.caption}</figcaption>}
    </figure>
  );
}

export function VideoBlock({ payload }: { payload: VideoPayload }) {
  const embed = videoEmbed(payload.url);
  if (!embed) return null;
  return (
    <figure className="lb-video">
      <div className="lb-video-frame">
        {embed.kind === 'iframe'
          ? <iframe src={embed.src} title={payload.caption || 'Видео'} loading="lazy" allowFullScreen
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
          : <video src={embed.src} controls preload="metadata" />}
      </div>
      {payload.caption && <figcaption>{payload.caption}</figcaption>}
    </figure>
  );
}

export function SpoilerBlock({ payload }: { payload: SpoilerPayload }) {
  return (
    <details className="lb-spoiler">
      <summary><IconChevron size={16} /><span>{payload.title || 'Показать решение'}</span></summary>
      <div className="lb-spoiler-body"><Markup text={payload.body} /></div>
    </details>
  );
}

export function CodeBlock({ payload }: { payload: CodePayload }) {
  return (
    <figure className="lb-code">
      {payload.language && <figcaption>{payload.language}</figcaption>}
      <pre><code>{payload.code}</code></pre>
    </figure>
  );
}
