import { Component, type ReactNode, useEffect, useRef, useState } from 'react';
import { now } from './lib/clock';
import { toISODate } from './lib/dates';
import * as repo from './lib/repo';
import { dueReminders, NOTIFY_WINDOW_MIN, type ReminderLog, showSystemNotification } from './lib/reminders';
import { go, useRoute } from './lib/router';
import { IconBell, IconJournal, IconProgress, IconSettings, IconTasks, IconToday, IconX } from './components/Icons';
import { History } from './screens/History';
import { Journal } from './screens/Journal';
import { Progress } from './screens/Progress';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { TaskDetail } from './screens/TaskDetail';
import { TaskForm } from './screens/TaskForm';
import { Tasks } from './screens/Tasks';
import { Today } from './screens/Today';
import { applyUpdate, UPDATE_EVENT } from './sw/register';
import { useStore } from './state/store';

const TABS = [
  { id: 'today', label: 'Today', icon: IconToday },
  { id: 'tasks', label: 'Tasks', icon: IconTasks },
  { id: 'progress', label: 'Progress', icon: IconProgress },
  { id: 'journal', label: 'Journal', icon: IconJournal },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];
const TAB_OF: Record<string, string> = { today: 'today', review: 'today', tasks: 'tasks', task: 'tasks', progress: 'progress', history: 'progress', journal: 'journal', settings: 'settings' };

export function App() {
  const store = useStore();
  const { ready, fatal, settings, taskForm, toasts, dismissToast, confirmState } = store;
  const route = useRoute();
  useTheme(settings.theme);
  useReminders();
  useUpdateToast();

  if (fatal) {
    return (
      <div className="app">
        <div className="loading" role="alert">
          <div className="brand-mark">DAYMARK</div>
          <p style={{ maxWidth: 320, textAlign: 'center' }}>{fatal}</p>
          <p className="small muted" style={{ maxWidth: 320, textAlign: 'center' }}>
            If you're in a private browsing window, open DAYMARK in a normal tab — private mode can block storage.
          </p>
          <button className="btn primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="app">
        <div className="loading" role="status" aria-live="polite">
          <div className="brand-mark">DAYMARK</div>
          <div className="spinner" />
          <span className="small">Loading your day…</span>
        </div>
      </div>
    );
  }

  const [head, sub] = route.path;
  let screen: ReactNode;
  switch (head) {
    case 'tasks':
      screen = <Tasks key={route.raw} route={route} />;
      break;
    case 'task':
      screen = <TaskDetail key={sub} id={sub} />;
      break;
    case 'review':
      screen = <Review key={sub ?? 'today'} date={sub} />;
      break;
    case 'progress':
      screen = <Progress />;
      break;
    case 'history':
      screen = <History key={sub ?? 'today'} date={sub} />;
      break;
    case 'journal':
      screen = <Journal key={sub ?? 'today'} date={sub} />;
      break;
    case 'settings':
      screen = <Settings route={route} />;
      break;
    default:
      screen = <Today />;
  }
  const activeTab = TAB_OF[head] ?? 'today';
  const reviewPending = store.data.entries.some((e) => e.date === store.today) && !store.data.days.some((d) => d.date === store.today && d.reviewCompletedAt);

  return (
    <>
      <main className="app" id="main">
        <ErrorBoundary key={route.raw}>{screen}</ErrorBoundary>
      </main>
      <div className="tabbar">
        <nav aria-label="Main">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={activeTab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
              <t.icon />
              {t.label}
              {t.id === 'today' && reviewPending && isAfterReviewTime(settings.reviewTime) && <span className="dot" aria-label="Review pending" />}
            </button>
          ))}
        </nav>
      </div>
      {taskForm && <TaskForm key={taskForm.task?.id ?? 'new'} />}
      {confirmState && <ConfirmDialog />}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} style={{ textDecoration: 'none', opacity: 0.7 }}>
              <IconX width={16} height={16} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function isAfterReviewTime(hhmm: string) {
  const d = now();
  const [h, m] = hhmm.split(':').map(Number);
  return d.getHours() * 60 + d.getMinutes() >= h * 60 + m;
}

function ConfirmDialog() {
  const { confirmState: c, answerConfirm } = useStore();
  const [typed, setTyped] = useState('');
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && answerConfirm(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [answerConfirm]);
  if (!c) return null;
  const blocked = !!c.requireText && typed.trim().toUpperCase() !== c.requireText;
  return (
    <div className="backdrop dialog-wrap" onMouseDown={(e) => e.target === e.currentTarget && answerConfirm(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
        <h2 id="dlg-t">{c.title}</h2>
        <p id="dlg-m">{c.message}</p>
        {c.requireText && (
          <label className="field">
            <span className="label">Type {c.requireText} to confirm</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          </label>
        )}
        <div className="btn-row">
          <button className="btn ghost" ref={ref} onClick={() => answerConfirm(false)}>
            Cancel
          </button>
          <button className={`btn ${c.danger ? 'danger' : 'primary'}`} disabled={blocked} onClick={() => answerConfirm(true)}>
            {c.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

function useTheme(theme: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1426' : '#f6f1e7');
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);
}

/**
 * In-app reminder scheduler. Runs only while the app is running (that is the honest limit of a
 * PWA on iOS). Reminders that come due while open → real system notification if permitted.
 * Reminders that were missed while closed → shown as an in-app prompt, never as a fake notification.
 */
function useReminders() {
  const { ready, settings, data, toast } = useStore();
  const stateRef = useRef({ settings, data });
  stateRef.current = { settings, data };
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const { settings: s, data: d } = stateRef.current;
      const log = ((await repo.getMeta<ReminderLog>('reminderLog')) ?? {}) as ReminderLog;
      const nowD = now();
      const due = dueReminders(s, d, nowD, log);
      if (!due.length) return;
      const date = toISODate(nowD);
      for (const r of due) {
        let delivered = false;
        if (s.notificationsEnabled && r.lateBy <= NOTIFY_WINDOW_MIN) delivered = await showSystemNotification(r.title, r.body, r.route, `daymark-${r.kind}`);
        if (!delivered && document.visibilityState === 'visible') {
          if (r.kind === 'review') toast('Time to review your day. How much did you actually accomplish?', 'info', { label: 'Review', run: () => go('review') });
          else if (r.kind === 'morning') toast(r.body, 'info', { label: 'Plan', run: () => go('today') });
          else toast(r.body, 'info', { label: 'View', run: () => go(r.route.replace(/^#\//, '')) });
        } else if (!delivered) continue; // hidden and not deliverable — try again when visible
        log[r.kind] = date;
      }
      await repo.setMeta('reminderLog', log);
    };
    const id = window.setInterval(tick, 30_000);
    const first = window.setTimeout(tick, 2500);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      clearInterval(id);
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ready, toast]);
}

function useUpdateToast() {
  const { toast } = useStore();
  useEffect(() => {
    const on = () => toast('A new version of DAYMARK is ready.', 'info', { label: 'Update', run: applyUpdate });
    window.addEventListener(UPDATE_EVENT, on);
    return () => window.removeEventListener(UPDATE_EVENT, on);
  }, [toast]);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card empty-state" role="alert">
          <div className="art">
            <IconBell />
          </div>
          <h3>Something went wrong on this screen</h3>
          <p>Your data is safe — it's stored separately. Try going back to Today.</p>
          <div className="code" style={{ textAlign: 'left', marginBottom: 12 }}>
            {this.state.error.message}
          </div>
          <button className="btn primary" onClick={() => (location.hash = '#/today')}>
            Back to Today
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
