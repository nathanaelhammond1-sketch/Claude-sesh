import { useEffect, useMemo, useState } from 'react';
import { addDays, formatDuration, formatMedium, relativeDay } from '../lib/dates';
import * as repo from '../lib/repo';
import { back, go } from '../lib/router';
import { PRIORITY_RANK, type Priority, type Subtask } from '../lib/types';
import { IconArchive, IconCalendar, IconCarry, IconCheck, IconChevronDown, IconChevronUp, IconEdit, IconRestore, IconTrash, IconX } from '../components/Icons';
import { PriorityPill, StatusPill } from '../components/TaskCard';
import { EmptyState, Field, PercentSlider, ProgressRing, Sheet, TopBar } from '../components/ui';
import { useStore } from '../state/store';

const OUTCOME_LABEL = { completed: 'Completed', partial: 'Partially completed', not_started: 'Not started', skipped: 'Skipped' } as const;
const SOURCE_LABEL = { slider: 'Updated', quick: 'Updated', review: 'Evening review', complete: 'Marked complete', create: 'Created', reopen: 'Reopened' } as const;

export function TaskDetail({ id }: { id: string }) {
  const { data, today, run, openTaskForm, confirm } = useStore();
  const task = data.tasks.find((t) => t.id === id);
  const [value, setValue] = useState(task?.progress ?? 0);
  const [newSub, setNewSub] = useState('');
  const [editSub, setEditSub] = useState<Subtask | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  useEffect(() => setValue(task?.progress ?? 0), [task?.progress]);

  const subs = useMemo(() => data.subtasks.filter((s) => s.taskId === id).sort((a, b) => a.order - b.order), [data.subtasks, id]);
  const entries = useMemo(() => data.entries.filter((e) => e.taskId === id).sort((a, b) => b.date.localeCompare(a.date)), [data.entries, id]);
  const reviews = useMemo(() => new Map(data.reviews.filter((r) => r.taskId === id).map((r) => [r.date, r])), [data.reviews, id]);
  const events = useMemo(() => data.events.filter((e) => e.taskId === id).sort((a, b) => b.at - a.at), [data.events, id]);

  if (!task) {
    return (
      <div className="screen">
        <TopBar back="tasks" />
        <EmptyState icon={<IconX />} title="Task not found" body="It may have been deleted." action={<button className="btn primary" onClick={() => go('tasks')}>All tasks</button>} />
      </div>
    );
  }

  const open = subs.filter((s) => !s.done);
  const commit = (v: number) => {
    if (v !== task.progress) run(() => repo.setProgress(task.id, v, 'slider'), v >= 100 ? 'Completed. Nicely done.' : undefined);
  };
  const isActive = task.lifecycle === 'active';
  const done = task.progress >= 100;

  async function addSub() {
    const t = newSub.trim();
    if (!t) return;
    const ok = await run(() => repo.addSubtasks(task!.id, [{ title: t, dueDate: task!.scheduledDate >= today ? task!.scheduledDate : today }]));
    if (ok) setNewSub('');
  }

  return (
    <div className="screen">
      <TopBar
        back={() => back('today')}
        right={
          <button className="icon-btn" aria-label="Edit task" onClick={() => openTaskForm({ task })}>
            <IconEdit />
          </button>
        }
      />
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 27, lineHeight: 1.2, margin: '4px 2px 10px', wordBreak: 'break-word' }}>{task.title}</h1>
      <div className="tc-meta" style={{ marginBottom: 14 }}>
        <StatusPill progress={task.progress} />
        <PriorityPill p={task.priority} />
        <span className="pill">{task.category}</span>
        {task.carryCount > 0 && (
          <span className="pill gold">
            <IconCarry /> Carried {task.carryCount}×
          </span>
        )}
        {!isActive && <span className="pill red">{task.lifecycle === 'abandoned' ? 'Abandoned' : 'Archived'}</span>}
      </div>

      {/* Progress */}
      <section className="card" aria-label="Completion">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <ProgressRing value={value} size={84} stroke={8} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 650 }}>{done ? 'Completed' : value > 0 ? 'In progress' : 'Not started'}</div>
            <div className="muted small">
              {done && task.completedAt
                ? `Finished ${new Date(task.completedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
                : `Planned ${relativeDay(task.scheduledDate, today).toLowerCase()}${task.dueDate ? ` · due ${relativeDay(task.dueDate, today).toLowerCase()}` : ''}`}
            </div>
          </div>
        </div>
        {isActive && (
          <>
            <PercentSlider value={value} onChange={setValue} onCommit={commit} />
            {!done && (
              <button className="btn green block" style={{ marginTop: 12 }} onClick={() => run(() => repo.completeTask(task.id, true), open.length ? `Completed — ${open.length} subtask${open.length === 1 ? '' : 's'} checked off` : 'Completed. Nicely done.')}>
                <IconCheck /> Mark complete
              </button>
            )}
          </>
        )}
      </section>

      {/* Subtasks */}
      <section className="section" aria-labelledby="h-st">
        <div className="section-head">
          <h2 id="h-st">Subtasks</h2>
          <span className="muted small">{subs.length ? `${subs.length - open.length}/${subs.length} done` : ''}</span>
        </div>
        {subs.length > 0 && open.length === 0 && !done && isActive && (
          <div className="banner green" style={{ marginBottom: 10 }}>
            <IconCheck />
            <div className="grow small">
              <b>All subtasks are done.</b>
              Is the whole task complete?
            </div>
            <button className="btn green sm" onClick={() => run(() => repo.completeTask(task.id, false), 'Completed. Nicely done.')}>
              Complete
            </button>
          </div>
        )}
        <div className="list">
          {subs.map((s, i) => (
            <div className="list-item subtask" key={s.id}>
              <button className="check" role="checkbox" aria-checked={s.done} aria-label={`${s.done ? 'Uncheck' : 'Check'} "${s.title}"`} onClick={() => run(() => repo.toggleSubtask(s.id))}>
                <IconCheck />
              </button>
              <button className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setEditSub(s)} aria-label={`Edit subtask ${s.title}`}>
                <div className={`title${s.done ? ' done' : ''}`}>{s.title}</div>
                <div className="sub">
                  {[s.dueDate && `Due ${relativeDay(s.dueDate, today).toLowerCase()}`, s.priority !== 'medium' && `${s.priority} priority`, s.done && s.completedOn && `done ${relativeDay(s.completedOn, today).toLowerCase()}`, s.createdOn < today && !s.done && 'carried'].filter(Boolean).join(' · ')}
                </div>
              </button>
              <div className="subtask-tools">
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => run(() => repo.moveSubtask(s.id, -1))}>
                  <IconChevronUp />
                </button>
                <button className="icon-btn" aria-label="Move down" disabled={i === subs.length - 1} onClick={() => run(() => repo.moveSubtask(s.id, 1))}>
                  <IconChevronDown />
                </button>
              </div>
            </div>
          ))}
          <form
            className="list-item"
            onSubmit={(e) => {
              e.preventDefault();
              addSub();
            }}
          >
            <input className="input" style={{ border: 0, padding: '8px 2px', minHeight: 40, background: 'transparent', boxShadow: 'none' }} placeholder="Add a subtask…" value={newSub} onChange={(e) => setNewSub(e.target.value)} aria-label="New subtask" enterKeyHint="done" />
            <button className="btn sm primary" type="submit" disabled={!newSub.trim()}>
              Add
            </button>
          </form>
        </div>
      </section>

      {/* Details */}
      {(task.description || task.notes) && (
        <section className="section">
          <div className="card">
            {task.description && (
              <>
                <div className="label">Description</div>
                <div className="prose" style={{ marginBottom: task.notes ? 14 : 0 }}>
                  {task.description}
                </div>
              </>
            )}
            {task.notes && (
              <>
                <div className="label">Notes</div>
                <div className="prose">{task.notes}</div>
              </>
            )}
          </div>
        </section>
      )}
      <section className="section">
        <div className="card">
          <dl className="kv">
            <dt>Planned for</dt>
            <dd>{formatMedium(task.scheduledDate)}</dd>
            <dt>First planned</dt>
            <dd>{formatMedium(task.originDate)}</dd>
            <dt>Due date</dt>
            <dd>{task.dueDate ? formatMedium(task.dueDate) : '—'}</dd>
            <dt>Estimate</dt>
            <dd>{formatDuration(task.estimatedMinutes) || '—'}</dd>
            <dt>Days on the list</dt>
            <dd>{entries.filter((e) => !e.rescheduledTo).length}</dd>
          </dl>
        </div>
      </section>

      {/* Day-by-day history */}
      <section className="section" aria-labelledby="h-hist">
        <div className="section-head">
          <h2 id="h-hist">Daily history</h2>
        </div>
        <div className="card">
          <div className="timeline">
            {entries.map((e) => {
              const r = reviews.get(e.date);
              return (
                <div key={e.id} className={`tl-item${e.endProgress >= 100 ? ' green' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <button style={{ background: 'none', border: 0, padding: 0, fontWeight: 650, color: 'var(--ink)' }} onClick={() => go(`history/${e.date}`)}>
                      {formatMedium(e.date)}
                    </button>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>
                      {e.startProgress !== e.endProgress ? `${e.startProgress}% → ${e.endProgress}%` : `${e.endProgress}%`}
                    </span>
                  </div>
                  <div className="when">
                    {[e.carriedFrom && `Carried from ${formatMedium(e.carriedFrom)}`, e.rescheduledTo && `Moved to ${formatMedium(e.rescheduledTo)}`, e.droppedAs && (e.droppedAs === 'abandoned' ? 'Abandoned' : 'Archived'), e.date === today && 'Today'].filter(Boolean).join(' · ')}
                  </div>
                  {r && (
                    <div className="small" style={{ marginTop: 6, background: 'var(--surface-2)', borderRadius: 10, padding: '8px 10px' }}>
                      <b>{OUTCOME_LABEL[r.outcome]}</b>
                      {r.outcome === 'partial' && ` · ${r.progress}%`}
                      {r.reasons.length > 0 && <div className="muted">Why: {r.reasons.join(', ')}{r.reasonNote ? ` — ${r.reasonNote}` : ''}</div>}
                      {!r.reasons.length && r.reasonNote && <div className="muted">Why: {r.reasonNote}</div>}
                      {r.remaining && <div className="muted prose">Remaining: {r.remaining}</div>}
                      {r.nextAction && <div>Next: {r.nextAction}</div>}
                    </div>
                  )}
                  {e.closed && e.subtasksAtClose && e.subtasksAtClose.length > 0 && (
                    <div className="tiny muted" style={{ marginTop: 4 }}>
                      Subtasks at end of day: {e.subtasksAtClose.filter((s) => s.done).length}/{e.subtasksAtClose.length} done
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {events.length > 0 && (
            <details style={{ marginTop: 4 }}>
              <summary className="small" style={{ cursor: 'pointer', color: 'var(--gold-ink)', fontWeight: 650, padding: '6px 0' }}>
                Progress changes ({events.length})
              </summary>
              <table className="data-table" style={{ marginTop: 6 }}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Change</th>
                    <th className="num">Via</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 60).map((ev) => (
                    <tr key={ev.id}>
                      <td>{new Date(ev.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                      <td>
                        {ev.from}% → {ev.to}%
                      </td>
                      <td className="num muted">{SOURCE_LABEL[ev.source]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </section>

      {/* Actions */}
      <section className="section">
        <div className="stack">
          {isActive && !done && (
            <button className="btn ghost block" onClick={() => setRescheduling(true)}>
              <IconCalendar /> Reschedule
            </button>
          )}
          {isActive ? (
            <div className="btn-row">
              <button
                className="btn ghost"
                onClick={async () => {
                  if (await confirm({ title: 'Archive this task?', message: done ? 'It moves out of your active lists. History stays intact.' : 'It will stop carrying forward. Its history stays intact and you can restore it any time.', confirmLabel: 'Archive' }))
                    run(() => repo.archiveTask(task.id), 'Archived');
                }}
              >
                <IconArchive /> Archive
              </button>
              {!done && (
                <button
                  className="btn danger"
                  onClick={async () => {
                    if (await confirm({ title: 'Abandon this task?', message: 'Letting go is a valid decision. It will stop carrying forward; everything you recorded stays in your history.', confirmLabel: 'Abandon', danger: true }))
                      run(() => repo.abandonTask(task.id), 'Task abandoned');
                  }}
                >
                  Abandon
                </button>
              )}
            </div>
          ) : (
            <button className="btn primary block" onClick={() => run(() => repo.restoreTask(task.id), done ? 'Restored' : 'Restored to today')}>
              <IconRestore /> Restore
            </button>
          )}
          <button
            className="btn danger block"
            onClick={async () => {
              if (await confirm({ title: 'Delete permanently?', message: 'This removes the task, its subtasks, reviews and all of its history. This cannot be undone. Archive instead to keep the record.', confirmLabel: 'Delete', danger: true })) {
                const ok = await run(() => repo.deleteTask(task.id), 'Task deleted');
                if (ok !== undefined) go('tasks', true);
              }
            }}
          >
            <IconTrash /> Delete
          </button>
        </div>
      </section>

      {editSub && <SubtaskEditor sub={editSub} onClose={() => setEditSub(null)} />}
      {rescheduling && <RescheduleSheet taskId={task.id} current={task.scheduledDate} onClose={() => setRescheduling(false)} />}
    </div>
  );
}

function SubtaskEditor({ sub, onClose }: { sub: Subtask; onClose: () => void }) {
  const { run, confirm } = useStore();
  const [title, setTitle] = useState(sub.title);
  const [description, setDescription] = useState(sub.description);
  const [dueDate, setDueDate] = useState(sub.dueDate ?? '');
  const [priority, setPriority] = useState<Priority>(sub.priority);
  const save = async () => {
    const ok = await run(() => repo.updateSubtask(sub.id, { title, description, dueDate: dueDate || null, priority }), 'Subtask saved');
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet
      title="Subtask"
      onClose={onClose}
      actions={
        <button className="txt-btn strong" onClick={save}>
          Save
        </button>
      }
    >
      <Field label="Title">
        <input data-autofocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description (optional)">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="row">
        <Field label="Due date">
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Priority">
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(['high', 'medium', 'low'] as Priority[]).sort((a, b) => PRIORITY_RANK[a] - PRIORITY_RANK[b]).map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field">
        <span className="label">Status</span>
        <div className="muted">{sub.done ? `Completed ${sub.completedOn ? formatMedium(sub.completedOn) : ''}` : 'Open'}</div>
      </div>
      <div className="btn-row">
        <button className="btn primary" onClick={save}>
          Save
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            if (await confirm({ title: 'Delete subtask?', message: `"${sub.title}" will be removed.`, confirmLabel: 'Delete', danger: true })) {
              const ok = await run(() => repo.deleteSubtask(sub.id), 'Subtask deleted');
              if (ok !== undefined) onClose();
            }
          }}
        >
          <IconTrash /> Delete
        </button>
      </div>
    </Sheet>
  );
}

function RescheduleSheet({ taskId, current, onClose }: { taskId: string; current: string; onClose: () => void }) {
  const { run, today } = useStore();
  const [date, setDate] = useState(current < today ? today : current === today ? addDays(today, 1) : current);
  const options = [
    { label: 'Today', d: today },
    { label: 'Tomorrow', d: addDays(today, 1) },
    { label: 'In 2 days', d: addDays(today, 2) },
    { label: 'Next week', d: addDays(today, 7) },
  ];
  const save = async (d: string) => {
    const ok = await run(() => repo.rescheduleTask(taskId, d), `Moved to ${relativeDay(d, today).toLowerCase()}`);
    if (ok !== undefined) onClose();
  };
  return (
    <Sheet title="Reschedule" onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>
        The task keeps its progress, subtasks and history. Today's record will show it was moved.
      </p>
      <div className="list" style={{ marginBottom: 14 }}>
        {options.map((o) => (
          <button key={o.label} className="list-item" onClick={() => save(o.d)} disabled={o.d === current}>
            <div className="grow">
              <div className="title">{o.label}</div>
              <div className="sub">{formatMedium(o.d)}</div>
            </div>
          </button>
        ))}
      </div>
      <Field label="Or pick a date">
        <input className="input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <button className="btn primary block" disabled={!date || date < today} onClick={() => save(date)}>
        Move to {date ? formatMedium(date) : '…'}
      </button>
    </Sheet>
  );
}
