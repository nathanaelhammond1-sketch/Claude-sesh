import { useMemo, useState } from 'react';
import { categoryBreakdown, chronicallyUnfinished, dayMetrics, entriesByDate, insights, obstacleCounts, rangeSummary, reviewStreak, weekdayPattern, weeklyTrend } from '../lib/analytics';
import { addDays, formatMedium, formatShort, lastNDays, parseISODate, WEEKDAYS_LONG, WEEKDAYS_SHORT, weekdayOf } from '../lib/dates';
import { go } from '../lib/router';
import { IconCalendar, IconChevronRight, IconProgress, IconTrend } from '../components/Icons';
import { ChartCard, HBars, PercentBars, StackedCounts, TrendLine } from '../components/Charts';
import { EmptyState, TopBar } from '../components/ui';
import { useStore } from '../state/store';

export function Progress() {
  const { data, today } = useStore();
  const [range, setRange] = useState<7 | 30>(7);
  const byDate = useMemo(() => entriesByDate(data), [data]);
  const week = useMemo(() => rangeSummary(data, today, 7, byDate), [data, today, byDate]);
  const prevWeek = useMemo(() => rangeSummary(data, addDays(today, -7), 7, byDate), [data, today, byDate]);
  const month = useMemo(() => rangeSummary(data, today, 30, byDate), [data, today, byDate]);
  const sel = range === 7 ? week : month;
  const trend = useMemo(() => weeklyTrend(data, today, 8, byDate), [data, today, byDate]);
  const cats = useMemo(() => categoryBreakdown(data, today, range, byDate), [data, today, range, byDate]);
  const pattern = useMemo(() => weekdayPattern(data, today, 30, byDate), [data, today, byDate]);
  const chronic = useMemo(() => chronicallyUnfinished(data, today, 30), [data, today]);
  const obstacles = useMemo(() => obstacleCounts(data.reviews, today, range), [data.reviews, today, range]);
  const notes = useMemo(() => insights(data, today), [data, today]);
  const streak = reviewStreak(data, today);
  const delta = week.completion !== null && prevWeek.completion !== null ? week.completion - prevWeek.completion : null;

  if (!data.entries.length) {
    return (
      <div className="screen">
        <TopBar title="Progress" />
        <EmptyState icon={<IconProgress />} title="Your patterns will appear here" body="Plan tasks, update progress and do your evening review. After a few days you'll see completion trends, your strongest days and recurring obstacles." />
      </div>
    );
  }

  const last7 = lastNDays(7, today);
  const days30 = lastNDays(30, today);
  const firstPad = weekdayOf(days30[0]);
  const heatLevel = (c: number | null) => (c === null ? -1 : c >= 90 ? 4 : c >= 70 ? 3 : c >= 40 ? 2 : c > 0 ? 1 : 0);

  return (
    <div className="screen">
      <TopBar
        title="Progress"
        right={
          <button className="icon-btn" aria-label="History calendar" onClick={() => go('history')}>
            <IconCalendar />
          </button>
        }
      />
      <div className="segmented" role="group" aria-label="Range" style={{ marginBottom: 14 }}>
        <button aria-pressed={range === 7} onClick={() => setRange(7)}>
          This week
        </button>
        <button aria-pressed={range === 30} onClick={() => setRange(30)}>
          Last 30 days
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="n">{week.completion ?? '—'}{week.completion !== null && '%'}</div>
          <div className="l">Weekly completion</div>
          {delta !== null && <div className={`d ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} pts vs last week</div>}
        </div>
        <div className="stat">
          <div className="n">{month.completion ?? '—'}{month.completion !== null && '%'}</div>
          <div className="l">Monthly completion</div>
          <div className="d muted">{month.activeDays} active day{month.activeDays === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="n">{sel.completed}</div>
          <div className="l">Tasks completed</div>
        </div>
        <div className="stat">
          <div className="n">{sel.partial}</div>
          <div className="l">Partially completed</div>
        </div>
        <div className="stat">
          <div className="n">{sel.carried}</div>
          <div className="l">Carried forward</div>
        </div>
        <div className="stat">
          <div className="n">{sel.completion ?? '—'}{sel.completion !== null && '%'}</div>
          <div className="l">Avg daily productivity</div>
          <div className="d muted">+{sel.avgGained} pts progress/day</div>
        </div>
        <div className="stat">
          <div className="n" style={{ fontSize: 20 }}>{sel.best ? WEEKDAYS_SHORT[weekdayOf(sel.best.date)] + ' ' + formatShort(sel.best.date) : '—'}</div>
          <div className="l">Most productive day</div>
          {sel.best && <div className="d muted">{sel.best.completion}% · {sel.best.completed} done</div>}
        </div>
        <div className="stat">
          <div className="n">{streak}</div>
          <div className="l">Review streak (days)</div>
        </div>
      </div>

      {notes.length > 0 && (
        <section className="section card" aria-labelledby="h-ins">
          <div className="chart-head">
            <h3 id="h-ins">What your data says</h3>
          </div>
          {notes.map((n, i) => (
            <div className="insight" key={i}>
              <IconTrend />
              <div className="small">{n}</div>
            </div>
          ))}
        </section>
      )}

      <section className="section stack">
        <ChartCard
          title="Daily completion"
          sub="Average progress of each day's plan, last 7 days"
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Planned</th>
                  <th className="num">Done</th>
                  <th className="num">Completion</th>
                </tr>
              </thead>
              <tbody>
                {last7.map((d) => {
                  const m = dayMetrics(d, byDate.get(d));
                  return (
                    <tr key={d}>
                      <td>{formatMedium(d)}</td>
                      <td className="num">{m.planned}</td>
                      <td className="num">{m.completed}</td>
                      <td className="num">{m.completion === null ? '—' : `${m.completion}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        >
          <PercentBars
            data={last7.map((d) => {
              const m = dayMetrics(d, byDate.get(d));
              return { label: d === today ? 'Today' : WEEKDAYS_SHORT[weekdayOf(d)], value: m.completion, highlight: d === today, detail: m.planned ? `${formatMedium(d)}: ${m.completion}% · ${m.completed}/${m.planned} done` : `${formatMedium(d)}: nothing planned` };
            })}
          />
        </ChartCard>

        <ChartCard
          title="Completed vs incomplete"
          sub="Tasks per day, last 7 days"
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Completed</th>
                  <th className="num">Incomplete</th>
                </tr>
              </thead>
              <tbody>
                {last7.map((d) => {
                  const m = dayMetrics(d, byDate.get(d));
                  return (
                    <tr key={d}>
                      <td>{formatMedium(d)}</td>
                      <td className="num">{m.completed}</td>
                      <td className="num">{m.planned - m.completed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        >
          <StackedCounts
            data={last7.map((d) => {
              const m = dayMetrics(d, byDate.get(d));
              return { label: d === today ? 'Today' : WEEKDAYS_SHORT[weekdayOf(d)], done: m.completed, open: m.planned - m.completed, highlight: d === today };
            })}
          />
        </ChartCard>

        <ChartCard
          title="Weekly productivity trend"
          sub="Average completion per 7-day period, last 8 weeks"
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="num">Completed</th>
                  <th className="num">Completion</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((w) => (
                  <tr key={w.end}>
                    <td>
                      {formatShort(w.start)}–{formatShort(w.end)}
                    </td>
                    <td className="num">
                      {w.completed}/{w.planned}
                    </td>
                    <td className="num">{w.completion === null ? '—' : `${w.completion}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <TrendLine data={trend.map((w, i) => ({ label: i === trend.length - 1 ? 'Now' : formatShort(w.end).replace(/\s/, ' '), value: w.completion, detail: `${formatShort(w.start)}–${formatShort(w.end)}: ${w.completion === null ? 'no tasks' : `${w.completion}% · ${w.completed}/${w.planned} done`}` }))} />
        </ChartCard>

        <ChartCard
          title="By category"
          sub={`Planned tasks and completion, ${range === 7 ? 'last 7' : 'last 30'} days`}
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Planned</th>
                  <th className="num">Done</th>
                  <th className="num">Avg</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td className="num">{c.planned}</td>
                    <td className="num">{c.completed}</td>
                    <td className="num">{c.completion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          {cats.length ? <HBars data={cats.map((c) => ({ label: c.category, value: c.planned, max: cats[0].planned, right: `${c.completed}/${c.planned} done · ${c.completion}%` }))} /> : <p className="muted small">No tasks in this range.</p>}
        </ChartCard>

        <ChartCard
          title="30-day overview"
          sub="Each square is a day, shaded by completion"
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Completion</th>
                </tr>
              </thead>
              <tbody>
                {[...days30].reverse().map((d) => {
                  const m = dayMetrics(d, byDate.get(d));
                  return (
                    <tr key={d}>
                      <td>{formatMedium(d)}</td>
                      <td className="num">{m.completion === null ? '—' : `${m.completion}% (${m.completed}/${m.planned})`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          }
        >
          <div className="heatmap" style={{ marginBottom: 6 }}>
            {WEEKDAYS_SHORT.map((w) => (
              <div key={w} className="heat-dow">
                {w[0]}
              </div>
            ))}
          </div>
          <div className="heatmap">
            {Array.from({ length: firstPad }, (_, i) => (
              <div key={`p${i}`} />
            ))}
            {days30.map((d) => {
              const m = dayMetrics(d, byDate.get(d));
              const lv = heatLevel(m.completion);
              return (
                <button
                  key={d}
                  className={`heat-cell${lv >= 0 ? ` l${lv}` : ''}${d === today ? ' today' : ''}`}
                  style={{ background: lv < 0 ? 'var(--heat-0)' : `var(--heat-${lv})`, opacity: lv < 0 ? 0.55 : 1 }}
                  onClick={() => go(`history/${d}`)}
                  aria-label={`${formatMedium(d)}: ${m.completion === null ? 'nothing planned' : `${m.completion}% completion`}`}
                  title={`${formatMedium(d)}: ${m.completion === null ? 'nothing planned' : `${m.completion}%`}`}
                >
                  {parseISODate(d).getDate()}
                </button>
              );
            })}
          </div>
          <div className="legend" aria-hidden>
            <span>
              <i style={{ background: 'var(--heat-0)' }} />
              None
            </span>
            <span>
              <i style={{ background: 'var(--heat-1)' }} />
              1–39%
            </span>
            <span>
              <i style={{ background: 'var(--heat-2)' }} />
              40–69%
            </span>
            <span>
              <i style={{ background: 'var(--heat-3)' }} />
              70–89%
            </span>
            <span>
              <i style={{ background: 'var(--heat-4)' }} />
              90%+
            </span>
          </div>
        </ChartCard>

        <ChartCard
          title="Completion by weekday"
          sub="Average over the last 30 days"
          table={
            <table className="data-table">
              <thead>
                <tr>
                  <th>Weekday</th>
                  <th className="num">Days</th>
                  <th className="num">Avg</th>
                </tr>
              </thead>
              <tbody>
                {pattern.map((p) => (
                  <tr key={p.weekday}>
                    <td>{WEEKDAYS_LONG[p.weekday]}</td>
                    <td className="num">{p.days}</td>
                    <td className="num">{p.completion === null ? '—' : `${p.completion}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        >
          <PercentBars data={pattern.map((p) => ({ label: WEEKDAYS_SHORT[p.weekday], value: p.completion, detail: `${WEEKDAYS_LONG[p.weekday]}s: ${p.completion === null ? 'no data' : `${p.completion}% over ${p.days} day${p.days === 1 ? '' : 's'}`}` }))} />
        </ChartCard>
      </section>

      <section className="section" aria-labelledby="h-chronic">
        <div className="section-head">
          <h2 id="h-chronic">Consistently unfinished</h2>
        </div>
        {chronic.length ? (
          <div className="list">
            {chronic.map((c) => (
              <button key={c.task.id} className="list-item" onClick={() => go(`task/${c.task.id}`)}>
                <div className="grow">
                  <div className="title">{c.task.title}</div>
                  <div className="sub">
                    Unfinished on {c.daysUnfinished} of {c.daysPlanned} days · {c.task.progress}% now
                  </div>
                </div>
                <IconChevronRight className="chev" />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ margin: '0 2px' }}>
            Nothing has lingered for more than a day in the last 30 days.
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="h-obs">
        <div className="section-head">
          <h2 id="h-obs">Recurring obstacles</h2>
          <span className="muted small">from evening reviews</span>
        </div>
        {obstacles.length ? (
          <div className="card">
            <HBars data={obstacles.slice(0, 6).map((o) => ({ label: o.reason, value: o.count, max: obstacles[0].count, right: `${o.count}×` }))} />
          </div>
        ) : (
          <p className="muted small" style={{ margin: '0 2px' }}>
            When you note why something wasn't finished, patterns show up here.
          </p>
        )}
      </section>
    </div>
  );
}
