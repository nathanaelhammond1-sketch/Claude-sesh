import { useMemo, useState } from 'react';
import { relativeDay } from '../lib/dates';
import type { Route } from '../lib/router';
import { PRIORITY_RANK, type Priority, type Task } from '../lib/types';
import { IconPlus, IconSearch, IconTasks } from '../components/Icons';
import { TaskCard } from '../components/TaskCard';
import { EmptyState, TopBar } from '../components/ui';
import { useStore } from '../state/store';

const FILTERS = [
  { id: 'active', label: 'Active' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'carried', label: 'Carried forward' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

export function Tasks({ route }: { route: Route }) {
  const { data, today, openTaskForm } = useStore();
  const initial = (route.query.get('f') as FilterId) || 'active';
  const [filter, setFilter] = useState<FilterId>(FILTERS.some((f) => f.id === initial) ? initial : 'active');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [pri, setPri] = useState<'all' | Priority>('all');
  const [sort, setSort] = useState<'priority' | 'due' | 'progress' | 'recent'>('priority');

  const subCounts = useMemo(() => {
    const m = new Map<string, { open: number; total: number }>();
    for (const s of data.subtasks) {
      const c = m.get(s.taskId) ?? { open: 0, total: 0 };
      c.total++;
      if (!s.done) c.open++;
      m.set(s.taskId, c);
    }
    return m;
  }, [data.subtasks]);

  const tests: Record<FilterId, (t: Task) => boolean> = {
    active: (t) => t.lifecycle === 'active' && t.progress < 100,
    upcoming: (t) => t.lifecycle === 'active' && t.progress < 100 && t.scheduledDate > today,
    overdue: (t) => t.lifecycle === 'active' && t.progress < 100 && !!t.dueDate && t.dueDate < today,
    carried: (t) => t.lifecycle === 'active' && t.progress < 100 && t.carryCount > 0,
    completed: (t) => t.progress >= 100 && t.lifecycle === 'active',
    archived: (t) => t.lifecycle !== 'active',
  };
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, data.tasks.filter(tests[f.id]).length])) as Record<FilterId, number>;
  const categories = [...new Set(data.tasks.map((t) => t.category))].sort();

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const subsText = new Map<string, string>();
    if (needle) for (const s of data.subtasks) subsText.set(s.taskId, `${subsText.get(s.taskId) ?? ''} ${s.title.toLowerCase()}`);
    return data.tasks
      .filter(tests[filter])
      .filter((t) => cat === 'all' || t.category === cat)
      .filter((t) => pri === 'all' || t.priority === pri)
      .filter((t) => !needle || `${t.title} ${t.description} ${t.notes} ${t.category}`.toLowerCase().includes(needle) || subsText.get(t.id)?.includes(needle))
      .sort((a, b) => {
        if (sort === 'due') return (a.dueDate ?? a.scheduledDate).localeCompare(b.dueDate ?? b.scheduledDate);
        if (sort === 'progress') return b.progress - a.progress;
        if (sort === 'recent') return b.updatedAt - a.updatedAt;
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.scheduledDate.localeCompare(b.scheduledDate);
      });
  }, [data, filter, q, cat, pri, sort, today]);

  // Group active lists by planned day for clarity.
  const grouped = filter === 'active' || filter === 'upcoming';
  const groups = new Map<string, Task[]>();
  if (grouped) for (const t of list) groups.set(t.scheduledDate, [...(groups.get(t.scheduledDate) ?? []), t]);

  return (
    <div className="screen">
      <TopBar
        title="Tasks"
        right={
          <button className="icon-btn round" aria-label="New task" onClick={() => openTaskForm({ date: today })}>
            <IconPlus />
          </button>
        }
      />
      <div className="search" style={{ marginBottom: 10 }}>
        <IconSearch />
        <input className="input" type="search" placeholder="Search tasks and subtasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
      </div>
      <div className="chips" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="count">{counts[f.id]}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category filter">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="select" value={pri} onChange={(e) => setPri(e.target.value as Priority | 'all')} aria-label="Priority filter">
          <option value="all">Any priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="priority">Priority</option>
          <option value="due">Due date</option>
          <option value="progress">Progress</option>
          <option value="recent">Recent</option>
        </select>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        {list.length === 0 ? (
          <EmptyState icon={<IconTasks />} title={q ? 'No matches' : 'Nothing here'} body={q ? 'Try a different search or filter.' : filter === 'active' ? 'Add a task to start planning your day.' : 'No tasks match this view yet.'} />
        ) : grouped ? (
          [...groups.entries()].map(([d, ts]) => (
            <div key={d} style={{ marginBottom: 18 }}>
              <div className="eyebrow" style={{ margin: '0 2px 8px' }}>
                {relativeDay(d, today)}
              </div>
              {ts.map((t) => (
                <TaskCard key={t.id} task={t} today={today} openSubtasks={subCounts.get(t.id)?.open ?? 0} totalSubtasks={subCounts.get(t.id)?.total ?? 0} />
              ))}
            </div>
          ))
        ) : (
          list.map((t) => (
            <div key={t.id}>
              <TaskCard task={t} today={today} openSubtasks={subCounts.get(t.id)?.open ?? 0} totalSubtasks={subCounts.get(t.id)?.total ?? 0} />
              {filter === 'archived' && (
                <div className="tiny muted" style={{ margin: '4px 6px 10px' }}>
                  {t.lifecycle === 'abandoned' ? 'Abandoned' : 'Archived'} — open to restore
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <button className="fab" aria-label="Quick add task" onClick={() => openTaskForm({ date: today })}>
        <IconPlus />
      </button>
    </div>
  );
}
