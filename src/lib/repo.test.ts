import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClockForTests } from './clock';
import { closeDB } from './db';
import * as repo from './repo';
import { dayMetrics, entriesByDate, insights, rangeSummary, chronicallyUnfinished, obstacleCounts } from './analytics';
import { parseRemainingWork } from './subtaskParse';
import { buildIcs } from './ics';
import { dueReminders } from './reminders';
import { DEFAULT_SETTINGS } from './types';
import { addDays, nextOccurrence } from './dates';

let current = new Date(2026, 10, 16, 9, 0, 0); // Mon 16 Nov 2026, 09:00 local
const setNow = (d: Date) => {
  current = d;
};
const day = (iso: string, h = 9, m = 0) => {
  const [y, mo, dd] = iso.split('-').map(Number);
  return new Date(y, mo - 1, dd, h, m, 0);
};

beforeEach(async () => {
  await closeDB();
  // fresh, empty database for every test
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  setNow(day('2026-11-16'));
  setClockForTests(() => current);
});
afterEach(() => setClockForTests(null));

describe('tasks and progress', () => {
  it('creates a task with a daily entry and tracks status from percentage', async () => {
    const t = await repo.createTask({ title: 'Complete business proposal', priority: 'high', category: 'Work' });
    let data = await repo.loadAll();
    expect(data.tasks).toHaveLength(1);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe(`2026-11-16|${t.id}`);

    await repo.setProgress(t.id, 40);
    await repo.setProgress(t.id, 70);
    data = await repo.loadAll();
    expect(data.tasks[0].progress).toBe(70);
    expect(data.tasks[0].completedAt).toBeNull();
    expect(data.events.map((e) => [e.from, e.to])).toEqual(
      expect.arrayContaining([
        [0, 40],
        [40, 70],
      ]),
    );
    expect(data.entries[0].endProgress).toBe(70);

    await repo.setProgress(t.id, 100);
    data = await repo.loadAll();
    expect(data.tasks[0].completedAt).not.toBeNull();
  });

  it('rejects empty titles and clamps percentages', async () => {
    await expect(repo.createTask({ title: '   ' })).rejects.toThrow();
    const t = await repo.createTask({ title: 'x' });
    expect((await repo.setProgress(t.id, 150)).progress).toBe(100);
    expect((await repo.setProgress(t.id, -5)).progress).toBe(0);
  });

  it('creates tasks for future dates without carrying them', async () => {
    const t = await repo.createTask({ title: 'Future', scheduledDate: '2026-11-20' });
    expect(t.scheduledDate).toBe('2026-11-20');
    await repo.rollover('2026-11-16');
    const data = await repo.loadAll();
    expect(data.tasks[0].scheduledDate).toBe('2026-11-20');
    expect(data.entries.map((e) => e.date)).toEqual(['2026-11-20']);
  });
});

describe('carry-forward', () => {
  it('carries unfinished tasks forward with identity, progress, subtasks and history intact — no duplicates', async () => {
    const t = await repo.createTask({ title: 'Complete business proposal', priority: 'high' });
    const done = await repo.createTask({ title: 'Email accountant' });
    await repo.setProgress(t.id, 70);
    await repo.completeTask(done.id);
    await repo.saveReview('2026-11-16', t.id, {
      outcome: 'partial',
      progress: 70,
      remaining: 'Finish financial projections\nReview executive summary',
      reasons: ['Ran out of time'],
      nextAction: 'Open the spreadsheet',
      newSubtasks: [{ title: 'Finish financial projections' }, { title: 'Review executive summary' }],
    });
    const subs = (await repo.loadAll()).subtasks;
    await repo.toggleSubtask(subs.find((s) => s.title === 'Review executive summary')!.id, true);

    // Next morning
    setNow(day('2026-11-17'));
    const r1 = await repo.rollover('2026-11-17');
    const r2 = await repo.rollover('2026-11-17'); // run again (e.g. app reopened)
    expect(r1.carried).toBe(1);
    expect(r2.carried).toBe(0);

    const data = await repo.loadAll();
    expect(data.tasks).toHaveLength(2); // same master tasks, no copies
    const task = data.tasks.find((x) => x.id === t.id)!;
    expect(task.scheduledDate).toBe('2026-11-17');
    expect(task.progress).toBe(70);
    expect(task.carryCount).toBe(1);
    expect(task.originDate).toBe('2026-11-16');

    const tEntries = data.entries.filter((e) => e.taskId === t.id).sort((a, b) => a.date.localeCompare(b.date));
    expect(tEntries.map((e) => e.date)).toEqual(['2026-11-16', '2026-11-17']);
    expect(tEntries[0].closed).toBe(true);
    expect(tEntries[0].endProgress).toBe(70);
    expect(tEntries[0].subtasksAtClose).toEqual([
      expect.objectContaining({ title: 'Finish financial projections', done: false }),
      expect.objectContaining({ title: 'Review executive summary', done: true }),
    ]);
    expect(tEntries[1].carriedFrom).toBe('2026-11-16');
    expect(tEntries[1].startProgress).toBe(70);

    // Completed task stays in history on its day and is not carried.
    const dEntries = data.entries.filter((e) => e.taskId === done.id);
    expect(dEntries).toHaveLength(1);
    expect(dEntries[0].date).toBe('2026-11-16');
    expect(dEntries[0].endProgress).toBe(100);

    // Unchecked subtask still open on the master task.
    expect(data.subtasks.filter((s) => s.taskId === t.id && !s.done).map((s) => s.title)).toEqual(['Finish financial projections']);
    // Review history preserved.
    expect(data.reviews).toHaveLength(1);
    expect(data.reviews[0].reasons).toEqual(['Ran out of time']);

    // Progress on Tuesday never overwrites Monday's record.
    await repo.setProgress(t.id, 90);
    const after = await repo.loadAll();
    const mon = after.entries.find((e) => e.id === `2026-11-16|${t.id}`)!;
    const tue = after.entries.find((e) => e.id === `2026-11-17|${t.id}`)!;
    expect(mon.endProgress).toBe(70);
    expect(tue.endProgress).toBe(90);
  });

  it('handles gaps of several days and multiple rollovers without duplication', async () => {
    const t = await repo.createTask({ title: 'Write chapter' });
    setNow(day('2026-11-20'));
    await repo.rollover('2026-11-20');
    await repo.rollover('2026-11-20');
    setNow(day('2026-11-21'));
    await repo.rollover('2026-11-21');
    const data = await repo.loadAll();
    const ids = data.entries.filter((e) => e.taskId === t.id).map((e) => e.date).sort();
    expect(ids).toEqual(['2026-11-16', '2026-11-20', '2026-11-21']);
    expect(new Set(data.entries.map((e) => e.id)).size).toBe(data.entries.length);
    expect(data.tasks[0].carryCount).toBe(2);
  });

  it('does not carry archived or abandoned tasks, and restore brings them back', async () => {
    const a = await repo.createTask({ title: 'Archive me' });
    const b = await repo.createTask({ title: 'Abandon me' });
    await repo.archiveTask(a.id);
    await repo.abandonTask(b.id);
    let data = await repo.loadAll();
    expect(data.entries.every((e) => e.droppedAs)).toBe(true);
    setNow(day('2026-11-17'));
    expect((await repo.rollover('2026-11-17')).carried).toBe(0);
    await repo.restoreTask(a.id);
    data = await repo.loadAll();
    const ta = data.tasks.find((t) => t.id === a.id)!;
    expect(ta.lifecycle).toBe('active');
    expect(ta.scheduledDate).toBe('2026-11-17');
    expect(data.entries.filter((e) => e.taskId === a.id)).toHaveLength(2);
  });

  it('rescheduling moves the task without losing the record', async () => {
    const t = await repo.createTask({ title: 'Call bank' });
    await repo.rescheduleTask(t.id, '2026-11-19');
    const data = await repo.loadAll();
    const today = data.entries.find((e) => e.date === '2026-11-16')!;
    expect(today.rescheduledTo).toBe('2026-11-19');
    expect(data.entries.find((e) => e.date === '2026-11-19')).toBeTruthy();
    expect(dayMetrics('2026-11-16', entriesByDate(data).get('2026-11-16')).planned).toBe(0);
    await expect(repo.rescheduleTask(t.id, '2026-11-10')).rejects.toThrow();
  });

  it('reopening a task completed on a past day brings it back to today', async () => {
    const t = await repo.createTask({ title: 'Report' });
    await repo.setProgress(t.id, 100);
    setNow(day('2026-11-17'));
    await repo.rollover('2026-11-17');
    await repo.setProgress(t.id, 80);
    const data = await repo.loadAll();
    expect(data.tasks[0].scheduledDate).toBe('2026-11-17');
    const mon = data.entries.find((e) => e.date === '2026-11-16')!;
    expect(mon.endProgress).toBe(100); // history untouched
    expect(data.entries.find((e) => e.date === '2026-11-17')!.endProgress).toBe(80);
  });
});

describe('subtasks', () => {
  it('adds, edits, completes, reorders and deletes subtasks', async () => {
    const t = await repo.createTask({ title: 'Proposal' });
    const [a, b, c] = await repo.addSubtasks(t.id, [{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
    await repo.moveSubtask(c.id, -1);
    let subs = (await repo.loadAll()).subtasks.sort((x, y) => x.order - y.order);
    expect(subs.map((s) => s.title)).toEqual(['A', 'C', 'B']);
    await repo.updateSubtask(a.id, { title: 'A2', priority: 'high', dueDate: '2026-11-18' });
    await repo.toggleSubtask(b.id);
    await repo.deleteSubtask(c.id);
    subs = (await repo.loadAll()).subtasks.sort((x, y) => x.order - y.order);
    expect(subs.map((s) => [s.title, s.done])).toEqual([
      ['A2', false],
      ['B', true],
    ]);
    expect(subs[1].completedOn).toBe('2026-11-16');
  });
});

describe('reviews', () => {
  it('records completed / partial / not started / skipped outcomes', async () => {
    const a = await repo.createTask({ title: 'A' });
    const b = await repo.createTask({ title: 'B' });
    const c = await repo.createTask({ title: 'C' });
    const d = await repo.createTask({ title: 'D' });
    await repo.saveReview('2026-11-16', a.id, { outcome: 'completed' });
    await repo.saveReview('2026-11-16', b.id, { outcome: 'partial', progress: 45, remaining: 'x', reasons: ['Low energy'] });
    await repo.saveReview('2026-11-16', c.id, { outcome: 'not_started', reasons: ['Avoided it'], reasonNote: 'dreading it' });
    await repo.saveReview('2026-11-16', d.id, { outcome: 'skipped' });
    await repo.markDayReviewed('2026-11-16');
    const data = await repo.loadAll();
    const p = (id: string) => data.tasks.find((t) => t.id === id)!.progress;
    expect([p(a.id), p(b.id), p(c.id), p(d.id)]).toEqual([100, 45, 0, 0]);
    expect(data.reviews).toHaveLength(4);
    expect(data.days[0].reviewCompletedAt).not.toBeNull();
    // re-reviewing the same task/day updates, never duplicates
    await repo.saveReview('2026-11-16', d.id, { outcome: 'partial', progress: 20, newSubtasks: [{ title: 'Next bit' }] });
    const data2 = await repo.loadAll();
    expect(data2.reviews).toHaveLength(4);
    expect(data2.reviews.find((r) => r.taskId === d.id)!.createdSubtaskIds).toHaveLength(1);
  });
});

describe('analytics', () => {
  it('computes daily, weekly and pattern metrics correctly', async () => {
    // Monday: 5 tasks -> 100, 100, 40, 85, 0 => (325/5)=65%
    const ids: string[] = [];
    for (const n of ['a', 'b', 'c', 'd', 'e']) ids.push((await repo.createTask({ title: n, category: n === 'e' ? 'Health' : 'Work' })).id);
    await repo.setProgress(ids[0], 100);
    await repo.setProgress(ids[1], 100);
    await repo.setProgress(ids[2], 40);
    await repo.setProgress(ids[3], 85);
    let data = await repo.loadAll();
    const mon = dayMetrics('2026-11-16', entriesByDate(data).get('2026-11-16'));
    expect(mon).toMatchObject({ planned: 5, completed: 2, partial: 2, notStarted: 1, completion: 65, gained: 325 });

    // Tuesday: c, d, e carried. Finish c and d.
    setNow(day('2026-11-17'));
    await repo.rollover('2026-11-17');
    await repo.setProgress(ids[2], 100);
    await repo.setProgress(ids[3], 100);
    await repo.saveReview('2026-11-17', ids[4], { outcome: 'not_started', reasons: ['Low energy'] });
    data = await repo.loadAll();
    const tue = dayMetrics('2026-11-17', entriesByDate(data).get('2026-11-17'));
    expect(tue).toMatchObject({ planned: 3, completed: 2, notStarted: 1, carriedIn: 3, completion: 67, gained: 75 });

    const week = rangeSummary(data, '2026-11-17', 7);
    expect(week.activeDays).toBe(2);
    expect(week.completion).toBe(66); // (65 + 67) / 2
    expect(week.completed).toBe(4);
    expect(week.carried).toBe(3);
    expect(week.best?.date).toBe('2026-11-17');

    setNow(day('2026-11-18'));
    await repo.rollover('2026-11-18');
    data = await repo.loadAll();
    const chronic = chronicallyUnfinished(data, '2026-11-18');
    expect(chronic.map((c) => c.task.title)).toEqual(['e']);
    expect(obstacleCounts(data.reviews, '2026-11-18')).toEqual([{ reason: 'Low energy', count: 1 }]);
    expect(insights(data, '2026-11-18').length).toBeGreaterThan(0);
  });
});

describe('backup', () => {
  it('exports and restores all data exactly, and rejects invalid files', async () => {
    const t = await repo.createTask({ title: 'Keep me' });
    await repo.addSubtasks(t.id, [{ title: 'sub' }]);
    await repo.saveJournal('2026-11-16', { learned: 'Plan less' });
    await repo.saveSettings({ name: 'Sam', aiApiKey: 'secret' });
    const backup = JSON.parse(JSON.stringify(await repo.exportBackup('1.0.0')));
    expect(backup.settings.aiApiKey).toBe(''); // never exported by default
    await repo.resetAll();
    expect((await repo.loadAll()).tasks).toHaveLength(0);
    await repo.importBackup(backup);
    const data = await repo.loadAll();
    expect(data.tasks[0].title).toBe('Keep me');
    expect(data.subtasks).toHaveLength(1);
    expect(data.journal[0].learned).toBe('Plan less');
    expect((await repo.getSettings()).name).toBe('Sam');
    await expect(repo.importBackup({ app: 'other' })).rejects.toThrow();
    await expect(repo.importBackup({ app: 'daymark', schema: 1, data: { tasks: [{ nope: 1 }] } })).rejects.toThrow();
    // failed import leaves data untouched
    expect((await repo.loadAll()).tasks).toHaveLength(1);
  });

  it('deleting a task removes it and its records', async () => {
    const t = await repo.createTask({ title: 'Gone' });
    await repo.addSubtasks(t.id, [{ title: 's' }]);
    await repo.setProgress(t.id, 10);
    await repo.deleteTask(t.id);
    const d = await repo.loadAll();
    expect([d.tasks.length, d.entries.length, d.subtasks.length, d.events.length]).toEqual([0, 0, 0, 0]);
  });
});

describe('helpers', () => {
  it('parses remaining work into candidate subtasks', () => {
    expect(parseRemainingWork('- finish financial projections\n- review executive summary\n* add competitor analysis')).toEqual([
      'Finish financial projections',
      'Review executive summary',
      'Add competitor analysis',
    ]);
    expect(parseRemainingWork('I still need to finish the projections, review the summary and then add competitor analysis.')).toEqual([
      'Finish the projections',
      'Review the summary',
      'Add competitor analysis',
    ]);
    expect(parseRemainingWork('   ')).toEqual([]);
  });

  it('builds a valid recurring calendar file', () => {
    const ics = buildIcs([{ uid: 'r@daymark', title: 'Review', description: 'd', time: '20:30', days: [1, 3], durationMin: 15 }], 'https://x', new Date(2026, 10, 16, 21, 0));
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
    expect(ics).toContain('DTSTART:20261118T203000'); // Monday 21:00 is past -> next is Wednesday
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('computes due reminders without repeating', async () => {
    await repo.createTask({ title: 'A' });
    const data = await repo.loadAll();
    const s = { ...DEFAULT_SETTINGS };
    expect(dueReminders(s, data, day('2026-11-16', 20, 0), {})).toHaveLength(0);
    const due = dueReminders(s, data, day('2026-11-16', 20, 31), {});
    expect(due[0]).toMatchObject({ kind: 'review', lateBy: 1 });
    expect(due[0].body).toBe('DAYMARK: Time to review your day. How much did you actually accomplish?');
    expect(dueReminders(s, data, day('2026-11-16', 20, 31), { review: '2026-11-16' })).toHaveLength(0);
  });

  it('date math is local and DST-safe', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    const n = nextOccurrence('20:30', [0, 1, 2, 3, 4, 5, 6], new Date(2026, 10, 16, 20, 31));
    expect(n?.getDate()).toBe(17);
  });
});
