import { now, today } from './clock';
import { addDays } from './dates';
import { STORES, type Tx, uid, withTx } from './db';
import {
  type AppData,
  type DayEntry,
  type DayRecord,
  DEFAULT_SETTINGS,
  type ISODate,
  type JournalEntry,
  type Priority,
  type ProgressEvent,
  type ProgressSource,
  type Review,
  type ReviewOutcome,
  type Settings,
  type Subtask,
  type Task,
} from './types';

export const entryId = (date: ISODate, taskId: string) => `${date}|${taskId}`;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export async function loadAll(): Promise<AppData> {
  return withTx([...STORES], 'readonly', async (t) => {
    const [tasks, entries, subtasks, reviews, events, journal, days] = await Promise.all([
      t.getAll<Task>('tasks'),
      t.getAll<DayEntry>('entries'),
      t.getAll<Subtask>('subtasks'),
      t.getAll<Review>('reviews'),
      t.getAll<ProgressEvent>('events'),
      t.getAll<JournalEntry>('journal'),
      t.getAll<DayRecord>('days'),
    ]);
    return { tasks, entries, subtasks, reviews, events, journal, days };
  });
}

export async function getSettings(): Promise<Settings> {
  const row = await withTx('meta', 'readonly', (t) => t.get<{ key: string; value: Settings }>('meta', 'settings'));
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return withTx('meta', 'readwrite', async (t) => {
    const row = await t.get<{ key: string; value: Settings }>('meta', 'settings');
    const value = { ...DEFAULT_SETTINGS, ...(row?.value ?? {}), ...patch };
    await t.put('meta', { key: 'settings', value });
    return value;
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await withTx('meta', 'readonly', (t) => t.get<{ key: string; value: T }>('meta', key));
  return row?.value;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await withTx('meta', 'readwrite', (t) => t.put('meta', { key, value }));
}

/* ------------------------------------------------------------------ */
/* Helpers (run inside a transaction)                                  */
/* ------------------------------------------------------------------ */

function newEntry(task: Task, date: ISODate, carriedFrom: ISODate | null): DayEntry {
  const ts = now().getTime();
  return {
    id: entryId(date, task.id),
    date,
    taskId: task.id,
    titleSnapshot: task.title,
    categorySnapshot: task.category,
    prioritySnapshot: task.priority,
    startProgress: task.progress,
    endProgress: task.progress,
    carriedFrom,
    rescheduledTo: null,
    droppedAs: null,
    subtasksAtClose: null,
    closed: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Ensure the task is on today's list (used when reopening/restoring). Idempotent. */
async function ensureOnDay(t: Tx, task: Task, date: ISODate, carriedFrom: ISODate | null) {
  const existing = await t.get<DayEntry>('entries', entryId(date, task.id));
  if (existing) {
    if (existing.rescheduledTo || existing.droppedAs) {
      await t.put('entries', { ...existing, rescheduledTo: null, droppedAs: null, updatedAt: now().getTime() });
    }
    return;
  }
  await t.put('entries', newEntry(task, date, carriedFrom));
}

async function applyProgress(t: Tx, task: Task, value: number, source: ProgressSource, dateForEvent: ISODate = today()): Promise<Task> {
  const to = clamp(value);
  const from = task.progress;
  const ts = now().getTime();
  const td = today();
  let next: Task = { ...task, progress: to, updatedAt: ts };
  if (to >= 100 && from < 100) next.completedAt = ts;
  if (to < 100) next.completedAt = null;

  // Reopening a task that was completed on a past day brings it back to today.
  if (to < 100 && next.scheduledDate < td && next.lifecycle === 'active') {
    const prev = next.scheduledDate;
    next = { ...next, scheduledDate: td, carryCount: next.carryCount + 1 };
    await ensureOnDay(t, { ...next, progress: from }, td, prev);
  }

  if (from !== to) {
    const ev: ProgressEvent = { id: uid(), taskId: task.id, date: dateForEvent, from, to, at: ts, source };
    await t.put('events', ev);
  }

  // Update the daily instance for the day the task is planned on.
  const e = await t.get<DayEntry>('entries', entryId(next.scheduledDate, task.id));
  if (e && !e.closed) {
    const upd: DayEntry = { ...e, endProgress: to, updatedAt: ts };
    if (next.scheduledDate > td) upd.startProgress = to; // a future day hasn't started yet
    await t.put('entries', upd);
  }
  await t.put('tasks', next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export interface TaskInput {
  title: string;
  description?: string;
  category?: string;
  priority?: Priority;
  scheduledDate?: ISODate;
  dueDate?: ISODate | null;
  estimatedMinutes?: number | null;
  notes?: string;
  progress?: number;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new Error('A task needs a title.');
  const ts = now().getTime();
  const td = today();
  const date = input.scheduledDate && input.scheduledDate >= td ? input.scheduledDate : td;
  const progress = clamp(input.progress ?? 0);
  const task: Task = {
    id: uid(),
    title,
    description: input.description?.trim() ?? '',
    category: input.category?.trim() || 'Personal',
    priority: input.priority ?? 'medium',
    scheduledDate: date,
    originDate: date,
    dueDate: input.dueDate || null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    notes: input.notes ?? '',
    progress,
    lifecycle: 'active',
    carryCount: 0,
    createdAt: ts,
    updatedAt: ts,
    completedAt: progress >= 100 ? ts : null,
    archivedAt: null,
  };
  await withTx(['tasks', 'entries', 'events'], 'readwrite', async (t) => {
    await t.put('tasks', task);
    await t.put('entries', { ...newEntry({ ...task, progress: 0 }, date, null), endProgress: progress, startProgress: date > td ? progress : 0 });
    if (progress > 0) {
      await t.put('events', { id: uid(), taskId: task.id, date: td, from: 0, to: progress, at: ts, source: 'create' } satisfies ProgressEvent);
    }
  });
  return task;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'category' | 'priority' | 'dueDate' | 'estimatedMinutes' | 'notes'>>;

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  return withTx(['tasks', 'entries'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', id);
    if (!task) throw new Error('Task not found.');
    const next: Task = { ...task, ...patch, updatedAt: now().getTime() };
    if (patch.title !== undefined) {
      next.title = patch.title.trim();
      if (!next.title) throw new Error('A task needs a title.');
    }
    await t.put('tasks', next);
    // Keep the open day's snapshot in sync; closed days keep their historical snapshot.
    const e = await t.get<DayEntry>('entries', entryId(next.scheduledDate, id));
    if (e && !e.closed) {
      await t.put('entries', { ...e, titleSnapshot: next.title, categorySnapshot: next.category, prioritySnapshot: next.priority, updatedAt: next.updatedAt });
    }
    return next;
  });
}

export async function setProgress(id: string, value: number, source: ProgressSource = 'slider'): Promise<Task> {
  return withTx(['tasks', 'entries', 'events'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', id);
    if (!task) throw new Error('Task not found.');
    return applyProgress(t, task, value, source);
  });
}

export async function completeTask(id: string, checkSubtasks = true): Promise<Task> {
  return withTx(['tasks', 'entries', 'events', 'subtasks'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', id);
    if (!task) throw new Error('Task not found.');
    if (checkSubtasks) {
      const subs = await t.getAllByIndex<Subtask>('subtasks', 'taskId', id);
      const ts = now().getTime();
      for (const s of subs.filter((x) => !x.done)) await t.put('subtasks', { ...s, done: true, completedAt: ts, completedOn: today() });
    }
    return applyProgress(t, task, 100, 'complete');
  });
}

export async function rescheduleTask(id: string, newDate: ISODate): Promise<Task> {
  const td = today();
  if (newDate < td) throw new Error('Tasks can only be rescheduled to today or a future date.');
  return withTx(['tasks', 'entries'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', id);
    if (!task) throw new Error('Task not found.');
    if (task.scheduledDate === newDate) return task;
    const ts = now().getTime();
    const old = await t.get<DayEntry>('entries', entryId(task.scheduledDate, id));
    if (old && !old.closed) await t.put('entries', { ...old, rescheduledTo: newDate, updatedAt: ts });
    const next: Task = { ...task, scheduledDate: newDate, updatedAt: ts };
    await ensureOnDay(t, next, newDate, null);
    await t.put('tasks', next);
    return next;
  });
}

async function setLifecycle(id: string, lifecycle: 'archived' | 'abandoned') {
  return withTx(['tasks', 'entries'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', id);
    if (!task) throw new Error('Task not found.');
    const ts = now().getTime();
    const next: Task = { ...task, lifecycle, archivedAt: ts, updatedAt: ts };
    await t.put('tasks', next);
    // Remove an unfinished task from the open day's plan (history of earlier days is untouched).
    const e = await t.get<DayEntry>('entries', entryId(task.scheduledDate, id));
    if (e && !e.closed && task.progress < 100) await t.put('entries', { ...e, droppedAs: lifecycle, updatedAt: ts });
    return next;
  });
}

export const archiveTask = (id: string) => setLifecycle(id, 'archived');
export const abandonTask = (id: string) => setLifecycle(id, 'abandoned');

export async function restoreTask(id: string): Promise<Task> {
  return withTx(['tasks', 'entries'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', id);
    if (!task) throw new Error('Task not found.');
    const ts = now().getTime();
    const td = today();
    let next: Task = { ...task, lifecycle: 'active', archivedAt: null, updatedAt: ts };
    if (next.progress < 100) {
      const prev = next.scheduledDate;
      if (prev < td) next = { ...next, scheduledDate: td, carryCount: next.carryCount + 1 };
      await ensureOnDay(t, next, next.scheduledDate, prev < td ? prev : null);
    }
    await t.put('tasks', next);
    return next;
  });
}

export async function deleteTask(id: string): Promise<void> {
  await withTx(['tasks', 'entries', 'subtasks', 'reviews', 'events'], 'readwrite', async (t) => {
    for (const s of ['entries', 'subtasks', 'reviews', 'events'] as const) {
      const rows = await t.getAllByIndex<{ id: string }>(s, 'taskId', id);
      for (const r of rows) await t.delete(s, r.id);
    }
    await t.delete('tasks', id);
  });
}

/* ------------------------------------------------------------------ */
/* Subtasks                                                            */
/* ------------------------------------------------------------------ */

export interface SubtaskInput {
  title: string;
  description?: string;
  dueDate?: ISODate | null;
  priority?: Priority;
}

async function insertSubtasks(t: Tx, taskId: string, inputs: SubtaskInput[], sourceReviewId: string | null): Promise<Subtask[]> {
  const existing = await t.getAllByIndex<Subtask>('subtasks', 'taskId', taskId);
  let order = existing.reduce((m, s) => Math.max(m, s.order), -1) + 1;
  const ts = now().getTime();
  const out: Subtask[] = [];
  for (const i of inputs) {
    const title = i.title.trim();
    if (!title) continue;
    const s: Subtask = {
      id: uid(),
      taskId,
      title,
      description: i.description?.trim() ?? '',
      done: false,
      dueDate: i.dueDate ?? null,
      priority: i.priority ?? 'medium',
      order: order++,
      createdAt: ts,
      createdOn: today(),
      completedAt: null,
      completedOn: null,
      sourceReviewId,
    };
    await t.put('subtasks', s);
    out.push(s);
  }
  return out;
}

export async function addSubtasks(taskId: string, inputs: SubtaskInput[]): Promise<Subtask[]> {
  return withTx(['subtasks', 'tasks'], 'readwrite', async (t) => {
    if (!(await t.get<Task>('tasks', taskId))) throw new Error('Task not found.');
    return insertSubtasks(t, taskId, inputs, null);
  });
}

export async function updateSubtask(id: string, patch: Partial<Pick<Subtask, 'title' | 'description' | 'dueDate' | 'priority'>>): Promise<void> {
  await withTx('subtasks', 'readwrite', async (t) => {
    const s = await t.get<Subtask>('subtasks', id);
    if (!s) throw new Error('Subtask not found.');
    const next = { ...s, ...patch };
    if (!next.title.trim()) throw new Error('A subtask needs a title.');
    next.title = next.title.trim();
    await t.put('subtasks', next);
  });
}

export async function toggleSubtask(id: string, done?: boolean): Promise<Subtask> {
  return withTx('subtasks', 'readwrite', async (t) => {
    const s = await t.get<Subtask>('subtasks', id);
    if (!s) throw new Error('Subtask not found.');
    const d = done ?? !s.done;
    const next: Subtask = { ...s, done: d, completedAt: d ? now().getTime() : null, completedOn: d ? today() : null };
    await t.put('subtasks', next);
    return next;
  });
}

export async function deleteSubtask(id: string): Promise<void> {
  await withTx('subtasks', 'readwrite', (t) => t.delete('subtasks', id));
}

export async function moveSubtask(id: string, dir: -1 | 1): Promise<void> {
  await withTx('subtasks', 'readwrite', async (t) => {
    const s = await t.get<Subtask>('subtasks', id);
    if (!s) return;
    const list = (await t.getAllByIndex<Subtask>('subtasks', 'taskId', s.taskId)).sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if (list[k].order !== k) await t.put('subtasks', { ...list[k], order: k });
  });
}

/* ------------------------------------------------------------------ */
/* Evening review                                                      */
/* ------------------------------------------------------------------ */

export interface ReviewInput {
  outcome: ReviewOutcome;
  progress?: number;
  remaining?: string;
  reasons?: string[];
  reasonNote?: string;
  nextAction?: string;
  newSubtasks?: SubtaskInput[];
}

export async function saveReview(date: ISODate, taskId: string, input: ReviewInput): Promise<Review> {
  return withTx(['tasks', 'entries', 'events', 'subtasks', 'reviews'], 'readwrite', async (t) => {
    const task = await t.get<Task>('tasks', taskId);
    if (!task) throw new Error('Task not found.');
    const id = entryId(date, taskId);
    const prev = await t.get<Review>('reviews', id);
    const ts = now().getTime();
    const td = today();

    let progress = task.progress;
    if (input.outcome === 'completed') progress = 100;
    else if (input.outcome === 'partial') progress = clamp(input.progress ?? task.progress);

    if (input.outcome !== 'skipped') {
      if (date === task.scheduledDate || date === td) {
        await applyProgress(t, task, progress, 'review');
      } else {
        // Reviewing an earlier day after the fact: record that day's result without
        // lowering progress the task has made since.
        const e = await t.get<DayEntry>('entries', id);
        if (e) await t.put('entries', { ...e, endProgress: progress, updatedAt: ts });
        if (progress > task.progress) await applyProgress(t, task, progress, 'review');
      }
    }

    const created = input.newSubtasks?.length ? await insertSubtasks(t, taskId, input.newSubtasks, id) : [];
    const review: Review = {
      id,
      date,
      taskId,
      outcome: input.outcome,
      progress: input.outcome === 'skipped' ? task.progress : progress,
      remaining: input.remaining?.trim() ?? '',
      reasons: input.reasons ?? [],
      reasonNote: input.reasonNote?.trim() ?? '',
      nextAction: input.nextAction?.trim() ?? '',
      createdSubtaskIds: [...(prev?.createdSubtaskIds ?? []), ...created.map((s) => s.id)],
      createdAt: prev?.createdAt ?? ts,
      updatedAt: ts,
    };
    await t.put('reviews', review);
    return review;
  });
}

export async function markDayReviewed(date: ISODate): Promise<void> {
  await withTx('days', 'readwrite', async (t) => {
    const d = (await t.get<DayRecord>('days', date)) ?? { id: date, date, closedAt: null, reviewCompletedAt: null };
    await t.put('days', { ...d, reviewCompletedAt: now().getTime() });
  });
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

export type JournalFields = Pick<JournalEntry, 'accomplished' | 'notAccomplished' | 'obstacles' | 'learned' | 'differently' | 'grateful' | 'freeform'>;

export async function saveJournal(date: ISODate, fields: Partial<JournalFields>): Promise<JournalEntry> {
  return withTx('journal', 'readwrite', async (t) => {
    const prev = await t.get<JournalEntry>('journal', date);
    const ts = now().getTime();
    const entry: JournalEntry = {
      id: date,
      date,
      accomplished: '',
      notAccomplished: '',
      obstacles: '',
      learned: '',
      differently: '',
      grateful: '',
      freeform: '',
      createdAt: ts,
      ...prev,
      ...fields,
      updatedAt: ts,
    };
    await t.put('journal', entry);
    return entry;
  });
}

export async function deleteJournal(date: ISODate): Promise<void> {
  await withTx('journal', 'readwrite', (t) => t.delete('journal', date));
}

/* ------------------------------------------------------------------ */
/* Daily carry-forward (rollover)                                      */
/* ------------------------------------------------------------------ */

export interface RolloverResult {
  carried: number;
  closedDays: number;
}

/**
 * Runs at app start, when the app returns to the foreground and at local midnight.
 * Idempotent and atomic:
 *  1. Every open day before today is closed, freezing a snapshot of each task's subtasks.
 *  2. Each active, unfinished task planned before today is moved to today. Its daily entry
 *     for today uses a deterministic key, so it can never be duplicated; its previous days'
 *     entries (and their progress) are left exactly as they were.
 */
export async function rollover(td: ISODate = today()): Promise<RolloverResult> {
  return withTx(['tasks', 'entries', 'subtasks', 'days'], 'readwrite', async (t) => {
    const ts = now().getTime();
    const [tasks, entries, subtasks] = await Promise.all([
      t.getAll<Task>('tasks'),
      t.getAll<DayEntry>('entries'),
      t.getAll<Subtask>('subtasks'),
    ]);
    const subsByTask = new Map<string, Subtask[]>();
    for (const s of subtasks) {
      const l = subsByTask.get(s.taskId) ?? [];
      l.push(s);
      subsByTask.set(s.taskId, l);
    }

    const closedDates = new Set<string>();
    for (const e of entries) {
      if (e.date < td && !e.closed) {
        const subs = (subsByTask.get(e.taskId) ?? [])
          .filter((s) => s.createdOn <= e.date)
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ id: s.id, title: s.title, done: s.done && !!s.completedOn && s.completedOn <= e.date }));
        await t.put('entries', { ...e, closed: true, subtasksAtClose: subs, updatedAt: ts });
        closedDates.add(e.date);
      }
    }
    for (const d of closedDates) {
      const rec = (await t.get<DayRecord>('days', d)) ?? { id: d, date: d, closedAt: null, reviewCompletedAt: null };
      if (!rec.closedAt) await t.put('days', { ...rec, closedAt: ts });
    }

    let carried = 0;
    for (const task of tasks) {
      if (task.lifecycle !== 'active' || task.progress >= 100 || task.scheduledDate >= td) continue;
      const from = task.scheduledDate;
      const moved: Task = { ...task, scheduledDate: td, carryCount: task.carryCount + 1, updatedAt: ts };
      await t.putIfAbsent('entries', newEntry(moved, td, from));
      await t.put('tasks', moved);
      carried++;
    }
    return { carried, closedDays: closedDates.size };
  });
}

/* ------------------------------------------------------------------ */
/* Backup / restore                                                    */
/* ------------------------------------------------------------------ */

export const BACKUP_APP = 'daymark';
export const BACKUP_SCHEMA = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  schema: number;
  exportedAt: string;
  appVersion: string;
  settings: Settings;
  data: AppData;
}

export async function exportBackup(appVersion: string, includeApiKey = false): Promise<Backup> {
  const [data, settings] = await Promise.all([loadAll(), getSettings()]);
  return {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: now().toISOString(),
    appVersion,
    settings: includeApiKey ? settings : { ...settings, aiApiKey: '' },
    data,
  };
}

const ARRAY_KEYS: (keyof AppData)[] = ['tasks', 'entries', 'subtasks', 'reviews', 'events', 'journal', 'days'];

export function validateBackup(raw: unknown): Backup {
  if (!raw || typeof raw !== 'object') throw new Error('This file is not a DAYMARK backup.');
  const b = raw as Partial<Backup>;
  if (b.app !== BACKUP_APP) throw new Error('This file is not a DAYMARK backup.');
  if (typeof b.schema !== 'number' || b.schema > BACKUP_SCHEMA) throw new Error('This backup was made by a newer version of DAYMARK. Update the app first.');
  if (!b.data || typeof b.data !== 'object') throw new Error('The backup has no data section.');
  for (const k of ARRAY_KEYS) {
    const arr = (b.data as unknown as Record<string, unknown>)[k];
    if (arr === undefined) (b.data as unknown as Record<string, unknown>)[k] = [];
    else if (!Array.isArray(arr)) throw new Error(`The backup's "${k}" section is invalid.`);
  }
  const d = b.data as AppData;
  for (const task of d.tasks) {
    if (typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.progress !== 'number' || typeof task.scheduledDate !== 'string') {
      throw new Error('The backup contains an invalid task record.');
    }
  }
  for (const k of ARRAY_KEYS) {
    for (const r of d[k] as { id?: unknown }[]) if (typeof r?.id !== 'string') throw new Error(`The backup contains an invalid ${k} record.`);
  }
  return b as Backup;
}

/** Replace ALL local data with the backup's contents, atomically. */
export async function importBackup(raw: unknown): Promise<{ tasks: number }> {
  const b = validateBackup(raw);
  await withTx([...STORES], 'readwrite', async (t) => {
    const prevSettings = await t.get<{ key: string; value: Settings }>('meta', 'settings');
    for (const s of STORES) await t.clear(s);
    for (const k of ARRAY_KEYS) for (const r of b.data[k]) await t.put(k, r);
    const keepKey = prevSettings?.value?.aiApiKey ?? '';
    await t.put('meta', { key: 'settings', value: { ...DEFAULT_SETTINGS, ...b.settings, aiApiKey: b.settings?.aiApiKey || keepKey } });
  });
  return { tasks: b.data.tasks.length };
}

export async function resetAll(): Promise<void> {
  await withTx([...STORES], 'readwrite', async (t) => {
    for (const s of STORES) await t.clear(s);
  });
}

export const tomorrowOf = (d: ISODate) => addDays(d, 1);
