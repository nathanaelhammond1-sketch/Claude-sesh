import { useEffect, useRef, useState } from 'react';
import { AI_MODEL } from '../lib/ai';
import { formatTime, todayISO, WEEKDAYS_SHORT } from '../lib/dates';
import { readFileText, saveFile } from '../lib/files';
import { buildIcs } from '../lib/ics';
import * as repo from '../lib/repo';
import { notificationSupport, requestNotificationPermission, showSystemNotification } from '../lib/reminders';
import type { Route } from '../lib/router';
import type { ThemePref } from '../lib/types';
import { IconBell, IconCalendar, IconDownload, IconInfo, IconShare, IconSpark, IconTrash, IconUpload, IconX } from '../components/Icons';
import { Field, TopBar, Toggle } from '../components/ui';
import { checkForUpdate } from '../sw/register';
import { useStore } from '../state/store';

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="list-item">
      <div className="grow">
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export function Settings({ route }: { route: Route }) {
  const { settings, updateSettings, data, run, confirm, toast } = useStore();
  const [support, setSupport] = useState(notificationSupport());
  const [storage, setStorage] = useState<{ persisted: boolean | null; usage: number | null; quota: number | null }>({ persisted: null, usage: null, quota: null });
  const [keyDraft, setKeyDraft] = useState('');
  const [newCat, setNewCat] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const installRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const persisted = (await navigator.storage?.persisted?.()) ?? null;
        const est = await navigator.storage?.estimate?.();
        setStorage({ persisted, usage: est?.usage ?? null, quota: est?.quota ?? null });
      } catch {
        /* not supported */
      }
    })();
  }, []);
  useEffect(() => {
    if (route.path[1] === 'install') installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [route.path]);

  const setTheme = (t: ThemePref) => updateSettings({ theme: t });
  const toggleDay = (d: number) => updateSettings({ reviewDays: settings.reviewDays.includes(d) ? settings.reviewDays.filter((x) => x !== d) : [...settings.reviewDays, d].sort() });

  async function enableNotifications() {
    const p = await requestNotificationPermission();
    setSupport(notificationSupport());
    if (p === 'granted') {
      await updateSettings({ notificationsEnabled: true });
      toast('Notifications enabled');
    } else if (p === 'denied') toast('Notifications were blocked. You can change this in Settings.', 'error');
    else if (p === 'unsupported') toast('Notifications are not available here. Use the Calendar reminder instead.', 'error');
  }

  async function exportCalendar() {
    const url = location.href.split('#')[0];
    const reminders = [{ uid: 'daymark-evening-review', title: 'DAYMARK: Time to review your day', description: 'How much did you actually accomplish? Open DAYMARK and do your evening review.', time: settings.reviewTime, days: settings.reviewDays, durationMin: 15 }];
    if (settings.morningEnabled) reminders.push({ uid: 'daymark-morning-plan', title: 'DAYMARK: Set your intentions', description: 'What would make today count? Plan your day in DAYMARK.', time: settings.morningTime, days: settings.reviewDays, durationMin: 10 });
    const res = await saveFile(buildIcs(reminders, url), 'daymark-reminders.ics', 'text/calendar');
    if (res !== 'cancelled') toast(res === 'shared' ? 'Choose Calendar to add the reminders' : 'Calendar file saved — open it to add the reminders');
  }

  async function doExport() {
    try {
      const b = await repo.exportBackup(__APP_VERSION__);
      const res = await saveFile(JSON.stringify(b, null, 2), `daymark-backup-${todayISO()}.json`, 'application/json');
      if (res !== 'cancelled') {
        await updateSettings({ lastBackupAt: Date.now() });
        toast(`Backup created · ${b.data.tasks.length} tasks, ${b.data.journal.length} journal entries`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Backup failed', 'error');
    }
  }

  async function doImport(file: File) {
    try {
      const text = await readFileText(file);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON.');
      }
      const b = repo.validateBackup(parsed);
      const ok = await confirm({
        title: 'Restore this backup?',
        message: `This REPLACES everything currently in DAYMARK with the backup from ${new Date(b.exportedAt).toLocaleString()} (${b.data.tasks.length} tasks, ${b.data.journal.length} journal entries). Consider exporting a backup of your current data first.`,
        confirmLabel: 'Replace my data',
        danger: true,
      });
      if (!ok) return;
      await run(() => repo.importBackup(b), 'Backup restored');
      await run(() => repo.rollover());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function doReset() {
    const ok = await confirm({ title: 'Erase all data?', message: 'Every task, subtask, review, journal entry and setting on this device will be permanently deleted. Export a backup first if you might want it back.', confirmLabel: 'Erase everything', danger: true, requireText: 'RESET' });
    if (!ok) return;
    await run(async () => {
      await repo.resetAll();
    }, 'All data erased');
  }

  const fmtBytes = (n: number | null) => (n === null ? '—' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

  return (
    <div className="screen">
      <TopBar title="Settings" />

      <section className="section" style={{ marginTop: 6 }}>
        <div className="section-head">
          <h2>You</h2>
        </div>
        <div className="card">
          <Field label="Your name (optional)">
            <input className="input" value={settings.name} placeholder="Used in your greeting" onChange={(e) => updateSettings({ name: e.target.value })} maxLength={40} autoComplete="given-name" />
          </Field>
          <span className="label">Appearance</span>
          <div className="segmented" role="group" aria-label="Theme">
            {(['system', 'light', 'dark'] as ThemePref[]).map((t) => (
              <button key={t} aria-pressed={settings.theme === t} onClick={() => setTheme(t)}>
                {t === 'system' ? 'Automatic' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="h-rem">
        <div className="section-head">
          <h2 id="h-rem">Reminders</h2>
        </div>
        <div className="card">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Evening review time">
              <input className="input" type="time" value={settings.reviewTime} onChange={(e) => e.target.value && updateSettings({ reviewTime: e.target.value })} />
            </Field>
          </div>
          <span className="label">Reminder days</span>
          <div className="days-picker" role="group" aria-label="Reminder days">
            {WEEKDAYS_SHORT.map((w, i) => (
              <button key={w} aria-pressed={settings.reviewDays.includes(i)} onClick={() => toggleDay(i)} aria-label={w}>
                {w[0]}
              </button>
            ))}
          </div>
          <p className="hint">Reminder: “DAYMARK: Time to review your day. How much did you actually accomplish?” at {formatTime(settings.reviewTime)}.</p>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          <Row title="Morning planning reminder" sub={settings.morningEnabled ? `At ${formatTime(settings.morningTime)} on reminder days` : 'Off'}>
            <Toggle checked={settings.morningEnabled} onChange={(v) => updateSettings({ morningEnabled: v })} label="Morning planning reminder" />
          </Row>
          {settings.morningEnabled && (
            <div className="list-item">
              <div className="grow">
                <div className="title">Morning time</div>
              </div>
              <input className="input" style={{ width: 130 }} type="time" value={settings.morningTime} onChange={(e) => e.target.value && updateSettings({ morningTime: e.target.value })} aria-label="Morning reminder time" />
            </div>
          )}
          <Row title="Overdue task reminders" sub={`Checked at ${formatTime(settings.morningTime)}`}>
            <Toggle checked={settings.overdueEnabled} onChange={(v) => updateSettings({ overdueEnabled: v })} label="Overdue task reminders" />
          </Row>
          <Row title="Subtask reminders" sub={`Subtasks due today, at ${formatTime(settings.morningTime)}`}>
            <Toggle checked={settings.subtaskEnabled} onChange={(v) => updateSettings({ subtaskEnabled: v })} label="Subtask reminders" />
          </Row>
        </div>
      </section>

      <section className="section" aria-labelledby="h-notif">
        <div className="section-head">
          <h2 id="h-notif">Notifications</h2>
        </div>
        <div className="card">
          <div className="banner info" style={{ marginBottom: 12 }}>
            <IconInfo />
            <div className="grow small">
              <b>
                Status:{' '}
                {support.permission === 'granted' ? 'Allowed' : support.permission === 'denied' ? 'Blocked' : support.permission === 'unsupported' ? 'Not available here' : 'Not enabled'}
                {support.standalone ? ' · Installed app' : ' · Browser tab'}
              </b>
              {support.message}
            </div>
          </div>
          <p className="small" style={{ marginTop: 0 }}>
            <b>What this means honestly:</b> while DAYMARK is open (or recently backgrounded), it shows a real notification at your reminder time. iOS does <i>not</i> let web apps schedule notifications for when the app is closed — that needs a push server, which DAYMARK deliberately doesn't use to keep your data private. If you open DAYMARK after your reminder time, you'll see the review prompt in the app instead.
          </p>
          <div className="stack">
            {support.permission !== 'granted' && support.api && (
              <button className="btn primary block" onClick={enableNotifications}>
                <IconBell /> Enable notifications
              </button>
            )}
            {support.permission === 'granted' && (
              <>
                <div className="list" style={{ boxShadow: 'none' }}>
                  <Row title="Notify while app is open" sub="Uses the reminder times above">
                    <Toggle checked={settings.notificationsEnabled} onChange={(v) => updateSettings({ notificationsEnabled: v })} label="Notify while app is open" />
                  </Row>
                </div>
                <button
                  className="btn ghost block"
                  onClick={async () => {
                    const ok = await showSystemNotification('DAYMARK', 'Test notification — reminders are working.', '#/settings', 'test');
                    toast(ok ? 'Test notification sent' : 'The notification could not be shown on this device', ok ? 'info' : 'error');
                  }}
                >
                  Send test notification
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <IconCalendar width={22} height={22} style={{ color: 'var(--gold)', flex: 'none', marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 650 }}>Most reliable: add reminders to your Calendar</div>
              <p className="small muted" style={{ margin: '4px 0 10px' }}>
                Creates a repeating {formatTime(settings.reviewTime)} event with an alert{settings.morningEnabled ? ` (and a ${formatTime(settings.morningTime)} planning event)` : ''} on your selected days. iPhone Calendar alerts arrive even when DAYMARK is closed. Re-add it if you change the time.
              </p>
              <button className="btn gold sm" onClick={exportCalendar} disabled={!settings.reviewDays.length}>
                <IconCalendar /> Add to Calendar
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section" ref={installRef} aria-labelledby="h-install" id="install">
        <div className="section-head">
          <h2 id="h-install">Install on iPhone</h2>
          {support.standalone && <span className="pill green">Installed</span>}
        </div>
        <div className="card small">
          <ol className="steps">
            <li>
              Open DAYMARK in <b>Safari</b> (installation is done from Safari).
            </li>
            <li>
              Tap the <b>Share</b> button <IconShare width={14} height={14} style={{ verticalAlign: -2 }} /> in the toolbar.
            </li>
            <li>
              Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.
            </li>
            <li>Open DAYMARK from its Home Screen icon. It runs full-screen and works offline.</li>
            <li>
              Then come back here and tap <b>Enable notifications</b> (requires iOS 16.4+).
            </li>
          </ol>
          <p className="muted" style={{ margin: '8px 0 0' }}>
            Note: the Home Screen app and Safari keep separate storage. Use one consistently, or move data with Export → Import.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="h-ai">
        <div className="section-head">
          <h2 id="h-ai">AI subtask assistant</h2>
          <span className="pill outline">Optional</span>
        </div>
        <div className="card">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <IconSpark width={22} height={22} style={{ color: 'var(--gold)' }} />
              <b>Suggest subtasks during review</b>
            </div>
            <Toggle checked={settings.aiEnabled} onChange={(v) => updateSettings({ aiEnabled: v, aiConsentAt: v ? Date.now() : settings.aiConsentAt })} label="Enable AI subtask suggestions" />
          </div>
          <p className="small muted">
            Off by default. When you tap “Suggest with AI” in a review, DAYMARK first shows you exactly what will be sent: the task title, description, percentage, your description of the remaining work and the reason. That text goes directly from this device to Anthropic's API ({AI_MODEL}) using your own API key — nothing else, and never without your tap. Suggestions arrive unchecked for you to edit and approve.
          </p>
          {settings.aiEnabled && (
            <>
              {settings.aiApiKey ? (
                <div className="list-item" style={{ padding: '8px 0' }}>
                  <div className="grow">
                    <div className="title">API key saved on this device</div>
                    <div className="sub">•••• {settings.aiApiKey.slice(-4)} — not included in backups</div>
                  </div>
                  <button className="btn danger sm" onClick={() => updateSettings({ aiApiKey: '' })}>
                    <IconX /> Remove
                  </button>
                </div>
              ) : (
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Field label="Anthropic API key">
                    <input className="input" type="password" autoComplete="off" placeholder="sk-ant-…" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
                  </Field>
                  <button
                    className="btn primary"
                    style={{ flex: 'none', marginBottom: 14 }}
                    disabled={!keyDraft.trim()}
                    onClick={() => {
                      updateSettings({ aiApiKey: keyDraft.trim() });
                      setKeyDraft('');
                      toast('API key saved on this device');
                    }}
                  >
                    Save
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="h-cat">
        <div className="section-head">
          <h2 id="h-cat">Categories</h2>
        </div>
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {settings.categories.map((c) => (
              <span key={c} className="pill" style={{ fontSize: 13, padding: '5px 6px 5px 11px' }}>
                {c}
                <button
                  aria-label={`Remove category ${c}`}
                  style={{ background: 'none', border: 0, padding: 2, display: 'inline-flex', color: 'inherit' }}
                  onClick={() => settings.categories.length > 1 && updateSettings({ categories: settings.categories.filter((x) => x !== c) })}
                >
                  <IconX width={14} height={14} />
                </button>
              </span>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const c = newCat.trim();
              if (c && !settings.categories.includes(c)) updateSettings({ categories: [...settings.categories, c] });
              setNewCat('');
            }}
          >
            <input className="input" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={40} aria-label="New category" />
            <button className="btn ghost" style={{ flex: 'none' }} type="submit" disabled={!newCat.trim()}>
              Add
            </button>
          </form>
          <p className="hint">Removing a category doesn't change existing tasks.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="h-data">
        <div className="section-head">
          <h2 id="h-data">Your data</h2>
        </div>
        <div className="card small">
          <p style={{ marginTop: 0 }}>
            DAYMARK is local-first: everything is stored in this browser's IndexedDB on this device. There is no account and no server — nothing is sent anywhere unless you use the optional AI assistant.
          </p>
          <dl className="kv">
            <dt>Tasks · journal entries</dt>
            <dd>
              {data.tasks.length} · {data.journal.length}
            </dd>
            <dt>Storage used</dt>
            <dd>{fmtBytes(storage.usage)}</dd>
            <dt>Protected from eviction</dt>
            <dd>{storage.persisted === null ? 'Unknown' : storage.persisted ? 'Yes' : support.standalone ? 'Not guaranteed' : 'Install app for best protection'}</dd>
            <dt>Last backup</dt>
            <dd>{settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}</dd>
          </dl>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <button className="btn primary block" onClick={doExport}>
            <IconDownload /> Export backup (.json)
          </button>
          <button className="btn ghost block" onClick={() => fileRef.current?.click()}>
            <IconUpload /> Import / restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          <button className="btn danger block" onClick={doReset}>
            <IconTrash /> Reset all data
          </button>
        </div>
      </section>

      <section className="section" aria-labelledby="h-about">
        <div className="section-head">
          <h2 id="h-about">About</h2>
        </div>
        <div className="card small">
          <div className="brand-mark" style={{ fontSize: 16 }}>
            DAYMARK
          </div>
          <div className="muted">Make every day count.</div>
          <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>“Be honest about what you planned. Be honest about what you accomplished. Be intentional about what comes next.”</p>
          <dl className="kv">
            <dt>Version</dt>
            <dd>
              {__APP_VERSION__} <span className="muted">({__BUILD_ID__.split('-')[1] ?? ''})</span>
            </dd>
          </dl>
          <button
            className="btn ghost sm"
            style={{ marginTop: 10 }}
            onClick={async () => {
              const r = await checkForUpdate();
              toast(r === 'updating' ? 'Update found — installing…' : r === 'current' ? 'You have the latest version' : 'Could not check for updates (offline?)');
            }}
          >
            Check for updates
          </button>
        </div>
      </section>
    </div>
  );
}
