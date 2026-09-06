'use client';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/lib/auth/users';
import type { UserPrefs } from '@/lib/auth/prefs';
import type { QuotaStatus } from '@/lib/quota';
import { applyTheme, storeTheme, readStoredTheme, type Theme } from '@/lib/theme';
import { IconKey, IconSliders } from './icons';

interface Props { profile: UserProfile; quota: QuotaStatus }

const THEME_LABELS: [Theme, string][] = [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная']];
const QUALITY_LABELS: [NonNullable<UserPrefs['quality']>, string][] =
  [['fast', 'Быстро'], ['standard', 'Стандарт'], ['max', 'Максимум']];
const LEVEL_LABELS: [NonNullable<UserPrefs['level']>, string][] =
  [['grade7to9', '7–9 класс'], ['grade10to11', '10–11 класс'], ['students', 'Студенты']];
const STYLE_LABELS: [NonNullable<UserPrefs['style']>, string][] =
  [['schematic', 'Схема'], ['realistic', 'Реализм'], ['data', 'Данные']];

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v}
          className={value === v ? 'segmented-item active' : 'segmented-item'}
          onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export default function ProfileView({ profile, quota }: Props) {
  const [name, setName] = useState(profile.displayName ?? '');
  const [prefs, setPrefs] = useState<UserPrefs>(profile.prefs);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<Theme>(profile.prefs.theme ?? 'light');

  // Локальный выбор темы главнее серверного: он применён ещё до отрисовки.
  useEffect(() => { setTheme(readStoredTheme() ?? profile.prefs.theme ?? 'light'); }, [profile.prefs.theme]);

  async function save(patch: { displayName?: string | null; prefs?: UserPrefs }) {
    setSaved(false);
    const res = await fetch('/api/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2200); }
  }

  function setPref<K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    save({ prefs: { [key]: value } as UserPrefs });
  }

  function pickTheme(next: Theme) {
    setTheme(next); storeTheme(next); applyTheme(next); setPref('theme', next);
  }

  const initial = (profile.displayName || profile.email).slice(0, 1);
  const usedPct = quota.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Профиль</h1>
        <p className="muted">Аккаунт, оформление и настройки генерации по умолчанию.</p>
      </div>

      {saved && <div className="ok-box">Сохранено</div>}

      <section className="panel">
        <div className="row">
          <div className="avatar-lg">{initial}</div>
          <div className="row-label">
            <strong>{profile.displayName || profile.email}</strong>
            <span>
              {profile.displayName ? `${profile.email} · ` : ''}
              {profile.role === 'admin' ? 'администратор' : 'пользователь'}
            </span>
          </div>
        </div>
        <label className="field">
          <span>Как к вам обращаться</span>
          <input className="input" value={name} maxLength={60} placeholder="Имя"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => save({ displayName: name })} />
        </label>
        <div className="divider" />
        <div className="row">
          <div className="row-label">
            <strong>Генерации</strong>
            <span>{quota.limit === null
              ? 'Без ограничений'
              : `${quota.used} из ${quota.limit} в пробной версии`}</span>
          </div>
        </div>
        {quota.limit !== null && (
          <div className="meter">
            <div className={usedPct >= 100 ? 'meter-fill full' : 'meter-fill'} style={{ width: `${usedPct}%` }} />
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title"><IconSliders size={18} />Оформление</h2>
        <div className="row">
          <div className="row-label"><strong>Тема</strong><span>Светлая, тёмная или как в системе</span></div>
          <span className="spacer" />
          <Segmented value={theme} options={THEME_LABELS} onChange={pickTheme} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label">
            <strong>С чего начинать</strong>
            <span>Стенд показывает, что получится; поле — чистый лист</span>
          </div>
          <span className="spacer" />
          <Segmented value={prefs.startWithConstructor === false ? 'off' : 'on'}
            options={[['on', 'Стенд'], ['off', 'Поле']]}
            onChange={(v) => setPref('startWithConstructor', v === 'on')} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label">
            <strong>Голосовой ввод</strong>
            <span>Кнопка микрофона в поле запроса</span>
          </div>
          <span className="spacer" />
          <Segmented value={prefs.voiceInput === false ? 'off' : 'on'}
            options={[['on', 'Вкл'], ['off', 'Выкл']]}
            onChange={(v) => setPref('voiceInput', v === 'on')} />
        </div>
      </section>

      <section className="panel">
        <h2>По умолчанию</h2>
        <div className="row">
          <div className="row-label"><strong>Качество</strong><span>Дольше — точнее</span></div>
          <span className="spacer" />
          <Segmented value={prefs.quality ?? 'max'} options={QUALITY_LABELS}
            onChange={(v) => setPref('quality', v)} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label"><strong>Уровень</strong><span>Для кого объяснение</span></div>
          <span className="spacer" />
          <Segmented value={prefs.level ?? 'grade10to11'} options={LEVEL_LABELS}
            onChange={(v) => setPref('level', v)} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label"><strong>Стиль</strong><span>Как выглядит сцена</span></div>
          <span className="spacer" />
          <Segmented value={prefs.style ?? 'schematic'} options={STYLE_LABELS}
            onChange={(v) => setPref('style', v)} />
        </div>
      </section>

      <PasswordPanel />
    </div>
  );
}

function PasswordPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [state, setState] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setState(null);
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: 'ok', text: 'Пароль изменён. Другие устройства придётся войти заново.' });
        setCurrent(''); setNext('');
      } else {
        setState({ kind: 'err', text: body.error ?? 'Не удалось изменить пароль.' });
      }
    } catch {
      setState({ kind: 'err', text: 'Сеть недоступна.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="panel-title"><IconKey size={18} />Пароль</h2>
      <label className="field">
        <span>Текущий пароль</span>
        <input className="input" type="password" value={current} autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        <span>Новый пароль</span>
        <input className="input" type="password" value={next} minLength={8} autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)} required />
      </label>
      {state && <div className={state.kind === 'ok' ? 'ok-box' : 'error-box'}>{state.text}</div>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Меняю…' : 'Изменить пароль'}
        </button>
      </div>
    </form>
  );
}
