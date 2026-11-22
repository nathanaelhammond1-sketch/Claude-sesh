/**
 * DAYMARK data model.
 *
 * The model deliberately separates:
 *  - Task          : the master task (one identity for its whole life).
 *  - DayEntry      : a daily instance of a task on a specific date (key `${date}|${taskId}`).
 *                    Deterministic keys make rollover idempotent: a task can never appear
 *                    twice on the same day.
 *  - Subtask       : actionable pieces of remaining work attached to a master task.
 *  - Review        : the evening accountability review of one task on one date.
 *  - ProgressEvent : append-only log of every completion-percentage change.
 *  - JournalEntry  : one reflection per date.
 *  - DayRecord     : per-day bookkeeping (closed snapshot, review completion).
 */

export type ISODate = string; // 'YYYY-MM-DD' in the user's LOCAL calendar
export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'not_started' | 'in_progress' | 'completed';
export type Lifecycle = 'active' | 'archived' | 'abandoned';

export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: Priority;
  /** The day this task is currently planned for. Moves forward on carry-over. */
  scheduledDate: ISODate;
  /** The first day this task was planned for. Never changes. */
  originDate: ISODate;
  /** Optional deadline. */
  dueDate: ISODate | null;
  estimatedMinutes: number | null;
  notes: string;
  progress: number; // 0..100
  lifecycle: Lifecycle;
  carryCount: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  archivedAt: number | null;
}

export interface SubtaskSnapshot {
  id: string;
  title: string;
  done: boolean;
}

export interface DayEntry {
  id: string; // `${date}|${taskId}`
  date: ISODate;
  taskId: string;
  /** Title/category/priority at the time — history stays readable even if the task is edited/deleted later. */
  titleSnapshot: string;
  categorySnapshot: string;
  prioritySnapshot: Priority;
  startProgress: number;
  endProgress: number;
  /** Date this entry was carried from (null if originally planned for this day). */
  carriedFrom: ISODate | null;
  /** If the task was moved off this day by the user. Excluded from that day's metrics. */
  rescheduledTo: ISODate | null;
  /** If the task was archived/abandoned while planned for this (still open) day. Excluded from that day's metrics. */
  droppedAs: 'archived' | 'abandoned' | null;
  /** Set when the day closes (at rollover): frozen list of the task's subtasks. */
  subtasksAtClose: SubtaskSnapshot[] | null;
  closed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  description: string;
  done: boolean;
  dueDate: ISODate | null;
  priority: Priority;
  order: number;
  createdAt: number;
  createdOn: ISODate;
  completedAt: number | null;
  completedOn: ISODate | null;
  /** Review that produced this subtask, if any. */
  sourceReviewId: string | null;
}

export type ReviewOutcome = 'completed' | 'partial' | 'not_started' | 'skipped';

export interface Review {
  id: string; // `${date}|${taskId}`
  date: ISODate;
  taskId: string;
  outcome: ReviewOutcome;
  progress: number;
  remaining: string;
  reasons: string[];
  reasonNote: string;
  nextAction: string;
  createdSubtaskIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type ProgressSource = 'slider' | 'quick' | 'review' | 'complete' | 'create' | 'reopen';

export interface ProgressEvent {
  id: string;
  taskId: string;
  date: ISODate;
  from: number;
  to: number;
  at: number;
  source: ProgressSource;
}

export interface JournalEntry {
  id: ISODate; // one per date
  date: ISODate;
  accomplished: string;
  notAccomplished: string;
  obstacles: string;
  learned: string;
  differently: string;
  grateful: string;
  freeform: string;
  createdAt: number;
  updatedAt: number;
}

export interface DayRecord {
  id: ISODate;
  date: ISODate;
  closedAt: number | null;
  reviewCompletedAt: number | null;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  name: string;
  theme: ThemePref;
  reviewTime: string; // 'HH:MM'
  reviewDays: number[]; // 0=Sun..6=Sat
  morningEnabled: boolean;
  morningTime: string;
  overdueEnabled: boolean;
  subtaskEnabled: boolean;
  notificationsEnabled: boolean;
  aiEnabled: boolean;
  aiApiKey: string;
  aiConsentAt: number | null;
  categories: string[];
  lastBackupAt: number | null;
  onboarded: boolean;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface AppData {
  tasks: Task[];
  entries: DayEntry[];
  subtasks: Subtask[];
  reviews: Review[];
  events: ProgressEvent[];
  journal: JournalEntry[];
  days: DayRecord[];
}

export const DEFAULT_CATEGORIES = ['Work', 'Personal', 'Health', 'Learning', 'Home', 'Finance', 'Creative'];

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  theme: 'system',
  reviewTime: '20:30',
  reviewDays: [0, 1, 2, 3, 4, 5, 6],
  morningEnabled: false,
  morningTime: '08:00',
  overdueEnabled: true,
  subtaskEnabled: true,
  notificationsEnabled: false,
  aiEnabled: false,
  aiApiKey: '',
  aiConsentAt: null,
  categories: DEFAULT_CATEGORIES,
  lastBackupAt: null,
  onboarded: false,
};

export const REASONS = [
  'Ran out of time',
  'Underestimated the work',
  'Interrupted / distracted',
  'Low energy',
  'Waiting on someone',
  'Unclear next step',
  'Priorities changed',
  'Avoided it',
] as const;

export function statusOf(progress: number): TaskStatus {
  if (progress >= 100) return 'completed';
  if (progress <= 0) return 'not_started';
  return 'in_progress';
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High' };
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
