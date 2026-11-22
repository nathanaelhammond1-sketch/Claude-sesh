import { minutesOfDay, toISODate } from './dates';
import type { AppData, ISODate, Settings } from './types';

export type ReminderKind = 'review' | 'morning' | 'overdue' | 'subtasks';

export interface DueReminder {
  kind: ReminderKind;
  title: string;
  body: string;
  route: string;
  /** Minutes after the scheduled time. */
  lateBy: number;
}

/** A system notification is only sent if the app is running within this window of the scheduled time. */
export const NOTIFY_WINDOW_MIN = 15;

export type ReminderLog = Partial<Record<ReminderKind, ISODate>>;

/**
 * Which reminders are due right now and haven't been handled today.
 * Pure function — the caller decides whether to show a system notification
 * (only if on time and permitted) or an in-app banner.
 */
export function dueReminders(settings: Settings, data: AppData, now: Date, log: ReminderLog): DueReminder[] {
  const day = now.getDay();
  const date = toISODate(now);
  const mins = now.getHours() * 60 + now.getMinutes();
  const out: DueReminder[] = [];
  const add = (kind: ReminderKind, time: string, title: string, body: string, route: string) => {
    if (log[kind] === date) return;
    const t = minutesOfDay(time);
    if (mins < t) return;
    out.push({ kind, title, body, route, lateBy: mins - t });
  };

  const todays = data.entries.filter((e) => e.date === date && !e.rescheduledTo && !e.droppedAs);
  if (settings.reviewDays.includes(day) && todays.length) {
    add('review', settings.reviewTime, 'DAYMARK', 'DAYMARK: Time to review your day. How much did you actually accomplish?', '#/review');
  }
  if (settings.morningEnabled && settings.reviewDays.includes(day)) {
    add('morning', settings.morningTime, 'DAYMARK', todays.length ? `Good morning. You have ${todays.length} task${todays.length === 1 ? '' : 's'} planned. Set your intentions.` : 'Good morning. What will make today count? Set your intentions.', '#/today');
  }
  const active = new Map(data.tasks.filter((t) => t.lifecycle === 'active').map((t) => [t.id, t]));
  if (settings.overdueEnabled) {
    const overdue = [...active.values()].filter((t) => t.progress < 100 && t.dueDate && t.dueDate < date);
    if (overdue.length) add('overdue', settings.morningTime, 'DAYMARK · Overdue', `${overdue.length} task${overdue.length === 1 ? ' is' : 's are'} past due: ${overdue.slice(0, 3).map((t) => t.title).join(', ')}`, '#/tasks?f=overdue');
  }
  if (settings.subtaskEnabled) {
    const due = data.subtasks.filter((s) => !s.done && active.has(s.taskId) && s.dueDate && s.dueDate <= date);
    if (due.length) add('subtasks', settings.morningTime, 'DAYMARK · Subtasks', `${due.length} subtask${due.length === 1 ? '' : 's'} due: ${due.slice(0, 3).map((s) => s.title).join(', ')}`, '#/today');
  }
  return out;
}

export interface NotificationSupport {
  api: boolean;
  permission: NotificationPermission | 'unsupported';
  standalone: boolean;
  ios: boolean;
  serviceWorker: boolean;
  /** Plain-language status for the Settings screen. */
  message: string;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function notificationSupport(): NotificationSupport {
  const api = typeof window !== 'undefined' && 'Notification' in window;
  const standalone = isStandalone();
  const ios = isIOS();
  const serviceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const permission = api ? Notification.permission : 'unsupported';
  let message: string;
  if (!api) {
    message = ios && !standalone
      ? 'On iPhone, notifications are only available after you add DAYMARK to your Home Screen (iOS 16.4 or later) and open it from there.'
      : 'This browser does not support web notifications.';
  } else if (permission === 'denied') {
    message = ios ? 'Notifications are blocked. Enable them in iPhone Settings → Notifications → DAYMARK.' : 'Notifications are blocked for this site in your browser settings.';
  } else if (permission === 'granted') {
    message = 'Notifications are allowed. DAYMARK can alert you while the app is open or running in the background — iOS does not let web apps schedule alerts while fully closed.';
  } else {
    message = 'Notifications have not been enabled yet.';
  }
  return { api, permission, standalone, ios, serviceWorker, message };
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Shows a REAL system notification. Returns false (and shows nothing) if not permitted/supported. */
export async function showSystemNotification(title: string, body: string, route = '#/today', tag?: string): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { route } });
        return true;
      }
    }
    new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
    return true;
  } catch {
    return false;
  }
}
