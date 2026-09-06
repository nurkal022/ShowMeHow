'use client';
import { useEffect, useMemo, useState } from 'react';
import type { SimulationMeta } from '@/lib/types';
import type { Section } from '../data';
import { IconPlay } from '../../icons';

/**
 * Готовые симуляции того же раздела под сценой.
 *
 * Образ честно говорит, что он набросок. Чтобы человек понял, чем всё
 * кончится на самом деле, ему нужна не картинка, а работающая симуляция —
 * и она уже лежит в его библиотеке: примеры разложены при первом входе.
 * Открываются в новой вкладке, чтобы собранное на стенде не потерялось.
 */

/**
 * Огрублённая основа слова: русские окончания меняются («преломление» против
 * «преломления»), а точное совпадение из-за этого промахивалось бы. Шести букв
 * хватает, чтобы отличить «маятник» от «магнита», и мало, чтобы склейка вроде
 * «свет» цепляла всё подряд.
 */
function stem(word: string): string {
  return word.toLowerCase().replace('ё', 'е').slice(0, 6);
}

const STOP = new Set(['через', 'между', 'закон']);

/** Насколько симуляция похожа на то, что человек собирает сейчас. */
export function matchScore(sim: SimulationMeta, section: Section): number {
  const hay = `${sim.title} ${sim.prompt} ${sim.subject} ${sim.tags.join(' ')}`
    .toLowerCase().replace(/ё/g, 'е');
  let score = 0;
  for (const phenomenon of section.phenomena) {
    for (const word of phenomenon.split(/\s+/)) {
      if (word.length < 6 || STOP.has(word.toLowerCase())) continue;
      if (hay.includes(stem(word))) score += 3;
    }
  }
  if (hay.includes(stem(section.label))) score += 2;
  return score;
}

export default function Examples({ section }: { section?: Section }) {
  const [sims, setSims] = useState<SimulationMeta[]>([]);

  useEffect(() => {
    let alive = true;
    fetch('/api/simulations')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => { if (alive) setSims(list); })
      // Примеры — подспорье, а не часть работы стенда: молча обходимся без них.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const found = useMemo(() => {
    if (!section) return [];
    return sims
      .map((s) => ({ sim: s, score: matchScore(s, section) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.sim);
  }, [sims, section]);

  if (!found.length) return null;

  return (
    <div className="stage-examples">
      <span className="label">Так это выглядит вживую</span>
      <div className="stage-examples-row">
        {found.map((s) => (
          <a key={s.id} className="stage-example" href={`/present/${s.id}`}
            target="_blank" rel="noopener noreferrer" title={s.title}>
            <img src={`/api/simulations/${s.id}/thumbnail`} alt=""
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
            <span className="stage-example-name">{s.title}</span>
            <span className="stage-example-play"><IconPlay size={18} /></span>
          </a>
        ))}
      </div>
    </div>
  );
}
