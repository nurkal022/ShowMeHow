'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { UserProfile } from '@/lib/auth/users';
import { userContact, userLabel } from '@/lib/auth/identifier';
import type { UserPrefs } from '@/lib/auth/prefs';
import type { OrgRole } from '@/lib/org/types';
import { withOrgParam } from '@/lib/lms/links';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from '@/lib/theme';
import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';
import {
  IconCheck, IconKey, IconMonitor, IconMoon, IconOrg, IconSpark, IconSun, IconTeach, IconUser,
} from '@/components/icons';

export interface AccountWork {
  courses: number; published: number; students: number; graded: number; medianHours: number | null;
  commentShare: number | null; pending: number; debriefs: number; avgPercent: number | null; groups: string[];
}
export interface AccountOrg { slug: string; name: string; role: OrgRole; roleLabel: string; work: AccountWork | null }

const BUILDER_KEY = 'tesseract.lesson-builder';
const THEMES: { value: Theme; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Светлая', Icon: IconSun }, { value: 'dark', label: 'Тёмная', Icon: IconMoon }, { value: 'system', label: 'Как в системе', Icon: IconMonitor },
];
const LEVELS: [NonNullable<UserPrefs['teachLevel']>, string][] = [['basic', 'Базовый'], ['standard', 'Стандарт'], ['advanced', 'Углублённый']];
const MINUTES = [20, 40, 45, 80];

/** Профиль в кабинете: кто я, где работаю и как, настройки помощника, оформление и пароль. */
export default function AccountView({ profile, orgs, platformAdmin }: { profile: UserProfile; orgs: AccountOrg[]; platformAdmin: boolean }) {
  const [name, setName] = useState(profile.displayName ?? '');
  const [prefs, setPrefs] = useState<UserPrefs>(profile.prefs);
  const [theme, setTheme] = useState<Theme>(profile.prefs.theme ?? 'light');
  const [toast, setToast] = useState('');
  const teaches = orgs.some((o) => o.role === 'teacher' || (o.work && o.work.courses > 0));
  const label = userLabel({ ...profile, displayName: name || profile.displayName });
  const contact = userContact(profile);
  const words = label.trim().split(/\s+/);
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2)).toUpperCase();

  useEffect(() => { setTheme(readStoredTheme() ?? profile.prefs.theme ?? 'light'); }, [profile.prefs.theme]);
  // Настройки конструктора урока живут и в профиле (для других устройств), и в браузере — он читает их оттуда.
  useEffect(() => { syncBuilder(profile.prefs); }, [profile.prefs]);

  async function save(patch: { displayName?: string | null; prefs?: UserPrefs }, note = 'Сохранено') {
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (isUnauthorized(res)) return loginWithReturnTo('/account');
    if (res.ok) { setToast(note); setTimeout(() => setToast(''), 2000); }
  }
  function setPref<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    syncBuilder(next);
    void save({ prefs: { [key]: value } as UserPrefs });
  }
  function pickTheme(t: Theme) { setTheme(t); storeTheme(t); applyTheme(t); setPref('theme', t); }

  return (
    <div className="acc">
      {toast && <div className="acc-toast" role="status"><IconCheck size={15} />{toast}</div>}
      <section className="acc-hero">
        <span className="acc-avatar" aria-hidden="true">{initials}</span>
        <div className="acc-hero-text">
          <h1>{label}</h1>
          <span>{contact}{platformAdmin ? ' · администратор платформы' : ''}</span>
          <div className="acc-roles">
            {orgs.map((o) => (
              <Link key={o.slug} href={withOrgParam(o.role === 'org_admin' ? '/org' : '/teach', o.slug)} className={`acc-role r-${o.role}`}>
                <IconOrg size={14} />{o.name}<b>{o.roleLabel}</b>
              </Link>
            ))}
          </div>
        </div>
        <span className="acc-since">в Tesseract с {new Date(profile.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
      </section>

      <div className="acc-grid">
        <section className="cab-card acc-card">
          <h2><IconUser size={18} />Личные данные</h2>
          <label className="nx-field"><span>Как к вам обращаться — это имя видят ученики и коллеги</span>
            <input className="input" value={name} maxLength={60} placeholder="Имя и фамилия" onChange={(e) => setName(e.target.value)}
              onBlur={() => { if (name !== (profile.displayName ?? '')) void save({ displayName: name }, 'Имя сохранено'); }} />
          </label>
          <label className="nx-field"><span>Вход</span>
            <input className="input" value={contact} disabled />
          </label>
          {teaches && (
            <label className="nx-field"><span>Подпись к комментариям ученикам</span>
              <input className="input" value={prefs.teachSignature ?? ''} maxLength={120} placeholder="Например: «Айдар Сапарович»"
                onChange={(e) => setPrefs({ ...prefs, teachSignature: e.target.value })}
                onBlur={() => void save({ prefs: { teachSignature: prefs.teachSignature ?? '' } })} />
            </label>
          )}
        </section>

        {teaches && (
          <section className="cab-card acc-card acc-ai">
            <h2><IconSpark size={18} />Помощник по умолчанию</h2>
            <p className="muted">С этими настройками открывается конструктор урока и мастер «Курс из программы».</p>
            <label className="nx-field"><span>Класс</span>
              <input className="input" value={prefs.teachGrade ?? ''} maxLength={40} placeholder="8 класс"
                onChange={(e) => setPrefs({ ...prefs, teachGrade: e.target.value })}
                onBlur={() => setPref('teachGrade', prefs.teachGrade ?? '')} />
            </label>
            <div className="nx-field"><span>Уровень</span>
              <div className="segmented">
                {LEVELS.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={(prefs.teachLevel ?? 'standard') === v}
                    className={(prefs.teachLevel ?? 'standard') === v ? 'segmented-item active' : 'segmented-item'} onClick={() => setPref('teachLevel', v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="nx-field"><span>Длительность урока</span>
              <div className="segmented">
                {MINUTES.map((m) => (
                  <button key={m} type="button" aria-pressed={(prefs.teachMinutes ?? 40) === m}
                    className={(prefs.teachMinutes ?? 40) === m ? 'segmented-item active' : 'segmented-item'} onClick={() => setPref('teachMinutes', m)}>{m} мин</button>
                ))}
              </div>
            </div>
          </section>
        )}

        {orgs.filter((o) => o.work).map((o) => {
          const w = o.work!;
          return (
            <section key={o.slug} className="cab-card acc-card acc-work">
              <h2><IconTeach size={18} />Моя работа за 30 дней<small className="muted"> · {o.name}</small></h2>
              <div className="acc-stats">
                <div><b>{w.published}<small>/{w.courses}</small></b><span>курсов опубликовано</span></div>
                <div><b>{w.students}</b><span>учеников</span></div>
                <div><b>{w.graded}</b><span>работ проверено</span></div>
                <div className={w.medianHours !== null && w.medianHours <= 24 ? 'good' : ''}><b>{w.medianHours ?? '—'}{w.medianHours !== null && <small> ч</small>}</b><span>до проверки</span></div>
                <div className={w.commentShare !== null && w.commentShare >= 60 ? 'good' : ''}><b>{w.commentShare ?? '—'}{w.commentShare !== null && <small>%</small>}</b><span>с комментарием</span></div>
                <div className={w.pending > 10 ? 'hot' : ''}><b>{w.pending}</b><span>ждут проверки</span></div>
                <div><b>{w.debriefs}</b><span>разборов уроков</span></div>
                <div><b>{w.avgPercent ?? '—'}{w.avgPercent !== null && <small>%</small>}</b><span>средний балл учеников</span></div>
              </div>
              {w.groups.length > 0 && <div className="chip-row">{w.groups.map((g) => <span key={g} className="chip-sm">{g}</span>)}</div>}
              {w.pending > 0 && <Link className="btn btn-sm" href={withOrgParam('/teach/review', o.slug)}>К проверке · {w.pending}</Link>}
            </section>
          );
        })}

        <section className="cab-card acc-card">
          <h2><IconSun size={18} />Оформление</h2>
          <div className="acc-themes">
            {THEMES.map(({ value, label: l, Icon }) => (
              <button key={value} type="button" aria-pressed={theme === value} className={`acc-theme t-${value}${theme === value ? ' on' : ''}`} onClick={() => pickTheme(value)}>
                <span className="acc-theme-preview" aria-hidden="true"><i /><i /><i /></span>
                <span><Icon size={15} />{l}</span>
              </button>
            ))}
          </div>
        </section>

        <PasswordCard />
      </div>
    </div>
  );
}

function syncBuilder(p: UserPrefs) {
  try {
    const cur = JSON.parse(localStorage.getItem(BUILDER_KEY) ?? '{}');
    localStorage.setItem(BUILDER_KEY, JSON.stringify({
      ...cur, ...(p.teachGrade ? { grade: p.teachGrade } : {}), ...(p.teachLevel ? { level: p.teachLevel } : {}), ...(p.teachMinutes ? { minutes: p.teachMinutes } : {}),
    }));
  } catch { /* приватный режим */ }
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = next.length === 0 ? 0 : next.length < 8 ? 1 : /\d/.test(next) && /[a-zа-я]/i.test(next) && next.length >= 12 ? 3 : 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState(null);
    try {
      const res = await fetch('/api/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      if (isUnauthorized(res)) return loginWithReturnTo('/account');
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setState({ ok: true, text: 'Пароль изменён. На других устройствах нужно войти заново.' }); setCurrent(''); setNext(''); }
      else setState({ ok: false, text: body.error ?? 'Не удалось изменить пароль.' });
    } catch {
      setState({ ok: false, text: 'Сеть недоступна.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cab-card acc-card" onSubmit={submit}>
      <h2><IconKey size={18} />Пароль</h2>
      <label className="nx-field"><span>Текущий пароль</span>
        <input className="input" type="password" value={current} autoComplete="current-password" required onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="nx-field"><span>Новый пароль</span>
        <input className="input" type="password" value={next} minLength={8} autoComplete="new-password" required onChange={(e) => setNext(e.target.value)} />
      </label>
      <div className={`acc-strength s${strength}`} aria-hidden="true"><i /><i /><i /></div>
      <small className="muted">{['Не короче 8 символов', 'Слишком короткий', 'Нормальный', 'Надёжный'][strength]}</small>
      {state && <p className={state.ok ? 'ok-box' : 'error-box'} role="status">{state.text}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || next.length < 8 || !current}>{busy ? 'Меняю…' : 'Изменить пароль'}</button>
    </form>
  );
}
