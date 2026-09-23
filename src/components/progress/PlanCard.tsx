'use client';
import { useState } from 'react';
import type { PlanSummary } from '@/lib/types';

export default function PlanCard({ plan }: { plan: PlanSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="plan-card">
      <div className="plan-card-head">
        <h3>{plan.title}</h3>
        <span className={`badge badge-${plan.mode}`}>{plan.mode.toUpperCase()}</span>
      </div>
      <div className="plan-card-subject">
        {plan.subject}
        {plan.level && plan.level !== 'demo' && <> · {plan.level === 'lab' ? 'лаборатория' : 'исследование'}</>}
      </div>
      {plan.physics && (
        <p
          className={`plan-card-physics ${expanded ? 'expanded' : 'clamped'}`}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Свернуть' : 'Развернуть'}
        >
          {plan.physics}
        </p>
      )}
      {plan.parameters.length > 0 && (
        <div className="plan-card-params">
          {plan.parameters.map((p, i) => (
            <span className="param-chip" key={i}>
              {p.label}{p.unit ? ` (${p.unit})` : ''}
            </span>
          ))}
        </div>
      )}
      {(plan.views?.length || plan.steps?.length) ? (
        <div className="plan-card-params">
          {plan.views?.map((v, i) => <span className="param-chip view" key={`v${i}`}>{v}</span>)}
          {plan.steps?.map((v, i) => <span className="param-chip step" key={`s${i}`}>{i + 1}. {v}</span>)}
        </div>
      ) : null}
      {plan.goals.length > 0 && (
        <ul className="plan-card-goals">
          {plan.goals.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}
