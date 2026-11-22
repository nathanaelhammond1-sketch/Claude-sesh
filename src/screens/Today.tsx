import { useMemo, useState } from 'react';
import { now } from '../lib/clock';
import { addDays, formatLong, formatTime, greeting, minutesOfDay, relativeDay } from '../lib/dates';
import * as repo from '../lib/repo';
import { isIOS, isStandalone } from '../lib/reminders';
import { go } from '../lib/router';
import { PRIORITY_RANK } from '../lib/types';
import { IconAlert, IconCalendar, IconCheck, IconChevronRight, IconInfo, IconMoon, IconPlus, IconShare, IconToday, IconX } from '../components/Icons';
import { TaskCard } from '../components/TaskCard';
import { Bar, EmptyState, ProgressRing } from '../components/ui';
import { selectDay, useStore } from '../state/store';

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function Today() {
  const { data, today, settings, openTaskForm, run } = useStore();
  const [hideInstall, setHideInstall] = useState(() => safeGet('dm.hideInstall') === '1');
  const items = useMemo(() => selectDay(data, today), [data, today]);
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const da = a.task.progress >= 100 ? 1 : 0,
          db = b.task.progress >= 100 ? 1 : 0;
        if (da !== db) return da - db;
        return PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority] || a.task.createdAt - b.task.createdAt;
      }),
    [items],
  );
  const carried = sorted.filter((i) => i.entry.carriedFrom && i.task.progress < 100);
  const fresh = sorted.filter((i) => !(i.entry.carriedFrom && i.task.progress < 100));

  const total = items.length;
  const completed = items.filter((i) => i.task.progress >= 100).length;
  const inProgress = items.filter((i) => i.task.progress > 0 && i.task.progress < 100).length;
  const notStarted = total - completed - inProgress;
  const overall = total ? Math.round(items.reduce((a, i) => a + i.task.progress, 0) / total) : 0;

  const activeIds = new Set(data.tasks.filter((t) => t.lifecycle === 'active').map((t) => t.id));
  const todayIds = new Set(items.map((i) => i.task.id));
  const taskTitle = new Map(data.tasks.map((t) => [t.id, t.title]));
  const openSubs = data.subtasks
    .filter((s) => !s.done && activeIds.has(s.taskId) && (todayIds.has(s.taskId) || (s.dueDate && s.dueDate <= today)))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order);
  const overdue = data.tasks.filter((t) => t.lifecycle === 'active' && t.progress < 100 && t.dueDate && t.dueDate < today);

  const reviews = data.reviews.filter((r) => r.date === today);
  const reviewedIds = new Set(reviews.filter((r) => r.outcome !== 'skipped').map((r) => r.taskId));
  const pendingReview = items.filter((i) => !reviewedIds.has(i.task.id)).length;
  const dayRec = data.days.find((d) => d.date === today);
  const nowD = now();
  const reviewDue = nowD.getHours() * 60 + nowD.getMinutes() >= minutesOfDay(settings.reviewTime);

  const yesterday = addDays(today, -1);
  const yItems = selectDay(data, yesterday);
  const yReviewed = data.reviews.some((r) => r.date === yesterday && r.outcome !== 'skipped') || data.days.some((d) => d.date === yesterday && d.reviewCompletedAt);
  const showYesterday = yItems.length > 0 && !yReviewed;

  const upcoming = data.tasks.filter((t) => t.lifecycle === 'active' && t.scheduledDate > today && t.scheduledDate <= addDays(today, 7)).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  const showInstall = isIOS() && !isStandalone() && !hideInstall;
  const oldest = data.tasks.reduce((m, t) => Math.min(m, t.createdAt), Infinity);
  const backupStale = data.tasks.length >= 3 && nowD.getTime() - oldest > 3 * 86400000 && (!settings.lastBackupAt || nowD.getTime() - settings.lastBackupAt > 14 * 86400000);
  const name = settings.name.trim();

  return (
    <div className="screen">
      <header className="topbar">
        <div className="brand-mark" aria-label="DAYMARK">
          DAYMARK
        </div>
        <button className="icon-btn" aria-label="History calendar" onClick={() => go('history')}>
          <IconCalendar />
        </button>
      </header>
      <p className="muted" style={{ margin: '0 2px 14px' }}>
        {greeting(nowD)}
        {name ? `, ${name}` : ''}.
      </p>

      <section className="hero" aria-label="Today's overview">
        <div className="eyebrow">{formatLong(today)}</div>
        <h2>MAKE TODAY COUNT.</h2>
        <div className="hero-body">
          <ProgressRing value={overall} size={104} stroke={9} track="rgba(255,255,255,0.12)" color={overall >= 100 ? '#6fcf97' : '#d9b56a'} sub="overall" />
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="n">{total}</div>
              <div className="l">Today's goals</div>
            </div>
            <div className="hero-stat">
              <div className="n">{completed}</div>
              <div className="l">Completed</div>
            </div>
            <div className="hero-stat">
              <div className="n">{inProgress}</div>
              <div className="l">In progress</div>
            </div>
            <div className="hero-stat">
              <div className="n">{notStarted}</div>
              <div className="l">Not started</div>
            </div>
          </div>
        </div>
        <Bar value={overall} label="Overall progress today" />
        <div className="hero-foot">
          <span>Overall progress: {overall}%</span>
          <span>
            {carried.length} carried · {openSubs.length} subtask{openSubs.length === 1 ? '' : 's'} open
          </span>
        </div>
      </section>

      <div className="stack" style={{ marginTop: 14 }}>
        {showInstall && (
          <div className="banner info">
            <IconShare />
            <div className="grow small">
              <b>Install DAYMARK</b>
              Tap the Share button in Safari, then “Add to Home Screen”. It works offline and enables notifications.{' '}
              <button className="table-toggle" onClick={() => go('settings/install')}>
                How-to
              </button>
            </div>
            <button
              className="icon-btn"
              aria-label="Dismiss install tip"
              onClick={() => {
                safeSet('dm.hideInstall', '1');
                setHideInstall(true);
              }}
            >
              <IconX />
            </button>
          </div>
        )}
        {overdue.length > 0 && (
          <button className="banner red" style={{ width: '100%', textAlign: 'left' }} onClick={() => go('tasks?f=overdue')}>
            <IconAlert />
            <div className="grow small">
              <b>
                {overdue.length} overdue task{overdue.length === 1 ? '' : 's'}
              </b>
              {overdue
                .slice(0, 2)
                .map((t) => t.title)
                .join(' · ')}
            </div>
            <IconChevronRight className="chev" />
          </button>
        )}
        {showYesterday && (
          <button className="banner" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`review/${yesterday}`)}>
            <IconMoon />
            <div className="grow small">
              <b>Yesterday wasn't reviewed</b>
              Take a minute to record what happened — it keeps your history honest.
            </div>
            <IconChevronRight className="chev" />
          </button>
        )}
        {backupStale && (
          <button className="banner info" style={{ width: '100%', textAlign: 'left' }} onClick={() => go('settings')}>
            <IconInfo />
            <div className="grow small">
              <b>Back up your data</b>
              Everything lives only on this device. {settings.lastBackupAt ? 'Your last backup is over two weeks old.' : 'You have not made a backup yet.'}
            </div>
            <IconChevronRight className="chev" />
          </button>
        )}
      </div>

      {total > 0 && (
        <section className="section">
          <div className={`card review-card`}>
            <div className="review-cta">
              <div className="icon-wrap">
                <IconMoon />
              </div>
              <div style={{ flex: 1 }}>
                <div className="eyebrow">Evening review · {formatTime(settings.reviewTime)}</div>
                {dayRec?.reviewCompletedAt && pendingReview === 0 ? (
                  <div style={{ fontWeight: 650 }}>Today is reviewed. Well done for being honest.</div>
                ) : reviewDue ? (
                  <div style={{ fontWeight: 650 }}>It's time to review your day. {pendingReview} task{pendingReview === 1 ? '' : 's'} to review.</div>
                ) : (
                  <div style={{ fontWeight: 650 }}>Tonight, review honestly what you accomplished.</div>
                )}
              </div>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              {dayRec?.reviewCompletedAt && pendingReview === 0 ? (
                <>
                  <button className="btn ghost sm" onClick={() => go('review')}>
                    Revisit review
                  </button>
                  <button className="btn gold sm" onClick={() => go('journal')}>
                    Write reflection
                  </button>
                </>
              ) : (
                <button className={`btn ${reviewDue ? 'gold' : 'ghost'} sm`} onClick={() => go('review')}>
                  {reviewDue ? 'Start evening review' : 'Review early'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {total === 0 ? (
        <section className="section">
          <EmptyState
            icon={<IconToday />}
            title="Set today's intentions"
            body="What would make today count? Add a few honest goals — you can track progress as you go and review them tonight."
            action={
              <button className="btn primary" onClick={() => openTaskForm({ date: today })}>
                <IconPlus /> Add a goal
              </button>
            }
          />
        </section>
      ) : (
        <>
          {carried.length > 0 && (
            <section className="section" aria-labelledby="h-carried">
              <div className="section-head">
                <h2 id="h-carried">Carried forward</h2>
                <span className="muted small">continuing from earlier</span>
              </div>
              {carried.map((i) => (
                <TaskCard key={i.task.id} task={i.task} today={today} openSubtasks={i.openSubtasks} totalSubtasks={i.totalSubtasks} carriedFrom={i.entry.carriedFrom} />
              ))}
            </section>
          )}
          <section className="section" aria-labelledby="h-goals">
            <div className="section-head">
              <h2 id="h-goals">{carried.length ? 'Planned for today' : "Today's goals"}</h2>
              <button className="link" onClick={() => openTaskForm({ date: today })}>
                + Add
              </button>
            </div>
            {fresh.length ? (
              fresh.map((i) => <TaskCard key={i.task.id} task={i.task} today={today} openSubtasks={i.openSubtasks} totalSubtasks={i.totalSubtasks} carriedFrom={i.entry.carriedFrom} />)
            ) : (
              <p className="muted small" style={{ margin: '0 2px' }}>
                Only carried work today. Finish what's in motion before adding more.
              </p>
            )}
          </section>
        </>
      )}

      {openSubs.length > 0 && (
        <section className="section" aria-labelledby="h-subs">
          <div className="section-head">
            <h2 id="h-subs">Outstanding subtasks</h2>
            <span className="muted small">{openSubs.length} open</span>
          </div>
          <div className="list">
            {openSubs.slice(0, 8).map((s) => (
              <div className="list-item subtask" key={s.id}>
                <button className="check" role="checkbox" aria-checked={false} aria-label={`Mark "${s.title}" done`} onClick={() => run(() => repo.toggleSubtask(s.id, true), 'Subtask done')}>
                  <IconCheck />
                </button>
                <button className="grow" style={{ background: 'none', border: 0, textAlign: 'left', padding: 0 }} onClick={() => go(`task/${s.taskId}`)}>
                  <div className="title">{s.title}</div>
                  <div className="sub">
                    {taskTitle.get(s.taskId)}
                    {s.dueDate ? ` · due ${relativeDay(s.dueDate, today).toLowerCase()}` : ''}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="section" aria-labelledby="h-up">
          <div className="section-head">
            <h2 id="h-up">Coming up</h2>
            <button className="link" onClick={() => go('tasks?f=upcoming')}>
              See all
            </button>
          </div>
          <div className="list">
            {upcoming.slice(0, 4).map((t) => (
              <button className="list-item" key={t.id} onClick={() => go(`task/${t.id}`)}>
                <div className="grow">
                  <div className="title">{t.title}</div>
                  <div className="sub">
                    {relativeDay(t.scheduledDate, today)} · {t.category}
                  </div>
                </div>
                <IconChevronRight className="chev" />
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="fab" aria-label="Quick add task" onClick={() => openTaskForm({ date: today })}>
        <IconPlus />
      </button>
    </div>
  );
}
