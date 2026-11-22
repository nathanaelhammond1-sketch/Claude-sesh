import { addDays, lastNDays, WEEKDAYS_LONG, weekdayOf } from './dates';
import type { AppData, DayEntry, ISODate, Review, Task } from './types';

/** An entry counts toward a day's plan unless it was moved to another day or dropped. */
export const countsForDay = (e: DayEntry) => !e.rescheduledTo && !e.droppedAs;

export interface DayMetrics {
  date: ISODate;
  planned: number;
  completed: number;
  partial: number;
  notStarted: number;
  carriedIn: number;
  /** Average end-of-day completion of the day's tasks (0–100). null when nothing was planned. */
  completion: number | null;
  /** Total percentage points of progress made that day. */
  gained: number;
}

export function entriesByDate(data: AppData): Map<ISODate, DayEntry[]> {
  const m = new Map<ISODate, DayEntry[]>();
  for (const e of data.entries) {
    if (!countsForDay(e)) continue;
    const l = m.get(e.date) ?? [];
    l.push(e);
    m.set(e.date, l);
  }
  return m;
}

export function dayMetrics(date: ISODate, entries: DayEntry[] = []): DayMetrics {
  const planned = entries.length;
  let completed = 0,
    partial = 0,
    notStarted = 0,
    carriedIn = 0,
    sum = 0,
    gained = 0;
  for (const e of entries) {
    if (e.endProgress >= 100) completed++;
    else if (e.endProgress > 0) partial++;
    else notStarted++;
    if (e.carriedFrom) carriedIn++;
    sum += e.endProgress;
    gained += Math.max(0, e.endProgress - e.startProgress);
  }
  return { date, planned, completed, partial, notStarted, carriedIn, completion: planned ? Math.round(sum / planned) : null, gained };
}

export interface RangeSummary {
  days: DayMetrics[];
  activeDays: number;
  completion: number | null;
  completed: number;
  partial: number;
  notStarted: number;
  carried: number;
  planned: number;
  avgGained: number;
  best: DayMetrics | null;
}

export function rangeSummary(data: AppData, end: ISODate, n: number, byDate = entriesByDate(data)): RangeSummary {
  const days = lastNDays(n, end).map((d) => dayMetrics(d, byDate.get(d)));
  const active = days.filter((d) => d.planned > 0);
  const sum = (f: (d: DayMetrics) => number) => active.reduce((a, d) => a + f(d), 0);
  let best: DayMetrics | null = null;
  for (const d of active) {
    if (!best || (d.completion ?? 0) > (best.completion ?? 0) || ((d.completion ?? 0) === (best.completion ?? 0) && d.completed > best.completed)) best = d;
  }
  return {
    days,
    activeDays: active.length,
    completion: active.length ? Math.round(sum((d) => d.completion ?? 0) / active.length) : null,
    completed: sum((d) => d.completed),
    partial: sum((d) => d.partial),
    notStarted: sum((d) => d.notStarted),
    carried: sum((d) => d.carriedIn),
    planned: sum((d) => d.planned),
    avgGained: active.length ? Math.round(sum((d) => d.gained) / active.length) : 0,
    best,
  };
}

export interface WeekPoint {
  start: ISODate;
  end: ISODate;
  completion: number | null;
  completed: number;
  planned: number;
}

/** Consecutive 7-day windows ending today (most recent last). */
export function weeklyTrend(data: AppData, end: ISODate, weeks = 8, byDate = entriesByDate(data)): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const we = addDays(end, -7 * w);
    const s = rangeSummary(data, we, 7, byDate);
    out.push({ start: addDays(we, -6), end: we, completion: s.completion, completed: s.completed, planned: s.planned });
  }
  return out;
}

export interface WeekdayStat {
  weekday: number;
  completion: number | null;
  days: number;
}

export function weekdayPattern(data: AppData, end: ISODate, n = 30, byDate = entriesByDate(data)): WeekdayStat[] {
  const acc = Array.from({ length: 7 }, (_, i) => ({ weekday: i, sum: 0, days: 0 }));
  for (const d of lastNDays(n, end)) {
    const m = dayMetrics(d, byDate.get(d));
    if (!m.planned) continue;
    const a = acc[weekdayOf(d)];
    a.sum += m.completion ?? 0;
    a.days++;
  }
  return acc.map((a) => ({ weekday: a.weekday, days: a.days, completion: a.days ? Math.round(a.sum / a.days) : null }));
}

export interface CategoryStat {
  category: string;
  planned: number;
  completed: number;
  completion: number;
}

export function categoryBreakdown(data: AppData, end: ISODate, n = 30, byDate = entriesByDate(data)): CategoryStat[] {
  const m = new Map<string, { planned: number; completed: number; sum: number }>();
  for (const d of lastNDays(n, end)) {
    for (const e of byDate.get(d) ?? []) {
      const c = m.get(e.categorySnapshot) ?? { planned: 0, completed: 0, sum: 0 };
      c.planned++;
      c.sum += e.endProgress;
      if (e.endProgress >= 100) c.completed++;
      m.set(e.categorySnapshot, c);
    }
  }
  return [...m.entries()]
    .map(([category, c]) => ({ category, planned: c.planned, completed: c.completed, completion: Math.round(c.sum / c.planned) }))
    .sort((a, b) => b.planned - a.planned);
}

export interface ChronicTask {
  task: Task;
  daysUnfinished: number;
  daysPlanned: number;
}

/** Tasks that have been left unfinished on at least 2 days in the window. */
export function chronicallyUnfinished(data: AppData, end: ISODate, n = 30): ChronicTask[] {
  const start = addDays(end, -(n - 1));
  const byTask = new Map<string, { unfinished: number; planned: number }>();
  for (const e of data.entries) {
    if (e.date < start || e.date > end || !countsForDay(e)) continue;
    const c = byTask.get(e.taskId) ?? { unfinished: 0, planned: 0 };
    c.planned++;
    // Today isn't over yet, so it doesn't count as "left unfinished".
    if (e.endProgress < 100 && e.date < end) c.unfinished++;
    byTask.set(e.taskId, c);
  }
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const out: ChronicTask[] = [];
  for (const [id, c] of byTask) {
    const task = tasks.get(id);
    if (task && c.unfinished >= 2) out.push({ task, daysUnfinished: c.unfinished, daysPlanned: c.planned });
  }
  return out.sort((a, b) => b.daysUnfinished - a.daysUnfinished).slice(0, 6);
}

export function obstacleCounts(reviews: Review[], end: ISODate, n = 30): { reason: string; count: number }[] {
  const start = addDays(end, -(n - 1));
  const m = new Map<string, number>();
  for (const r of reviews) {
    if (r.date < start || r.date > end || r.outcome === 'completed' || r.outcome === 'skipped') continue;
    for (const reason of r.reasons) m.set(reason, (m.get(reason) ?? 0) + 1);
  }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

/** Human-readable observations. Encouraging, specific, never guilt-driven. */
export function insights(data: AppData, end: ISODate): string[] {
  const byDate = entriesByDate(data);
  const out: string[] = [];
  const week = rangeSummary(data, end, 7, byDate);
  const prev = rangeSummary(data, addDays(end, -7), 7, byDate);
  const month = rangeSummary(data, end, 30, byDate);

  if (month.activeDays < 3) {
    out.push('Insights get sharper after a few days of planning and evening reviews. Keep going — every honest review adds signal.');
  }
  if (week.completion !== null && prev.completion !== null) {
    const d = week.completion - prev.completion;
    if (d >= 5) out.push(`Your completion is up ${d} points on the previous 7 days. Whatever you changed is working.`);
    else if (d <= -5) out.push(`Completion dipped ${-d} points versus the previous week. A lighter plan for a few days can rebuild momentum.`);
    else out.push(`You're holding steady at about ${week.completion}% completion week over week.`);
  }

  const pattern = weekdayPattern(data, end, 30, byDate).filter((w) => w.days >= 2 && w.completion !== null);
  if (pattern.length >= 3) {
    const sorted = [...pattern].sort((a, b) => (b.completion ?? 0) - (a.completion ?? 0));
    const hi = sorted[0],
      lo = sorted[sorted.length - 1];
    if ((hi.completion ?? 0) - (lo.completion ?? 0) >= 15) {
      out.push(`${WEEKDAYS_LONG[hi.weekday]}s are your strongest day (${hi.completion}%); ${WEEKDAYS_LONG[lo.weekday]}s are hardest (${lo.completion}%). Consider scheduling demanding work earlier in your strong days.`);
    }
  }

  // Plan size vs completion.
  const active = month.days.filter((d) => d.planned > 0);
  if (active.length >= 6) {
    const sizes = active.map((d) => d.planned).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)];
    const small = active.filter((d) => d.planned <= median);
    const big = active.filter((d) => d.planned > median);
    if (small.length >= 2 && big.length >= 2) {
      const avg = (l: DayMetrics[]) => Math.round(l.reduce((a, d) => a + (d.completion ?? 0), 0) / l.length);
      const a = avg(small),
        b = avg(big);
      if (a - b >= 10) out.push(`On days with ${median} or fewer tasks you average ${a}%, versus ${b}% on heavier days. Fewer, clearer intentions may serve you better.`);
    }
  }

  const obstacles = obstacleCounts(data.reviews, end, 30);
  if (obstacles.length && obstacles[0].count >= 2) {
    const tip: Record<string, string> = {
      'Ran out of time': 'Try estimating durations and planning one less task.',
      'Underestimated the work': 'Breaking big tasks into subtasks up front makes estimates more honest.',
      'Interrupted / distracted': 'Protect one focused block each day for your top priority.',
      'Low energy': 'Put demanding tasks where your energy peaks.',
      'Waiting on someone': 'Send the follow-up first thing so the wait starts sooner.',
      'Unclear next step': 'End each review by writing the very next physical action.',
      'Priorities changed': 'Re-plan in the morning so the list matches reality.',
      'Avoided it': 'Shrink the first step until it feels easy to start.',
    };
    out.push(`Most common obstacle: "${obstacles[0].reason}" (${obstacles[0].count}×). ${tip[obstacles[0].reason] ?? ''}`.trim());
  }

  const chronic = chronicallyUnfinished(data, end, 30);
  if (chronic.length) {
    const c = chronic[0];
    out.push(`"${c.task.title}" has been left unfinished on ${c.daysUnfinished} days. It may need to be broken down, rescheduled, or let go.`);
  }
  if (week.carried > 0 && week.planned > 0) {
    const pct = Math.round((week.carried / week.planned) * 100);
    if (pct >= 40) out.push(`${pct}% of this week's planned tasks were carried in from earlier days. Finishing carried work before adding new tasks keeps the list honest.`);
  }
  return out;
}

/** Streak of consecutive days (ending today or yesterday) with an evening review recorded. */
export function reviewStreak(data: AppData, end: ISODate): number {
  const reviewed = new Set(data.reviews.filter((r) => r.outcome !== 'skipped').map((r) => r.date));
  for (const d of data.days) if (d.reviewCompletedAt) reviewed.add(d.date);
  let streak = 0;
  let d = reviewed.has(end) ? end : addDays(end, -1);
  while (reviewed.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}
