'use client';
import { useEffect, useState } from 'react';
import type { UserProfile } from '@/lib/auth/users';
import { userContact, userLabel } from '@/lib/auth/identifier';
import type { UserPrefs } from '@/lib/auth/prefs';
import type { QuotaStatus } from '@/lib/quota';
import { applyTheme, storeTheme, readStoredTheme, type Theme } from '@/lib/theme';
import { isUnauthorized, loginWithReturnTo } from '@/lib/auth/client-session';
import { IconKey, IconSliders } from './icons';
import { useFormat, useT } from '@/i18n/client';
import { app } from '@/i18n/messages/app';
import LanguageSwitcher from './LanguageSwitcher';

type AppKey = keyof typeof app.ru;

interface Props { profile: UserProfile; quota: QuotaStatus; orgQuota: boolean }

const THEME_LABELS: [Theme, AppKey][] = [['light', 'themeLight'], ['dark', 'themeDark'], ['system', 'themeSystem']];
const QUALITY_LABELS: [NonNullable<UserPrefs['quality']>, AppKey][] =
  [['fast', 'qFast'], ['standard', 'qStandard'], ['max', 'qMax']];
const LEVEL_LABELS: [NonNullable<UserPrefs['level']>, AppKey][] =
  [['grade7to9', 'lvl7'], ['grade10to11', 'lvl10'], ['students', 'lvlStudents']];
const STYLE_LABELS: [NonNullable<UserPrefs['style']>, AppKey][] =
  [['schematic', 'stSchematic'], ['realistic', 'stRealistic'], ['data', 'stData']];

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: [T, AppKey][]; onChange: (v: T) => void;
}) {
  const t = useT(app);
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v}
          className={value === v ? 'segmented-item active' : 'segmented-item'}
          onClick={() => onChange(v)}>{t(label)}</button>
      ))}
    </div>
  );
}

export default function ProfileView({ profile, quota, orgQuota }: Props) {
  const t = useT(app);
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
    if (isUnauthorized(res)) { loginWithReturnTo('/profile'); return; }
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

  const label = userLabel(profile);
  const contact = userContact(profile);
  const initial = label.slice(0, 1);
  const usedPct = quota.limit ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('profileTitle')}</h1>
        <p className="muted">{t('profileLead')}</p>
      </div>

      {saved && <div className="ok-box">{t('saved')}</div>}

      <section className="panel">
        <div className="row">
          <div className="avatar-lg">{initial}</div>
          <div className="row-label">
            <strong>{label}</strong>
            <span>
              {/* Без имени подписью уже служит почта или логин — второй раз её не повторяем. */}
              {profile.displayName && contact ? `${contact} · ` : ''}
              {profile.role === 'admin' ? t('roleAdmin') : t('roleUser')}
            </span>
          </div>
        </div>
        <label className="field">
          <span>{t('nameLabel')}</span>
          <input className="input" value={name} maxLength={60} placeholder={t('namePh')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => save({ displayName: name })} />
        </label>
        <div className="divider" />
        <div className="row">
          <div className="row-label">
            <strong>{t('generations')}</strong>
            <span>{quota.limit === null
              ? t('unlimited')
              : t(orgQuota ? 'quotaOrg' : 'quotaTrial', { used: quota.used, limit: quota.limit })}</span>
          </div>
        </div>
        {quota.limit !== null && (
          <div className="meter">
            <div className={usedPct >= 100 ? 'meter-fill full' : 'meter-fill'} style={{ width: `${usedPct}%` }} />
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title"><IconSliders size={18} />{t('appearance')}</h2>
        <div className="row">
          <div className="row-label"><strong>{t('theme')}</strong><span>{t('themeHint')}</span></div>
          <span className="spacer" />
          <Segmented value={theme} options={THEME_LABELS} onChange={pickTheme} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label"><strong>{t('language')}</strong><span>{t('languageHint')}</span></div>
          <span className="spacer" />
          <LanguageSwitcher compact label={t('language')} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label">
            <strong>{t('startWith')}</strong>
            <span>{t('startWithHint')}</span>
          </div>
          <span className="spacer" />
          <Segmented value={prefs.startWithConstructor === false ? 'off' : 'on'}
            options={[['on', 'startStand'], ['off', 'startField']]}
            onChange={(v) => setPref('startWithConstructor', v === 'on')} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label">
            <strong>{t('voice')}</strong>
            <span>{t('voiceHint')}</span>
          </div>
          <span className="spacer" />
          <Segmented value={prefs.voiceInput === false ? 'off' : 'on'}
            options={[['on', 'on'], ['off', 'off']]}
            onChange={(v) => setPref('voiceInput', v === 'on')} />
        </div>
      </section>

      <section className="panel">
        <h2>{t('defaults')}</h2>
        <div className="row">
          <div className="row-label"><strong>{t('quality')}</strong><span>{t('qualityHint')}</span></div>
          <span className="spacer" />
          <Segmented value={prefs.quality ?? 'max'} options={QUALITY_LABELS}
            onChange={(v) => setPref('quality', v)} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label"><strong>{t('level')}</strong><span>{t('levelHint')}</span></div>
          <span className="spacer" />
          <Segmented value={prefs.level ?? 'grade10to11'} options={LEVEL_LABELS}
            onChange={(v) => setPref('level', v)} />
        </div>
        <div className="divider" />
        <div className="row">
          <div className="row-label"><strong>{t('style')}</strong><span>{t('styleHint')}</span></div>
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
  const t = useT(app);
  const f = useFormat();
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
      if (isUnauthorized(res)) { loginWithReturnTo('/profile'); return; }
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setState({ kind: 'ok', text: t('passwordChanged') });
        setCurrent(''); setNext('');
      } else {
        setState({ kind: 'err', text: body.error ?? t('passwordFailed') });
      }
    } catch {
      setState({ kind: 'err', text: t('networkShort') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="panel-title"><IconKey size={18} />{t('password')}</h2>
      <label className="field">
        <span>{t('currentPassword')}</span>
        <input className="input" type="password" value={current} autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        <span>{t('newPassword')}</span>
        <input className="input" type="password" value={next} minLength={8} autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)} required />
      </label>
      {state && <div className={state.kind === 'ok' ? 'ok-box' : 'error-box'}>{f.message(state.text)}</div>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t('changing') : t('changePassword')}
        </button>
      </div>
    </form>
  );
}
