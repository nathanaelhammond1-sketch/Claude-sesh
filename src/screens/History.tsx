import { useMemo, useState } from 'react';
import { dayMetrics, entriesByDate } from '../lib/analytics';
import { addDays, formatLong, formatMedium, parseISODate, toISODate, WEEKDAYS_SHORT } from '../lib/dates';
import { go } from '../lib/router';
import { IconCarry, IconCheck, IconChevronLeft, IconChevronRight, IconJournal, IconMoon } from '../components/Icons';
import { Bar, TopBar } from '../components/ui';
import { useStore } from '../state/store';

const OUTCOME_LABEL = { completed: 'Completed', partial: 'Partially completed', not_started: 'Not started', skipped: 'Skipped' } as const;

export function History({ date: dateParam }: { date?: string }) {
  const { data, today } = useStore();
  const [sel, setSel] = useState(dateParam ?? today);
  const [month, setMonth] = useState(() => {
    const d = parseISODate(dateParam ?? today);
    return new Date(d.getFullYear(), d.getMonth(), 1, 12);
  });
  const byDate = useMemo(() => entriesByDate(data), [data]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => toISODate(new Date(month.getFullYear(), month.getMonth(), i + 1, 12)))];

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1, 12));

  const entries = (data.entries.filter((e) => e.date === sel) ?? []).sort((a, b) => b.endProgress - a.endProgress);
  const counted = byDate.get(sel) ?? [];
  const m = dayMetrics(sel, counted);
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const reviews = new Map(data.reviews.filter((r) => r.date === sel).map((r) => [r.taskId, r]));
  const journal = data.journal.find((j) => j.date === sel);
  const subsCompleted = data.subtasks.filter((s) => s.completedOn === sel);
  const isPast = sel < today;
  // Unfinished subtasks: frozen snapshot for closed days, live state for today/future.
  const unfinished: { title: string; task: string }[] = [];
  for (const e of counted) {
    if (e.closed && e.subtasksAtClose) for (const s of e.subtasksAtClose) !s.done && unfinished.push({ title: s.title, task: e.titleSnapshot });
    else if (!e.closed) for (const s of data.subtasks.filter((x) => x.taskId === e.taskId && !x.done)) unfinished.push({ title: s.title, task: e.titleSnapshot });
  }
  const carriedOut = isPast ? counted.filter((e) => e.endProgress < 100 && data.entries.some((x) => x.taskId === e.taskId && x.carriedFrom === sel)) : [];

  return (
    <div className="screen">
      <TopBar back="progress" title="History" />
      <div className="card">
        <div className="cal-head">
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <IconChevronLeft />
          </button>
          <h3>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <IconChevronRight />
          </button>
        </div>
        <div className="cal" style={{ marginBottom: 4 }}>
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="heat-dow">
              {w[0]}
            </div>
          ))}
        </div>
        <div className="cal">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const dm = dayMetrics(d, byDate.get(d));
            const lv = dm.completion === null ? '' : dm.completion >= 80 ? 'lv3' : dm.completion >= 40 ? 'lv2' : dm.completion > 0 ? 'lv1' : 'lv0';
            return (
              <button key={d} className={`cal-day${d === sel ? ' sel' : ''}${d === today ? ' is-today' : ''}${d > today ? ' future' : ''}`} onClick={() => setSel(d)} aria-label={`${formatLong(d)}${dm.planned ? `, ${dm.completion}% of ${dm.planned} tasks` : ', nothing planned'}`} aria-pressed={d === sel}>
                {parseISODate(d).getDate()}
                <i className={lv} />
              </button>
            );
          })}
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>{formatLong(sel)}</h2>
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn ghost sm" onClick={() => setSel(addDays(sel, -1))} aria-label="Previous day">
            <IconChevronLeft /> Prev
          </button>
          <button className="btn ghost sm" onClick={() => setSel(addDays(sel, 1))} aria-label="Next day">
            Next <IconChevronRight />
          </button>
        </div>
        {m.planned > 0 ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 650 }}>{m.completion}% completion</span>
              <span className="muted small">
                {m.completed}/{m.planned} completed{m.carriedIn ? ` · ${m.carriedIn} carried in` : ''}
              </span>
            </div>
            <div style={{ margin: '8px 0 0' }}>
              <Bar value={m.completion ?? 0} />
            </div>
          </div>
        ) : (
          <p className="muted">{sel > today ? 'Nothing planned yet.' : 'No tasks were planned on this day.'}</p>
        )}
      </section>

      {entries.length > 0 && (
        <section className="section" aria-labelledby="h-planned">
          <div className="section-head">
            <h2 id="h-planned">Planned</h2>
          </div>
          <div className="list">
            {entries.map((e) => {
              const r = reviews.get(e.taskId);
              const exists = tasks.has(e.taskId);
              return (
                <button key={e.id} className="list-item" onClick={() => exists && go(`task/${e.taskId}`)} style={{ alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="title" style={{ textDecoration: e.rescheduledTo || e.droppedAs ? 'line-through' : undefined }}>{e.titleSnapshot}</div>
                    <div className="sub">
                      {[e.startProgress !== e.endProgress ? `${e.startProgress}% → ${e.endProgress}%` : `${e.endProgress}%`, e.carriedFrom && `carried from ${formatMedium(e.carriedFrom)}`, e.rescheduledTo && `moved to ${formatMedium(e.rescheduledTo)}`, e.droppedAs].filter(Boolean).join(' · ')}
                    </div>
                    {r && (
                      <div className="small" style={{ marginTop: 6 }}>
                        <span className={`pill ${r.outcome === 'completed' ? 'green' : r.outcome === 'partial' ? 'gold' : r.outcome === 'not_started' ? 'red' : ''}`}>{OUTCOME_LABEL[r.outcome]}</span>
                        {r.reasons.length > 0 && <div className="muted" style={{ marginTop: 4 }}>Why: {r.reasons.join(', ')}{r.reasonNote ? ` — ${r.reasonNote}` : ''}</div>}
                        {!r.reasons.length && r.reasonNote && <div className="muted" style={{ marginTop: 4 }}>Why: {r.reasonNote}</div>}
                        {r.remaining && <div className="muted prose">Remaining: {r.remaining}</div>}
                        {r.nextAction && <div>Next action: {r.nextAction}</div>}
                      </div>
                    )}
                  </div>
                  {e.endProgress >= 100 ? <IconCheck className="chev" style={{ color: 'var(--green)' }} /> : e.carriedFrom ? <IconCarry className="chev" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {carriedOut.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Carried to the next day</h2>
          </div>
          <div className="list">
            {carriedOut.map((e) => (
              <div className="list-item" key={e.id}>
                <IconCarry className="chev" />
                <div className="grow">
                  <div className="title">{e.titleSnapshot}</div>
                  <div className="sub">left at {e.endProgress}%</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(subsCompleted.length > 0 || unfinished.length > 0) && (
        <section className="section">
          <div className="section-head">
            <h2>Subtasks</h2>
          </div>
          <div className="card">
            {subsCompleted.length > 0 && (
              <>
                <div className="label">Completed this day ({subsCompleted.length})</div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
                  {subsCompleted.map((s) => (
                    <li key={s.id}>
                      {s.title} <span className="muted small">· {tasks.get(s.taskId)?.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {unfinished.length > 0 && (
              <>
                <div className="label">{isPast ? 'Unfinished at end of day' : 'Still open'} ({unfinished.length})</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {unfinished.map((s, i) => (
                    <li key={i}>
                      {s.title} <span className="muted small">· {s.task}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Reflection</h2>
        </div>
        {journal ? (
          <button className="card" style={{ width: '100%', textAlign: 'left', display: 'block' }} onClick={() => go(`journal/${sel}`)}>
            <div className="prose small" style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {[journal.accomplished, journal.learned, journal.freeform].filter(Boolean).join('\n') || 'Open entry'}
            </div>
            <div className="tiny" style={{ color: 'var(--gold-ink)', marginTop: 8, fontWeight: 650 }}>
              Read journal entry →
            </div>
          </button>
        ) : (
          <div className="btn-row">
            {sel <= today && (
              <button className="btn ghost sm" onClick={() => go(`journal/${sel}`)}>
                <IconJournal /> Write reflection
              </button>
            )}
            {sel <= today && m.planned > 0 && (
              <button className="btn ghost sm" onClick={() => go(`review/${sel}`)}>
                <IconMoon /> Review this day
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
