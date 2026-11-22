import { useState } from 'react';
import { addDays } from '../lib/dates';
import * as repo from '../lib/repo';
import { go } from '../lib/router';
import type { Priority } from '../lib/types';
import { Field, PercentSlider, Sheet } from '../components/ui';
import { useStore } from '../state/store';

const DURATIONS = [15, 30, 60, 90, 120, 240];

export function TaskForm() {
  const { taskForm, closeTaskForm, run, today, settings, updateSettings } = useStore();
  const editing = taskForm?.task;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [category, setCategory] = useState(editing?.category ?? settings.categories[0] ?? 'Personal');
  const [newCat, setNewCat] = useState('');
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'medium');
  const [date, setDate] = useState(editing?.scheduledDate ?? taskForm?.date ?? today);
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? '');
  const [est, setEst] = useState<number | null>(editing?.estimatedMinutes ?? null);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [progress, setProgress] = useState(editing?.progress ?? 0);
  const [more, setMore] = useState(!!editing);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  if (!taskForm) return null;
  const tomorrow = addDays(today, 1);
  const dateMode = date === today ? 'today' : date === tomorrow ? 'tomorrow' : 'pick';

  async function save() {
    if (!title.trim()) {
      setErr('Give the task a title.');
      return;
    }
    if (date < today && !editing) {
      setErr('Pick today or a future date.');
      return;
    }
    let cat = category;
    if (category === '__new') {
      cat = newCat.trim() || 'Personal';
      if (!settings.categories.includes(cat)) await updateSettings({ categories: [...settings.categories, cat] });
    }
    setSaving(true);
    const ok = await run(async () => {
      if (editing) {
        await repo.updateTask(editing.id, { title, description, category: cat, priority, dueDate: dueDate || null, estimatedMinutes: est, notes });
        if (date !== editing.scheduledDate && editing.progress < 100 && date >= today) await repo.rescheduleTask(editing.id, date);
        return editing.id;
      }
      const t = await repo.createTask({ title, description, category: cat, priority, scheduledDate: date, dueDate: dueDate || null, estimatedMinutes: est, notes, progress });
      return t.id;
    }, editing ? 'Task updated' : date === today ? 'Added to today' : 'Task planned');
    setSaving(false);
    if (ok) {
      closeTaskForm();
      if (!editing && date !== today) go('tasks');
    }
  }

  return (
    <Sheet
      title={editing ? 'Edit task' : 'New task'}
      onClose={closeTaskForm}
      actions={
        <button className="txt-btn strong" onClick={save} disabled={saving}>
          {editing ? 'Save' : 'Add'}
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span className="sr-only">Task title</span>
          <input
            data-autofocus
            className="input title-input"
            placeholder="What do you intend to do?"
            value={title}
            maxLength={200}
            onChange={(e) => {
              setTitle(e.target.value);
              setErr('');
            }}
            enterKeyHint="done"
            aria-invalid={!!err}
          />
          {err && <div className="error-text" role="alert">{err}</div>}
        </label>

        <div className="field">
          <span className="label">Priority</span>
          <div className={`segmented sel-${priority}`} role="group" aria-label="Priority">
            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
              <button key={p} type="button" aria-pressed={priority === p} onClick={() => setPriority(p)}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {!(editing && editing.progress >= 100) && (
          <div className="field">
            <span className="label">Plan for</span>
            <div className="segmented" role="group" aria-label="Plan for">
              <button type="button" aria-pressed={dateMode === 'today'} onClick={() => setDate(today)}>
                Today
              </button>
              <button type="button" aria-pressed={dateMode === 'tomorrow'} onClick={() => setDate(tomorrow)}>
                Tomorrow
              </button>
              <button type="button" aria-pressed={dateMode === 'pick'} onClick={() => setDate(addDays(today, 2))}>
                Later…
              </button>
            </div>
            {dateMode === 'pick' && <input className="input" style={{ marginTop: 8 }} type="date" min={today} value={date} aria-label="Planned date" onChange={(e) => e.target.value && setDate(e.target.value)} />}
          </div>
        )}

        <div className="row">
          <Field label="Category">
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {[...new Set([...settings.categories, ...(editing ? [editing.category] : [])])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__new">+ New category…</option>
            </select>
          </Field>
          <Field label="Due date (optional)">
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {category === '__new' && (
          <Field label="New category name">
            <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={40} />
          </Field>
        )}

        {!more ? (
          <button type="button" className="btn ghost block sm" onClick={() => setMore(true)}>
            More details — description, duration, notes, progress
          </button>
        ) : (
          <>
            <Field label="Description">
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does done look like?" />
            </Field>
            <div className="field">
              <span className="label">Estimated duration</span>
              <div className="chips" role="group" aria-label="Estimated duration">
                {DURATIONS.map((m) => (
                  <button key={m} type="button" className="chip" aria-pressed={est === m} onClick={() => setEst(est === m ? null : m)}>
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
                <input className="input" style={{ width: 110, minHeight: 38, padding: '6px 10px', flex: 'none' }} inputMode="numeric" type="number" min={1} max={1440} placeholder="mins" aria-label="Custom duration in minutes" value={est && !DURATIONS.includes(est) ? est : ''} onChange={(e) => setEst(e.target.value ? Math.max(1, Math.min(1440, Number(e.target.value))) : null)} />
              </div>
            </div>
            <Field label="Notes">
              <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Links, context, anything useful" />
            </Field>
            {!editing && <PercentSlider value={progress} onChange={setProgress} label="Already done" />}
          </>
        )}
        <button type="submit" className="btn primary block" style={{ marginTop: 18 }} disabled={saving}>
          {editing ? 'Save changes' : date === today ? 'Add to today' : 'Plan task'}
        </button>
      </form>
    </Sheet>
  );
}
