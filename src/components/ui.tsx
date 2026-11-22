import { type ReactNode, useEffect, useId, useRef } from 'react';
import { IconChevronLeft } from './Icons';
import { back as goBack } from '../lib/router';

export function ProgressRing({ value, size = 96, stroke = 9, label, sub, track = 'var(--track)', color }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: string; track?: string; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const col = color ?? (v >= 100 ? 'var(--green)' : 'var(--gold)');
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(v)} percent${sub ? ` ${sub}` : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <div className="ring-label" aria-hidden>
        <b style={{ fontSize: size * 0.26 }}>{label ?? `${Math.round(v)}%`}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

export function Bar({ value, thin, label }: { value: number; thin?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`bar${v >= 100 ? ' done' : ''}${thin ? ' thin' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label ?? 'Progress'}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string | (() => void); right?: ReactNode }) {
  return (
    <header className="topbar">
      {back ? (
        <button className="back" onClick={() => (typeof back === 'function' ? back() : goBack(back))}>
          <IconChevronLeft width={22} height={22} /> Back
        </button>
      ) : (
        <h1>{title}</h1>
      )}
      {back && title ? <div style={{ fontWeight: 650 }}>{title}</div> : null}
      <div style={{ display: 'flex', gap: 4, minWidth: back ? 60 : undefined, justifyContent: 'flex-end' }}>{right}</div>
    </header>
  );
}

/** Bottom sheet modal with focus management, Escape to close and scroll locking. */
export function Sheet({ title, onClose, children, actions, label }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} aria-label={label} ref={ref} tabIndex={-1}>
        <div className="sheet-grip" aria-hidden />
        <div className="sheet-head">
          <button className="txt-btn" onClick={onClose}>
            Cancel
          </button>
          <h2 id={id}>{title}</h2>
          <div style={{ minWidth: 56, textAlign: 'right' }}>{actions}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="toggle">
      <input type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden />
    </span>
  );
}

export function PercentSlider({ value, onChange, onCommit, label = 'Completion percentage' }: { value: number; onChange: (v: number) => void; onCommit?: (v: number) => void; label?: string }) {
  const id = useId();
  const quick = [0, 25, 50, 75, 100];
  return (
    <div className="slider-wrap">
      <div className="slider-head">
        <label htmlFor={id} className="label" style={{ margin: 0 }}>
          {label}
        </label>
        <span className="slider-value" aria-hidden>
          {value}
          <span style={{ fontSize: 18, opacity: 0.6 }}>%</span>
        </span>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        style={{ ['--pct' as string]: `${value}%`, ['--fill-color' as string]: value >= 100 ? 'var(--green)' : 'var(--gold)' }}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        aria-valuetext={`${value} percent`}
      />
      <div className="quick-pcts" role="group" aria-label="Quick set">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            className={q === value ? 'on' : ''}
            onClick={() => {
              onChange(q);
              onCommit?.(q);
            }}
          >
            {q}%
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card empty-state">
      <div className="art">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}
