import { formatDuration, relativeDay } from '../lib/dates';
import { go } from '../lib/router';
import { PRIORITY_LABEL, STATUS_LABEL, statusOf, type Task } from '../lib/types';
import { IconCalendar, IconCarry, IconFlag } from './Icons';
import { Bar } from './ui';

export function StatusPill({ progress }: { progress: number }) {
  const s = statusOf(progress);
  const cls = s === 'completed' ? 'green' : s === 'in_progress' ? 'gold' : 'outline';
  return <span className={`pill ${cls}`}>{STATUS_LABEL[s]}</span>;
}

export function PriorityPill({ p }: { p: Task['priority'] }) {
  const cls = p === 'high' ? 'red' : p === 'medium' ? 'amber' : 'green';
  return (
    <span className={`pill ${cls}`}>
      <IconFlag /> {PRIORITY_LABEL[p]}
    </span>
  );
}

export function TaskCard({ task, today, openSubtasks, totalSubtasks, carriedFrom }: { task: Task; today: string; openSubtasks: number; totalSubtasks: number; carriedFrom?: string | null }) {
  const overdue = task.dueDate && task.dueDate < today && task.progress < 100;
  const done = task.progress >= 100;
  return (
    <button className={`task-card p-${task.priority}${done ? ' is-done' : ''}`} onClick={() => go(`task/${task.id}`)} aria-label={`${task.title}, ${task.progress}% complete, ${STATUS_LABEL[statusOf(task.progress)]}, ${PRIORITY_LABEL[task.priority]} priority`}>
      <div className="tc-top">
        <div className="tc-title">{task.title}</div>
        <div className="tc-pct" style={{ color: done ? 'var(--green)' : undefined }}>
          {task.progress}%
        </div>
      </div>
      <div className="tc-meta">
        <StatusPill progress={task.progress} />
        <PriorityPill p={task.priority} />
        {(carriedFrom || task.carryCount > 0) && !done && (
          <span className="pill gold" title="Carried forward from an earlier day">
            <IconCarry /> Carried{task.carryCount > 1 ? ` ×${task.carryCount}` : ''}
          </span>
        )}
        {task.category && <span className="pill">{task.category}</span>}
      </div>
      <Bar value={task.progress} thin label={`${task.title} progress`} />
      <div className="tc-foot">
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: overdue ? 'var(--red)' : undefined, fontWeight: overdue ? 650 : undefined }}>
          {task.dueDate ? (
            <>
              <IconCalendar width={13} height={13} /> {overdue ? 'Overdue · ' : 'Due '}
              {relativeDay(task.dueDate, today)}
            </>
          ) : task.scheduledDate !== today ? (
            <>
              <IconCalendar width={13} height={13} /> Planned {relativeDay(task.scheduledDate, today)}
            </>
          ) : (
            <span>{task.estimatedMinutes ? `≈ ${formatDuration(task.estimatedMinutes)}` : 'No due date'}</span>
          )}
        </span>
        <span>{totalSubtasks ? (openSubtasks ? `${openSubtasks} of ${totalSubtasks} subtasks left` : `All ${totalSubtasks} subtasks done`) : ''}</span>
      </div>
    </button>
  );
}
