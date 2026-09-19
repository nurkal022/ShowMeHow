'use client';
import { useState } from 'react';

/** Живой тренажёр в первом экране: гость сразу двигает ползунки, а не читает про них. */
export default function LandingHeroSwitcher({ demos }: { demos: { slug: string; title: string; subject: string }[] }) {
  const [at, setAt] = useState(0);
  const current = demos[at];
  if (!current) return null;
  return (
    <div className="land-stage">
      <div className="land-stage-frame">
        <div className="land-stage-bar" aria-hidden="true"><i /><i /><i /><span>{current.title}</span></div>
        <iframe key={current.slug} src={`/api/public/demos/${current.slug}`} title={current.title}
          sandbox="allow-scripts" loading="eager" />
      </div>
      <div className="land-stage-tabs" role="tablist" aria-label="Примеры тренажёров">
        {demos.map((d, i) => (
          <button key={d.slug} type="button" role="tab" aria-selected={i === at} className={i === at ? 'on' : undefined}
            onClick={() => setAt(i)}><small>{d.subject}</small>{d.title}</button>
        ))}
      </div>
    </div>
  );
}
