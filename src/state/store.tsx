import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { now, today as todayFn } from '../lib/clock';
import { msUntilMidnight } from '../lib/dates';
import * as repo from '../lib/repo';
import { type AppData, DEFAULT_SETTINGS, type ISODate, type Settings, type Task } from '../lib/types';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
  action?: { label: string; run: () => void };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  requireText?: string;
}

export interface TaskFormState {
  task?: Task;
  date?: ISODate;
}

interface StoreValue {
  ready: boolean;
  fatal: string | null;
  data: AppData;
  settings: Settings;
  today: ISODate;
  refresh: () => Promise<void>;
  /** Run a mutation, refresh, and surface errors as a toast. Returns undefined on failure. */
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  confirmState: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  answerConfirm: (v: boolean) => void;
  taskForm: TaskFormState | null;
  openTaskForm: (s?: TaskFormState) => void;
  closeTaskForm: () => void;
}

const EMPTY: AppData = { tasks: [], entries: [], subtasks: [], reviews: [], events: [], journal: [], days: [] };
const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(EMPTY);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [today, setToday] = useState<ISODate>(todayFn());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<StoreValue['confirmState']>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null);
  const toastId = useRef(0);
  const rolling = useRef(false);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info', action?: Toast['action']) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    const [d, s] = await Promise.all([repo.loadAll(), repo.getSettings()]);
    setData(d);
    setSettings(s);
  }, []);

  const doRollover = useCallback(
    async (announce: boolean) => {
      if (rolling.current) return;
      rolling.current = true;
      try {
        const td = todayFn();
        const res = await repo.rollover(td);
        setToday(td);
        await refresh();
        if (announce && res.carried > 0) toast(`${res.carried} unfinished task${res.carried === 1 ? '' : 's'} carried forward to today.`);
      } finally {
        rolling.current = false;
      }
    },
    [refresh, toast],
  );

  // Initial load + rollover.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await doRollover(true);
        if (!cancelled) setReady(true);
        // Ask the browser to keep our data (reduces the risk of eviction under storage pressure).
        navigator.storage?.persist?.().catch(() => undefined);
      } catch (e) {
        console.error(e);
        if (!cancelled) setFatal(e instanceof Error ? e.message : 'DAYMARK could not open its database.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doRollover]);

  // Re-check the date when the app returns to the foreground, and at local midnight.
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (document.visibilityState === 'visible') doRollover(true).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    let timer: number;
    const arm = () => {
      timer = window.setTimeout(() => {
        doRollover(true).catch(() => undefined);
        arm();
      }, msUntilMidnight(now()));
    };
    arm();
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      clearTimeout(timer);
    };
  }, [ready, doRollover]);

  // Other tabs: refresh when they write (BroadcastChannel where supported).
  const channel = useMemo(() => (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daymark') : null), []);
  useEffect(() => {
    if (!channel) return;
    channel.onmessage = () => refresh().catch(() => undefined);
    return () => channel.close();
  }, [channel, refresh]);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        await refresh();
        channel?.postMessage('changed');
        if (success) toast(success);
        return r;
      } catch (e) {
        console.error(e);
        toast(e instanceof Error ? e.message : 'Something went wrong. Your data was not changed.', 'error');
        return undefined;
      }
    },
    [refresh, toast, channel],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      try {
        setSettings(await repo.saveSettings(patch));
        channel?.postMessage('changed');
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not save settings.', 'error');
      }
    },
    [toast, channel],
  );

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })), []);

  const value: StoreValue = {
    ready,
    fatal,
    data,
    settings,
    today,
    refresh,
    run,
    toast,
    toasts,
    dismissToast,
    updateSettings,
    confirm,
    confirmState,
    answerConfirm: (v: boolean) => {
      confirmState?.resolve(v);
      setConfirmState(null);
    },
    taskForm,
    openTaskForm: (s = {}) => setTaskForm(s),
    closeTaskForm: () => setTaskForm(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside provider');
  return v;
}

/* ---------- Derived selectors ---------- */

export interface TodayItem {
  task: Task;
  entry: AppData['entries'][number];
  openSubtasks: number;
  totalSubtasks: number;
}

export function selectDay(data: AppData, date: ISODate): TodayItem[] {
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const subCounts = new Map<string, { open: number; total: number }>();
  for (const s of data.subtasks) {
    const c = subCounts.get(s.taskId) ?? { open: 0, total: 0 };
    c.total++;
    if (!s.done) c.open++;
    subCounts.set(s.taskId, c);
  }
  return data.entries
    .filter((e) => e.date === date && !e.rescheduledTo && !e.droppedAs && tasks.has(e.taskId))
    .map((entry) => ({ entry, task: tasks.get(entry.taskId)!, openSubtasks: subCounts.get(entry.taskId)?.open ?? 0, totalSubtasks: subCounts.get(entry.taskId)?.total ?? 0 }));
}
