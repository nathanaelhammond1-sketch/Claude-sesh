import { useMemo, useState } from 'react';
import { buildAIPayloadPreview, suggestSubtasks } from '../lib/ai';
import { addDays, formatLong, relativeDay } from '../lib/dates';
import * as repo from '../lib/repo';
import { go } from '../lib/router';
import { parseRemainingWork } from '../lib/subtaskParse';
import { REASONS, type Review as ReviewT, type ReviewOutcome, type Task } from '../lib/types';
import { IconCheck, IconCircle, IconDoneCircle, IconHalf, IconJournal, IconMoon, IconPlus, IconSkip, IconSpark, IconX } from '../components/Icons';
import { EmptyState, Field, PercentSlider, ProgressRing, TopBar } from '../components/ui';
import { selectDay, useStore } from '../state/store';

interface Draft {
  outcome: ReviewOutcome | null;
  progress: number;
  remaining: string;
  reasons: string[];
  reasonNote: string;
  nextAction: string;
  suggestions: { id: number; title: string; include: boolean; ai?: boolean }[];
  subDue: 'tomorrow' | 'none';
}

let sid = 0;

export function Review({ date: dateParam }: { date?: string }) {
  const { data, today } = useStore();
  const date = dateParam && dateParam <= today ? dateParam : today;
  const items = useMemo(() => selectDay(data, date), [data, date]);
  const reviews = useMemo(() => new Map(data.reviews.filter((r) => r.date === date).map((r) => [r.taskId, r])), [data.reviews, date]);
  const [index, setIndex] = useState<number | null>(null); // null = overview
  const [summary, setSummary] = useState(false);

  // Order: unreviewed first, then skipped, then reviewed. The order is fixed when the
  // review opens so tasks don't jump around as they're saved.
  const order = useMemo(() => {
    const rank = (t: Task) => {
      const r = reviews.get(t.id);
      return !r ? 0 : r.outcome === 'skipped' ? 1 : 2;
    };
    return [...items].sort((a, b) => rank(a.task) - rank(b.task)).map((i) => i.task.id);
  }, [items.length, date]);
  const ordered = order.map((id) => items.find((i) => i.task.id === id)).filter((x): x is (typeof items)[number] => !!x);

  const pending = items.filter((i) => !reviews.get(i.task.id) || reviews.get(i.task.id)!.outcome === 'skipped');

  if (!items.length) {
    return (
      <div className="screen">
        <TopBar back="today" title="Evening review" />
        <EmptyState icon={<IconMoon />} title="Nothing to review" body={`No tasks were planned for ${relativeDay(date, today).toLowerCase()}. Plan a few intentions and come back tonight.`} action={<button className="btn primary" onClick={() => go('today')}>Back to Today</button>} />
      </div>
    );
  }

  if (summary) return <Summary date={date} onBack={() => setSummary(false)} />;

  if (index === null) {
    return (
      <div className="screen">
        <TopBar back="today" title="Evening review" />
        <div className="card" style={{ textAlign: 'center', padding: '22px 18px' }}>
          <div className="eyebrow">{formatLong(date)}</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 25, margin: '8px 0 6px' }}>How much did you actually accomplish?</h2>
          <p className="muted" style={{ margin: '0 0 16px' }}>
            Be honest about what you planned and what you did. Unfinished work isn't failure — it's information for tomorrow.
          </p>
          <button className="btn gold block" onClick={() => setIndex(0)}>
            {pending.length === items.length ? `Review ${items.length} task${items.length === 1 ? '' : 's'}` : pending.length ? `Continue — ${pending.length} left` : 'Review again'}
          </button>
          {pending.length === 0 && (
            <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => setSummary(true)}>
              See summary
            </button>
          )}
        </div>
        <div className="section list">
          {ordered.map((it, i) => {
            const r = reviews.get(it.task.id);
            return (
              <button key={it.task.id} className="list-item" onClick={() => setIndex(i)}>
                <span className="check" aria-hidden style={{ borderColor: r && r.outcome !== 'skipped' ? 'var(--green)' : undefined, background: r && r.outcome !== 'skipped' ? 'var(--green)' : undefined }}>
                  {r && r.outcome !== 'skipped' && <IconCheck style={{ opacity: 1 }} />}
                </span>
                <div className="grow">
                  <div className="title">{it.task.title}</div>
                  <div className="sub">{r ? (r.outcome === 'skipped' ? 'Skipped — review later' : `${labelOf(r.outcome)} · ${r.progress}%`) : `Not reviewed · ${it.task.progress}%`}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const it = ordered[index];
  if (!it) return <Summary date={date} onBack={() => setIndex(null)} />;
  return (
    <ReviewStep
      key={it.task.id + date}
      date={date}
      task={it.task}
      existing={reviews.get(it.task.id)}
      openSubtasks={data.subtasks.filter((s) => s.taskId === it.task.id && !s.done).map((s) => s.title)}
      step={index}
      total={ordered.length}
      states={ordered.map((o) => reviews.get(o.task.id)?.outcome)}
      onPrev={() => setIndex(index === 0 ? null : index - 1)}
      onNext={() => {
        if (index + 1 >= ordered.length) setSummary(true);
        else setIndex(index + 1);
      }}
    />
  );
}

const labelOf = (o: ReviewOutcome) => ({ completed: 'Completed', partial: 'Partially completed', not_started: 'Not started', skipped: 'Skipped' })[o];

function ReviewStep({ date, task, existing, openSubtasks, step, total, states, onPrev, onNext }: { date: string; task: Task; existing?: ReviewT; openSubtasks: string[]; step: number; total: number; states: (ReviewOutcome | undefined)[]; onPrev: () => void; onNext: () => void }) {
  const { run, settings, today } = useStore();
  const [d, setD] = useState<Draft>(() => ({
    outcome: existing && existing.outcome !== 'skipped' ? existing.outcome : null,
    progress: existing?.progress ?? (task.progress > 0 && task.progress < 100 ? task.progress : 50),
    remaining: existing?.remaining ?? '',
    reasons: existing?.reasons ?? [],
    reasonNote: existing?.reasonNote ?? '',
    nextAction: existing?.nextAction ?? '',
    suggestions: [],
    subDue: 'tomorrow',
  }));
  const [aiState, setAiState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [aiError, setAiError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const unfinished = d.outcome === 'partial' || d.outcome === 'not_started';

  function regenerateFromText(text: string) {
    const parsed = parseRemainingWork(text);
    setD((x) => {
      const ai = x.suggestions.filter((s) => s.ai);
      const keepState = new Map(x.suggestions.map((s) => [s.title.toLowerCase(), s.include]));
      return { ...x, remaining: text, suggestions: [...parsed.map((title) => ({ id: ++sid, title, include: keepState.get(title.toLowerCase()) ?? true })), ...ai] };
    });
  }

  const aiAvailable = settings.aiEnabled && !!settings.aiApiKey;
  const payload = buildAIPayloadPreview({ taskTitle: task.title, taskDescription: task.description, progress: d.outcome === 'partial' ? d.progress : task.progress, remaining: d.remaining, reason: [...d.reasons, d.reasonNote].filter(Boolean).join('; ') });

  async function runAI() {
    setAiState('loading');
    setAiError('');
    try {
      const list = await suggestSubtasks(settings.aiApiKey, { taskTitle: task.title, taskDescription: task.description, progress: d.outcome === 'partial' ? d.progress : task.progress, remaining: d.remaining, reason: [...d.reasons, d.reasonNote].filter(Boolean).join('; ') });
      setD((x) => {
        const existingTitles = new Set(x.suggestions.map((s) => s.title.toLowerCase()));
        // AI suggestions start unchecked — the user approves each one.
        return { ...x, suggestions: [...x.suggestions, ...list.filter((t) => !existingTitles.has(t.toLowerCase())).map((title) => ({ id: ++sid, title, include: false, ai: true }))] };
      });
      setAiState('idle');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI suggestion failed.');
      setAiState('idle');
    }
  }

  async function save(outcome: ReviewOutcome) {
    setSaving(true);
    const subs = unfinished && outcome !== 'skipped' ? d.suggestions.filter((s) => s.include && s.title.trim()).map((s) => ({ title: s.title, dueDate: d.subDue === 'tomorrow' ? addDays(date, 1) : null, priority: task.priority })) : [];
    const res = await run(
      () => repo.saveReview(date, task.id, { outcome, progress: d.progress, remaining: unfinished ? d.remaining : '', reasons: unfinished ? d.reasons : [], reasonNote: unfinished ? d.reasonNote : '', nextAction: d.nextAction, newSubtasks: subs }),
      outcome === 'skipped' ? 'Skipped — you can come back to it' : subs.length ? `Saved · ${subs.length} subtask${subs.length === 1 ? '' : 's'} created` : 'Saved',
    );
    setSaving(false);
    if (res) onNext();
  }

  return (
    <div className="screen">
      <TopBar back={onPrev} title={`${step + 1} of ${total}`} />
      <div className="stepper" aria-hidden>
        {states.map((s, i) => (
          <span key={i} className={i === step ? 'on' : s && s !== 'skipped' ? 'done' : s === 'skipped' ? 'skip' : ''} />
        ))}
      </div>

      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <ProgressRing value={task.progress} size={60} stroke={6} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">{relativeDay(date, today)}'s task</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 600, lineHeight: 1.25, wordBreak: 'break-word' }}>{task.title}</div>
          {openSubtasks.length > 0 && <div className="muted tiny">{openSubtasks.length} open subtask{openSubtasks.length === 1 ? '' : 's'}</div>}
        </div>
      </div>

      <section className="section" aria-labelledby="q1">
        <h3 id="q1" style={{ margin: '0 2px 10px', fontSize: 17 }}>
          1. Did you complete this task?
        </h3>
        <div className="outcome-grid" role="group" aria-labelledby="q1">
          <button className="outcome o-completed" aria-pressed={d.outcome === 'completed'} onClick={() => set({ outcome: 'completed' })}>
            <IconDoneCircle /> Completed
          </button>
          <button className="outcome o-partial" aria-pressed={d.outcome === 'partial'} onClick={() => set({ outcome: 'partial' })}>
            <IconHalf /> Partially
          </button>
          <button className="outcome o-not_started" aria-pressed={d.outcome === 'not_started'} onClick={() => set({ outcome: 'not_started' })}>
            <IconCircle /> Not started
          </button>
        </div>
      </section>

      {d.outcome === 'completed' && (
        <div className="banner green section">
          <IconCheck />
          <div className="grow small">
            <b>Marked 100%.</b>
            {openSubtasks.length ? 'Open subtasks stay as they are — check them off if they’re done.' : 'Finished work stays in your history.'}
          </div>
        </div>
      )}

      {d.outcome === 'partial' && (
        <section className="section card" aria-labelledby="q2">
          <h3 id="q2" style={{ margin: '0 0 4px', fontSize: 16 }}>
            2. What percentage did you accomplish?
          </h3>
          <PercentSlider value={d.progress} onChange={(v) => set({ progress: Math.min(95, Math.max(5, v)) })} label="Overall completion" />
          <p className="hint">Started the day at {task.progress === d.progress ? `${task.progress}%` : `${task.progress}%; now ${d.progress}%`}.</p>
        </section>
      )}

      {unfinished && (
        <>
          <section className="section card" aria-labelledby="q3">
            <h3 id="q3" style={{ margin: '0 0 4px', fontSize: 16 }}>
              {d.outcome === 'partial' ? '3.' : '2.'} What remains unfinished?
            </h3>
            <p className="hint" style={{ margin: '0 0 8px' }}>
              Describe it in your own words — one item per line works best. DAYMARK turns each into a subtask you can edit.
            </p>
            <textarea className="textarea" value={d.remaining} onChange={(e) => regenerateFromText(e.target.value)} placeholder={'e.g.\nFinish financial projections\nReview executive summary\nAdd competitor analysis'} aria-label="What remains unfinished" />
            {openSubtasks.length > 0 && <p className="hint">Already open: {openSubtasks.slice(0, 4).join(' · ')}</p>}

            {(d.suggestions.length > 0 || aiAvailable) && (
              <div style={{ marginTop: 12 }}>
                <div className="label">New subtasks — check the ones to create</div>
                {d.suggestions.map((s) => (
                  <div className="suggestion" key={s.id}>
                    <button className="check" role="checkbox" aria-checked={s.include} aria-label={`Include "${s.title}"`} onClick={() => set({ suggestions: d.suggestions.map((x) => (x.id === s.id ? { ...x, include: !x.include } : x)) })}>
                      <IconCheck />
                    </button>
                    <input className="input" value={s.title} aria-label="Subtask title" onChange={(e) => set({ suggestions: d.suggestions.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
                    {s.ai && (
                      <span className="pill gold" title="Suggested by AI">
                        AI
                      </span>
                    )}
                    <button className="icon-btn" aria-label={`Remove "${s.title}"`} onClick={() => set({ suggestions: d.suggestions.filter((x) => x.id !== s.id) })}>
                      <IconX />
                    </button>
                  </div>
                ))}
                <div className="btn-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn ghost sm" onClick={() => set({ suggestions: [...d.suggestions, { id: ++sid, title: '', include: true }] })}>
                    <IconPlus /> Add subtask
                  </button>
                  {aiAvailable && aiState === 'idle' && (
                    <button className="btn ghost sm" onClick={() => setAiState('confirm')}>
                      <IconSpark /> Suggest with AI
                    </button>
                  )}
                </div>
                {d.suggestions.length > 0 && (
                  <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
                    <span className="small muted" style={{ flex: 'none' }}>
                      Due
                    </span>
                    <div className="segmented" role="group" aria-label="Subtask due date">
                      <button aria-pressed={d.subDue === 'tomorrow'} onClick={() => set({ subDue: 'tomorrow' })}>
                        Next day
                      </button>
                      <button aria-pressed={d.subDue === 'none'} onClick={() => set({ subDue: 'none' })}>
                        No date
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {aiState === 'confirm' && (
              <div className="banner info" style={{ marginTop: 12, display: 'block' }} role="dialog" aria-label="Confirm AI request">
                <b>Send this to Anthropic's AI?</b>
                <div className="small" style={{ margin: '4px 0 8px' }}>
                  Only the text below leaves your device, sent directly to api.anthropic.com with your API key. Suggestions arrive unchecked for you to approve.
                </div>
                <div className="code">{payload}</div>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn ghost sm" onClick={() => setAiState('idle')}>
                    Cancel
                  </button>
                  <button className="btn primary sm" onClick={runAI} disabled={!d.remaining.trim() && !task.description}>
                    Send
                  </button>
                </div>
              </div>
            )}
            {aiState === 'loading' && (
              <div className="small muted" style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }} role="status">
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Asking for suggestions…
              </div>
            )}
            {aiError && (
              <div className="error-text" role="alert">
                {aiError}
              </div>
            )}
          </section>

          <section className="section card" aria-labelledby="q4">
            <h3 id="q4" style={{ margin: '0 0 8px', fontSize: 16 }}>
              {d.outcome === 'partial' ? '4.' : '3.'} Why wasn't it completed?
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-labelledby="q4">
              {REASONS.map((r) => (
                <button key={r} className="chip" aria-pressed={d.reasons.includes(r)} onClick={() => set({ reasons: d.reasons.includes(r) ? d.reasons.filter((x) => x !== r) : [...d.reasons, r] })}>
                  {r}
                </button>
              ))}
            </div>
            <textarea className="textarea" style={{ marginTop: 10, minHeight: 64 }} placeholder="Anything else? (optional)" value={d.reasonNote} onChange={(e) => set({ reasonNote: e.target.value })} aria-label="Reason details" />
          </section>
        </>
      )}

      {d.outcome && (
        <section className="section card">
          <Field label={`${d.outcome === 'completed' ? '2' : d.outcome === 'partial' ? '5' : '4'}. ${d.outcome === 'completed' ? 'Any follow-up action? (optional)' : 'What is the next action required?'}`}>
            <input className="input" placeholder={d.outcome === 'completed' ? 'e.g. Send it to the client' : 'The very next physical step'} value={d.nextAction} onChange={(e) => set({ nextAction: e.target.value })} />
          </Field>
        </section>
      )}

      <div className="section stack">
        <button className="btn primary block" disabled={!d.outcome || saving} onClick={() => d.outcome && save(d.outcome)}>
          {step + 1 >= total ? 'Save & finish' : 'Save & next'}
        </button>
        <button className="btn ghost block" disabled={saving} onClick={() => save('skipped')}>
          <IconSkip /> Skip for now
        </button>
      </div>
    </div>
  );
}

function Summary({ date, onBack }: { date: string; onBack: () => void }) {
  const { data, run, today } = useStore();
  const items = selectDay(data, date);
  const reviews = data.reviews.filter((r) => r.date === date);
  const byOutcome = (o: ReviewOutcome) => reviews.filter((r) => r.outcome === o && items.some((i) => i.task.id === r.taskId)).length;
  const completion = items.length ? Math.round(items.reduce((a, i) => a + (date === today ? i.task.progress : i.entry.endProgress), 0) / items.length) : 0;
  const created = reviews.reduce((a, r) => a + r.createdSubtaskIds.length, 0);
  const skipped = byOutcome('skipped');
  const unreviewed = items.filter((i) => !reviews.some((r) => r.taskId === i.task.id)).length;
  const isDone = data.days.find((d) => d.date === date)?.reviewCompletedAt;

  return (
    <div className="screen">
      <TopBar back={onBack} title="Summary" />
      <div className="card" style={{ textAlign: 'center', padding: '24px 18px' }}>
        <div className="eyebrow">{formatLong(date)}</div>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
          <ProgressRing value={completion} size={120} stroke={10} sub="of plan" />
        </div>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 23, margin: '0 0 6px' }}>{completion >= 80 ? 'A strong day.' : completion >= 50 ? 'Real progress made.' : 'Every honest review counts.'}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {byOutcome('completed')} completed · {byOutcome('partial')} partial · {byOutcome('not_started')} not started
          {created ? ` · ${created} new subtask${created === 1 ? '' : 's'}` : ''}
        </p>
        {(skipped > 0 || unreviewed > 0) && (
          <p className="small" style={{ color: 'var(--gold-ink)', margin: '10px 0 0' }}>
            {skipped + unreviewed} task{skipped + unreviewed === 1 ? '' : 's'} still to review — you can return any time.
          </p>
        )}
      </div>
      <p className="muted small" style={{ textAlign: 'center', margin: '14px 8px' }}>
        Unfinished tasks and open subtasks will carry forward to tomorrow automatically, with their progress intact.
      </p>
      <div className="stack">
        <button
          className="btn gold block"
          onClick={async () => {
            if (!isDone) await run(() => repo.markDayReviewed(date));
            go(date === today ? 'journal' : `journal/${date}`);
          }}
        >
          <IconJournal /> {isDone ? 'Open' : 'Finish & write'} reflection
        </button>
        <button
          className="btn ghost block"
          onClick={async () => {
            if (!isDone) await run(() => repo.markDayReviewed(date), 'Review saved');
            go('today');
          }}
        >
          {isDone ? 'Back to Today' : 'Finish review'}
        </button>
      </div>
    </div>
  );
}
