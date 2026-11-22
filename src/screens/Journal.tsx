import { useEffect, useRef, useState } from 'react';
import { formatLong, formatMedium, relativeDay } from '../lib/dates';
import * as repo from '../lib/repo';
import { go } from '../lib/router';
import type { JournalEntry } from '../lib/types';
import { IconCheck, IconChevronRight, IconTrash } from '../components/Icons';
import { TopBar } from '../components/ui';
import { selectDay, useStore } from '../state/store';

const PROMPTS: { key: keyof repo.JournalFields; q: string; ph: string }[] = [
  { key: 'accomplished', q: 'What did I accomplish today?', ph: 'Big or small — it counts.' },
  { key: 'notAccomplished', q: 'What did I fail to accomplish?', ph: 'Name it plainly, without judgement.' },
  { key: 'obstacles', q: 'What prevented me from completing certain tasks?', ph: 'Time, energy, interruptions, unclear steps…' },
  { key: 'learned', q: 'What did I learn?', ph: 'About the work, or about how I work.' },
  { key: 'differently', q: 'What should I do differently tomorrow?', ph: 'One concrete change.' },
  { key: 'grateful', q: 'What am I grateful for today?', ph: '' },
  { key: 'freeform', q: 'Free writing', ph: 'Anything else on your mind.' },
];

const EMPTY: repo.JournalFields = { accomplished: '', notAccomplished: '', obstacles: '', learned: '', differently: '', grateful: '', freeform: '' };

export function Journal({ date: dateParam }: { date?: string }) {
  const { data, today } = useStore();
  const date = dateParam && dateParam <= today ? dateParam : today;
  const past = [...data.journal].filter((j) => j.date !== date).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="screen">
      {dateParam ? <TopBar back="journal" title="Journal" /> : <TopBar title="Journal" />}
      <Editor key={date} date={date} existing={data.journal.find((j) => j.date === date)} />
      <section className="section" aria-labelledby="h-past">
        <div className="section-head">
          <h2 id="h-past">Previous entries</h2>
          <span className="muted small">{past.length}</span>
        </div>
        {past.length ? (
          <div className="list">
            {past.map((j) => (
              <button key={j.date} className="list-item" onClick={() => go(`journal/${j.date}`)}>
                <div className="grow">
                  <div className="title">{relativeDay(j.date, today) === formatMedium(j.date) ? formatMedium(j.date) : `${relativeDay(j.date, today)} · ${formatMedium(j.date)}`}</div>
                  <div className="sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {preview(j)}
                  </div>
                </div>
                <IconChevronRight className="chev" />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ margin: '0 2px' }}>
            Your reflections will collect here, one per day.
          </p>
        )}
      </section>
    </div>
  );
}

function preview(j: JournalEntry) {
  return [j.accomplished, j.learned, j.differently, j.freeform, j.grateful].find((x) => x.trim()) ?? '(empty)';
}

function Editor({ date, existing }: { date: string; existing?: JournalEntry }) {
  const { data, today, refresh, toast, confirm, run } = useStore();
  const [f, setF] = useState<repo.JournalFields>(() => ({ ...EMPTY, ...(existing ?? {}) }));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(existing ? 'saved' : 'idle');
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(f);
  latest.current = f;
  const dirty = useRef(false);

  const flush = async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setStatus('saving');
    try {
      await repo.saveJournal(date, latest.current);
      setStatus('saved');
      refresh().catch(() => undefined);
    } catch {
      setStatus('error');
      toast('Could not save your journal entry.', 'error');
    }
  };

  // Save when leaving the screen or the app going to the background.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      clearTimeout(timer.current);
      flush();
    };
  }, []);

  const update = (k: keyof repo.JournalFields, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    dirty.current = true;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  };

  const items = selectDay(data, date);
  const done = items.filter((i) => (date === today ? i.task.progress : i.entry.endProgress) >= 100);
  const notDone = items.filter((i) => (date === today ? i.task.progress : i.entry.endProgress) < 100);

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="eyebrow">{formatLong(date)}</div>
          <span className="saved-ind" role="status" aria-live="polite">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? (
              <>
                <IconCheck width={13} height={13} /> Saved
              </>
            ) : status === 'error' ? 'Not saved' : ''}
          </span>
        </div>
        {items.length > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            {done.length > 0 && <div>✓ {done.map((i) => i.task.title).join(' · ')}</div>}
            {notDone.length > 0 && <div>○ {notDone.map((i) => i.task.title).join(' · ')}</div>}
          </div>
        )}
      </div>
      <section className="section">
        {PROMPTS.map((p) => (
          <label className="journal-q field" key={p.key}>
            <span className="label">{p.q}</span>
            <textarea className="textarea" value={f[p.key]} placeholder={p.ph} onChange={(e) => update(p.key, e.target.value)} onBlur={flush} style={{ minHeight: p.key === 'freeform' ? 140 : 84 }} />
          </label>
        ))}
        {existing && (
          <button
            className="btn ghost sm"
            onClick={async () => {
              if (await confirm({ title: 'Delete this entry?', message: `Your reflection for ${formatMedium(date)} will be removed.`, confirmLabel: 'Delete', danger: true })) {
                dirty.current = false;
                clearTimeout(timer.current);
                await run(() => repo.deleteJournal(date), 'Entry deleted');
                setF(EMPTY);
                setStatus('idle');
              }
            }}
          >
            <IconTrash /> Delete entry
          </button>
        )}
      </section>
    </>
  );
}
