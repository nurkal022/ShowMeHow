'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  levelLabels, slotMeta, taskTypeLabels, TEMPLATES, templates, lessonMinutes, newSlot, slotsOf,
  type LessonLevel, type LessonTemplate, type Slot, type SlotKind, type TaskType,
} from '@/lib/lms/lesson-builder';
import { LABS } from '@/lib/labs';
import { callApi } from '@/components/cabinet/api';
import {
  IconAlert, IconArrowDown, IconArrowUp, IconBook, IconBulb, IconCheck, IconChoice, IconClose, IconEssay, IconFold,
  IconFormula, IconGrip, IconPlus, IconSliders, IconSpark, IconTable, IconTask, IconText, IconTrash, IconVideo, IconVr,
} from '@/components/icons';
import { IconList } from '@/components/cabinet/icons';
import Layer from '@/components/cabinet/Layer';
import { formatClock } from '@/components/cabinet/useDraft';
import { useFormat, useLocale, useT } from '@/i18n/client';
import { teachLesson } from '@/i18n/messages/teach-lesson';

const ICONS: Record<SlotKind, (size: number) => React.ReactNode> = {
  hook: (n) => <IconBulb size={n} />, explain: (n) => <IconText size={n} />, definition: (n) => <IconBook size={n} />,
  formula: (n) => <IconFormula size={n} />, example: (n) => <IconFold size={n} />, important: (n) => <IconAlert size={n} />,
  summary: (n) => <IconList size={n} />, tasks: (n) => <IconTask size={n} />, check: (n) => <IconChoice size={n} />,
  essay: (n) => <IconEssay size={n} />, lab_table: (n) => <IconTable size={n} />, simulation: (n) => <IconSliders size={n} />,
  video: (n) => <IconVideo size={n} />, lab: (n) => <IconVr size={n} />,
};

const GROUPS: { key: 'material' | 'practice' | 'interactive'; label: 'groupMaterial' | 'groupPractice' | 'groupInteractive' }[] = [
  { key: 'material', label: 'groupMaterial' }, { key: 'practice', label: 'groupPractice' }, { key: 'interactive', label: 'groupInteractive' },
];
const MINUTES = [20, 40, 45, 80];
const MEMORY_KEY = 'tesseract.lesson-builder';

interface Remembered { grade?: string; level?: LessonLevel; minutes?: number }

/**
 * Кнопка «Урок с помощником» + студия-конструктор. topicId — дополнить эту тему;
 * без него создаётся новая тема. Уйти в студию можно с любого места редактора.
 */
export function LessonBuilderButton({ courseId, subject, topicId, topicTitle, variant = 'primary', label, autoOpen, onDone }: {
  courseId: string; subject: string; topicId?: string; topicTitle?: string;
  variant?: 'primary' | 'small' | 'line'; label?: string;
  /** Открыть студию сразу: курс только что создан с выбором «Первый урок с помощником». */
  autoOpen?: boolean;
  onDone: (topicId: string, firstId: string | undefined) => void;
}) {
  const t = useT(teachLesson);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  const cls = variant === 'primary' ? 'btn btn-primary ai-btn' : variant === 'small' ? 'btn btn-sm ai-btn' : 'cf-add-line lb-add-line';
  return (
    <>
      <button type="button" className={cls} onClick={() => setOpen(true)}>
        <IconSpark size={16} />{label ?? (topicId ? t('extendAi') : t('lessonAi'))}
      </button>
      {open && <Layer><LessonStudio courseId={courseId} subject={subject} topicId={topicId} topicTitle={topicTitle}
        onClose={() => setOpen(false)} onDone={(tid, f) => { setOpen(false); onDone(tid, f); }} /></Layer>}
    </>
  );
}

function LessonStudio({ courseId, subject, topicId, topicTitle, onClose, onDone }: {
  courseId: string; subject: string; topicId?: string; topicTitle?: string;
  onClose: () => void; onDone: (topicId: string, firstId: string | undefined) => void;
}) {
  const uid = useId();
  const tr = useT(teachLesson);
  const fmt = useFormat();
  const locale = useLocale();
  const SM = slotMeta(locale);
  const LEVEL_LABELS = levelLabels(locale);
  const TASK_TYPE_LABELS = taskTypeLabels(locale);
  const [template, setTemplate] = useState<LessonTemplate>(TEMPLATES[0]);
  const [slots, setSlots] = useState<Slot[]>(() => slotsOf(TEMPLATES[0]));
  const [title, setTitle] = useState(topicTitle ?? '');
  const [grade, setGrade] = useState('');
  const [level, setLevel] = useState<LessonLevel>('standard');
  const [minutes, setMinutes] = useState(40);
  const [goals, setGoals] = useState('');
  const [materials, setMaterials] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [labSlug, setLabSlug] = useState(LABS[0].slug);
  const [showMaterials, setShowMaterials] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;
  // Черновик урока: закрыли студию или вкладку — план, цели и материалы не пропадают.
  const draftKey = `tesseract.lesson-draft.${courseId}.${topicId ?? 'new'}`;
  const [restored, setRestored] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Remembered;
      if (m.grade) setGrade(m.grade);
      if (m.level) setLevel(m.level);
      if (m.minutes) setMinutes(m.minutes);
    } catch { /* приватный режим */ }
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? 'null') as null | {
        at: number; template: string; slots: Slot[]; title: string; grade: string; level: LessonLevel; minutes: number;
        goals: string; materials: string; videoUrl: string; labSlug: string;
      };
      if (d && Array.isArray(d.slots)) {
        setTemplate(TEMPLATES.find((t) => t.key === d.template) ?? TEMPLATES[0]);
        setSlots(d.slots); setTitle(d.title); setGrade(d.grade); setLevel(d.level); setMinutes(d.minutes);
        setGoals(d.goals); setMaterials(d.materials); setVideoUrl(d.videoUrl); setLabSlug(d.labSlug);
        if (d.materials || d.videoUrl) setShowMaterials(true);
        setRestored(d.at);
      }
    } catch { /* испорченный черновик — начинаем с шаблона */ }
    setLoaded(true);
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onClose(); };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded || busy) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          at: Date.now(), template: template.key, slots, title, grade, level, minutes, goals, materials, videoUrl, labSlug,
        }));
      } catch { /* не беда */ }
    }, 400);
    return () => clearTimeout(t);
  }, [loaded, busy, draftKey, template, slots, title, grade, level, minutes, goals, materials, videoUrl, labSlug]);

  function startOver() {
    try { localStorage.removeItem(draftKey); } catch { /* не беда */ }
    setRestored(null);
    setTemplate(TEMPLATES[0]); setSlots(slotsOf(TEMPLATES[0])); setTitle(topicTitle ?? ''); setGoals(''); setMaterials(''); setVideoUrl('');
  }

  // Пока помощник пишет — подсвечиваем слоты по очереди: ожидание видно, а не «крутится».
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(slots.length - 1, s + 1)), 3500);
    return () => clearInterval(t);
  }, [busy, slots.length]);

  const pickTemplate = (t: LessonTemplate) => { setTemplate(t); setSlots(slotsOf(t)); };
  const patch = (id: string, p: Partial<Slot>) => setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const move = (from: number, to: number) => setSlots((ss) => {
    if (to < 0 || to >= ss.length || from === to) return ss;
    const next = [...ss];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
  });
  const add = (kind: SlotKind) => {
    const s = newSlot(kind);
    setSlots((ss) => [...ss, s]);
    setFresh(s.id);
    if (kind === 'video' || kind === 'lab') setShowMaterials(true);
  };

  const total = lessonMinutes(slots);
  const taskCount = slots.reduce((a, s) => a + (s.kind === 'tasks' || s.kind === 'check' ? s.count : s.kind === 'essay' || s.kind === 'lab_table' ? 1 : 0), 0);
  const needsVideo = slots.some((s) => s.kind === 'video');
  const needsLab = slots.some((s) => s.kind === 'lab');

  async function build() {
    if (!title.trim()) { setError(tr('needTitle')); titleRef.current?.focus(); return; }
    if (slots.length === 0) return setError(tr('needSlots'));
    setBusy(true);
    setError('');
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify({ grade, level, minutes })); } catch { /* не беда */ }
    const res = await callApi<{ topicId: string; firstId?: string }>('/api/teach/ai', 'POST', {
      action: 'build', courseId, topicId,
      spec: { title, grade, level, minutes, goals, materials, videoUrl, labSlug, exam: !!template.exam && !topicId, slots },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    try { localStorage.removeItem(draftKey); } catch { /* не беда */ }
    onDone(res.data.topicId, res.data.firstId);
  }

  return (
    <div className="lb-layer" role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`}>
      <div className="lb-scrim" onClick={() => !busy && onClose()} />
      <div className="lb-studio">
        <header className="lb-head">
          <span className="lb-head-orb" aria-hidden="true"><IconSpark size={20} /></span>
          <div>
            <h2 id={`${uid}-t`}>{topicId ? tr('extendTopic', { title: topicTitle }) : tr('lessonAi')}</h2>
            <p className="muted">{tr('studioSub')}</p>
            {restored
              ? <p className="lb-draft">{tr('restored', { time: formatClock(restored) })} · <button type="button" onClick={startOver}>{tr('startOver')}</button></p>
              : <p className="lb-draft quiet">{tr('draftQuiet')}</p>}
          </div>
          <button type="button" className="cab-icon-btn" aria-label={tr('close')} disabled={busy} onClick={onClose}><IconClose size={20} /></button>
        </header>

        {busy ? (
          <div className="lb-building">
            <div className="lb-building-orb" aria-hidden="true"><span /><span /><span /><IconSpark size={30} /></div>
            <h3>{tr('building', { title })}</h3>
            <p className="muted">{tr('buildingHint')}</p>
            <ol className="lb-building-list">
              {slots.map((s, i) => (
                <li key={s.id} className={i < step ? 'done' : i === step ? 'work' : ''}>
                  <span className={`lb-slot-icon g-${SM[s.kind].group}`}>{i < step ? <IconCheck size={14} /> : ICONS[s.kind](15)}</span>
                  {SM[s.kind].label}{SM[s.kind].counted && s.count > 1 ? ` × ${s.count}` : ''}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="lb-body">
            <nav className="lb-templates" aria-label={tr('templates')}>
              <span className="lb-label">{tr('template')}</span>
              {templates(locale).map((t) => (
                <button key={t.key} type="button" aria-pressed={template.key === t.key}
                  className={`lb-template tone-${t.tone}${template.key === t.key ? ' active' : ''}`} onClick={() => pickTemplate(t)}>
                  <strong>{t.title}</strong>
                  <span>{t.about}</span>
                  {t.slots.length > 0 && (
                    <span className="lb-template-dots" aria-hidden="true">
                      {t.slots.map((s, i) => <i key={i} className={`g-${SM[s.kind].group}`} />)}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            <div className="lb-main">
              <label className="lb-title">
                <span className="visually-hidden">{tr('about')}</span>
                <input ref={titleRef} value={title} maxLength={200} placeholder={tr('titlePh')}
                  onChange={(e) => { setTitle(e.target.value); setError(''); }} />
              </label>
              <div className="lb-params">
                <label className="lb-param"><span>{tr('grade')}</span>
                  <input className="input" value={grade} maxLength={40} placeholder={tr('gradePh')} onChange={(e) => setGrade(e.target.value)} />
                </label>
                <div className="lb-param"><span>{tr('level')}</span>
                  <div className="segmented" role="group" aria-label={tr('level')}>
                    {(Object.keys(LEVEL_LABELS) as LessonLevel[]).map((l) => (
                      <button key={l} type="button" aria-pressed={level === l} className={level === l ? 'segmented-item active' : 'segmented-item'} onClick={() => setLevel(l)}>{LEVEL_LABELS[l]}</button>
                    ))}
                  </div>
                </div>
                <div className="lb-param"><span>{tr('duration')}</span>
                  <div className="segmented" role="group" aria-label={tr('duration')}>
                    {MINUTES.map((m) => (
                      <button key={m} type="button" aria-pressed={minutes === m} className={minutes === m ? 'segmented-item active' : 'segmented-item'} onClick={() => setMinutes(m)}>{tr('min', { n: m })}</button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="field"><span>{tr('goals')}</span>
                <textarea className="input" rows={2} value={goals} maxLength={1500}
                  placeholder={tr('goalsPh')}
                  onChange={(e) => setGoals(e.target.value)} />
              </label>

              <div className={showMaterials ? 'lb-materials open' : 'lb-materials'}>
                <button type="button" className="lb-materials-toggle" aria-expanded={showMaterials} onClick={() => setShowMaterials((v) => !v)}>
                  <IconBook size={16} /><b>{tr('materials')}</b>
                  <span className="muted">{materials || videoUrl ? tr('materialsAdded') : tr('materialsHint')}</span>
                  <IconArrowDown size={15} />
                </button>
                {showMaterials && (
                  <div className="lb-materials-body">
                    <textarea className="input lb-materials-text" rows={5} value={materials} maxLength={12000}
                      placeholder={tr('materialsPh')}
                      onChange={(e) => setMaterials(e.target.value)} />
                    <div className="lb-params">
                      <label className="lb-param lb-grow"><span>{needsVideo ? tr('videoLink') : tr('videoLinkFor')}</span>
                        <input className="input" value={videoUrl} maxLength={500} placeholder="https://youtu.be/…" onChange={(e) => setVideoUrl(e.target.value)} />
                      </label>
                      {needsLab && (
                        <label className="lb-param"><span>{tr('vrLab')}</span>
                          <select className="select" value={labSlug} onChange={(e) => setLabSlug(e.target.value)}>
                            {LABS.map((l) => <option key={l.slug} value={l.slug}>{l.title} · {l.subject}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="lb-structure-head">
                <h3>{tr('structure')}</h3>
                <span className="muted">{tr('structureHint')}</span>
              </div>
              {slots.length === 0 ? (
                <div className="lb-empty">{tr('empty')}</div>
              ) : (
                <ol className="lb-slots">
                  {slots.map((s, i) => {
                    const m = SM[s.kind];
                    return (
                      <li key={s.id} draggable className={`lb-slot g-${m.group}${dragId === s.id ? ' dragging' : ''}${fresh === s.id ? ' fresh' : ''}`}
                        onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== s.id) move(slots.findIndex((x) => x.id === dragId), i); }}>
                        <span className="lb-grip" aria-hidden="true"><IconGrip size={16} /></span>
                        <span className={`lb-slot-icon g-${m.group}`}>{ICONS[s.kind](17)}</span>
                        <div className="lb-slot-body">
                          <div className="lb-slot-top">
                            <b>{m.label}</b>
                            {m.counted && (
                              <span className="lb-stepper" role="group" aria-label={tr('howMany')}>
                                <button type="button" aria-label={tr('fewer')} disabled={s.count <= 1} onClick={() => patch(s.id, { count: s.count - 1 })}>−</button>
                                <span>{s.count}</span>
                                <button type="button" aria-label={tr('more')} disabled={s.count >= 10} onClick={() => patch(s.id, { count: s.count + 1 })}>+</button>
                              </span>
                            )}
                            {s.kind === 'tasks' && (
                              <select className="select lb-task-type" value={s.taskType} aria-label={tr('taskType')}
                                onChange={(e) => patch(s.id, { taskType: e.target.value as TaskType })}>
                                {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
                              </select>
                            )}
                            {!m.llm && <span className="chip-sm">{s.kind === 'simulation' ? tr('fromCatalog') : tr('insertSelf')}</span>}
                          </div>
                          <input className="lb-note" value={s.note} maxLength={400} placeholder={m.hint} aria-label={tr('clarify', { label: m.label })}
                            onChange={(e) => patch(s.id, { note: e.target.value })} />
                        </div>
                        <span className="lb-slot-tools">
                          <button type="button" className="cab-icon-btn" aria-label={tr('up')} disabled={i === 0} onClick={() => move(i, i - 1)}><IconArrowUp size={15} /></button>
                          <button type="button" className="cab-icon-btn" aria-label={tr('down')} disabled={i === slots.length - 1} onClick={() => move(i, i + 1)}><IconArrowDown size={15} /></button>
                          <button type="button" className="cab-icon-btn" aria-label={tr('removeSlot')} onClick={() => setSlots((ss) => ss.filter((x) => x.id !== s.id))}><IconTrash size={15} /></button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="lb-palette">
                {GROUPS.map((g) => (
                  <div key={g.key} className="lb-palette-group">
                    <span className="lb-label">{tr(g.label)}</span>
                    <div>
                      {(Object.keys(SM) as SlotKind[]).filter((k) => SM[k].group === g.key).map((k) => (
                        <button key={k} type="button" className={`lb-chip g-${g.key}`} title={SM[k].hint} onClick={() => add(k)}>
                          {ICONS[k](15)}{SM[k].label}<IconPlus size={13} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="lb-side">
              <span className="lb-label">{tr('preview')}</span>
              <div className="lb-time">
                <b>{tr('totalMin', { n: total })}</b>
                <span className={total > minutes * 1.25 ? 'lb-time-note warn' : 'lb-time-note'}>
                  {total > minutes * 1.25 ? tr('overBy', { n: total - minutes }) : tr('lessonMin', { n: minutes })}
                </span>
              </div>
              <div className="lb-timeline" aria-hidden="true">
                {slots.map((s) => {
                  const m = SM[s.kind];
                  return <i key={s.id} className={`g-${m.group}`} style={{ flexGrow: m.minutes * (m.counted ? s.count : 1) }} title={m.label} />;
                })}
              </div>
              <ul className="lb-legend">
                {GROUPS.map((g) => <li key={g.key}><i className={`g-${g.key}`} />{tr(g.label)}</li>)}
              </ul>
              <dl className="lb-facts">
                <div><dt>{tr('factBlocks')}</dt><dd>{slots.length}</dd></div>
                <div><dt>{tr('factTasks')}</dt><dd>{taskCount}</dd></div>
                <div><dt>{tr('factInteractive')}</dt><dd>{slots.filter((s) => SM[s.kind].group === 'interactive').length}</dd></div>
              </dl>
              <ol className="lb-outline">
                {slots.map((s) => (
                  <li key={s.id}><span className={`lb-dot g-${SM[s.kind].group}`} />{SM[s.kind].label}{SM[s.kind].counted && s.count > 1 ? ` × ${s.count}` : ''}</li>
                ))}
              </ol>
              <p className="muted lb-side-note">
                {topicId ? tr('appendNote') : template.exam ? tr('examNote') : tr('newTopicNote')}
                {subject ? tr('subjectNote', { subject }) : ''}
              </p>
              {error && <p className="error-box" role="alert">{fmt.message(error)}</p>}
              <button type="button" className="btn btn-primary ai-btn lb-go" onClick={build}>
                <IconSpark size={17} />{topicId ? tr('extendBtn') : tr('buildBtn')}
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
