import { type ReactNode, useState } from 'react';

/**
 * Lightweight SVG charts (no charting dependency — keeps the offline bundle small).
 * Thin marks, rounded data-ends anchored to the baseline, recessive grid,
 * hover/tap tooltips, and a table view for every chart.
 */

interface Tip {
  x: number;
  y: number;
  text: string;
}

function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  return { tip, setTip };
}

function TipBox({ tip, width, height }: { tip: Tip | null; width: number; height: number }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: `${(tip.x / width) * 100}%`, top: `${(tip.y / height) * 100}%` }} role="status">
      {tip.text}
    </div>
  );
}

/** Rounded-top bar path anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function ChartCard({ title, sub, children, table }: { title: string; sub?: string; children: ReactNode; table: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          {sub && <div className="muted tiny">{sub}</div>}
        </div>
        <button className="table-toggle" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Chart' : 'Table'}
        </button>
      </div>
      {showTable ? table : children}
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number | null;
  detail?: string;
  highlight?: boolean;
}

/** Single-series percentage bars (0–100). */
export function PercentBars({ data, height = 170 }: { data: BarDatum[]; height?: number }) {
  const W = 340,
    H = height,
    top = 18,
    bottom = 24,
    left = 26;
  const plotH = H - top - bottom;
  const step = (W - left) / data.length;
  const bw = Math.min(26, step * 0.55);
  const { tip, setTip } = useTip();
  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${d.value ?? 'no tasks'}${d.value !== null ? '%' : ''}`).join(', ')}`}>
        {[0, 50, 100].map((g) => {
          const y = top + plotH - (g / 100) * plotH;
          return (
            <g key={g}>
              <line x1={left} x2={W} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} strokeDasharray={g === 0 ? undefined : '2 4'} />
              <text x={left - 6} y={y + 3.5} textAnchor="end">
                {g}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = left + step * i + step / 2;
          const v = d.value ?? 0;
          const h = (v / 100) * plotH;
          const y = top + plotH - h;
          return (
            <g key={i}>
              {d.value !== null && <path d={barPath(cx - bw / 2, y, bw, Math.max(h, 2))} fill={d.highlight ? 'var(--chart-line)' : 'var(--chart-done)'} />}
              {d.value === null && <circle cx={cx} cy={top + plotH - 3} r={2} fill="var(--line-strong)" />}
              {d.value !== null && (
                <text className="val" x={cx} y={y - 5} textAnchor="middle">
                  {v}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" style={{ fontWeight: d.highlight ? 700 : undefined }}>
                {d.label}
              </text>
              <rect
                x={cx - step / 2}
                y={top}
                width={step}
                height={plotH + bottom}
                fill="transparent"
                onMouseEnter={() => setTip({ x: cx, y: Math.max(top, y), text: d.detail ?? `${d.label}: ${d.value === null ? 'no tasks planned' : `${v}%`}` })}
                onClick={() => setTip({ x: cx, y: Math.max(top, y), text: d.detail ?? `${d.label}: ${d.value === null ? 'no tasks planned' : `${v}%`}` })}
              />
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} width={W} height={H} />
    </div>
  );
}

export interface StackDatum {
  label: string;
  done: number;
  open: number;
  highlight?: boolean;
}

/** Completed vs incomplete task counts per day (stacked, 2px surface gap between segments). */
export function StackedCounts({ data, height = 170 }: { data: StackDatum[]; height?: number }) {
  const W = 340,
    H = height,
    top = 16,
    bottom = 24,
    left = 22;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...data.map((d) => d.done + d.open));
  const step = (W - left) / data.length;
  const bw = Math.min(26, step * 0.55);
  const { tip, setTip } = useTip();
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Stacked bars: ${data.map((d) => `${d.label} ${d.done} completed, ${d.open} incomplete`).join('; ')}`}>
        {ticks.map((g) => {
          const y = top + plotH - (g / max) * plotH;
          return (
            <g key={g}>
              <line x1={left} x2={W} y1={y} y2={y} stroke="var(--chart-grid)" strokeDasharray={g === 0 ? undefined : '2 4'} />
              <text x={left - 6} y={y + 3.5} textAnchor="end">
                {g}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = left + step * i + step / 2;
          const hd = (d.done / max) * plotH;
          const ho = (d.open / max) * plotH;
          const base = top + plotH;
          const gap = d.done && d.open ? 2 : 0;
          const text = `${d.label}: ${d.done} completed, ${d.open} incomplete`;
          return (
            <g key={i}>
              {d.done > 0 && <path d={barPath(cx - bw / 2, base - hd, bw, hd, d.open ? 0 : 4)} fill="var(--chart-done)" />}
              {d.open > 0 && <path d={barPath(cx - bw / 2, base - hd - ho, bw, Math.max(0, ho - gap))} fill="var(--chart-open)" />}
              {d.done + d.open > 0 && (
                <text className="val" x={cx} y={base - hd - ho - 5} textAnchor="middle">
                  {d.done}/{d.done + d.open}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" style={{ fontWeight: d.highlight ? 700 : undefined }}>
                {d.label}
              </text>
              <rect x={cx - step / 2} y={top} width={step} height={plotH + bottom} fill="transparent" onMouseEnter={() => setTip({ x: cx, y: base - hd - ho, text })} onClick={() => setTip({ x: cx, y: base - hd - ho, text })} />
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} width={W} height={H} />
      <div className="legend" aria-hidden>
        <span>
          <i style={{ background: 'var(--chart-done)' }} />
          Completed
        </span>
        <span>
          <i style={{ background: 'var(--chart-open)' }} />
          Incomplete
        </span>
      </div>
    </div>
  );
}

export interface LineDatum {
  label: string;
  value: number | null;
  detail?: string;
}

/** Single-series line (0–100) with crosshair tooltip. Gaps where there's no data. */
export function TrendLine({ data, height = 160 }: { data: LineDatum[]; height?: number }) {
  const W = 340,
    H = height,
    top = 18,
    bottom = 24,
    left = 26,
    right = 10;
  const plotH = H - top - bottom;
  const step = (W - left - right) / Math.max(1, data.length - 1);
  const xs = data.map((_, i) => left + step * i);
  const ys = data.map((d) => (d.value === null ? null : top + plotH - (d.value / 100) * plotH));
  const { tip, setTip } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  let path = '';
  ys.forEach((y, i) => {
    if (y === null) return;
    path += `${path && ys[i - 1] !== null ? 'L' : 'M'}${xs[i]},${y}`;
  });
  const lastIdx = ys.map((y, i) => (y === null ? -1 : i)).filter((i) => i >= 0).pop();
  return (
    <div className="chart" onMouseLeave={() => (setTip(null), setHover(null))}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend: ${data.map((d) => `${d.label} ${d.value ?? 'none'}`).join(', ')}`}>
        {[0, 50, 100].map((g) => {
          const y = top + plotH - (g / 100) * plotH;
          return (
            <g key={g}>
              <line x1={left} x2={W - right} y1={y} y2={y} stroke="var(--chart-grid)" strokeDasharray={g === 0 ? undefined : '2 4'} />
              <text x={left - 6} y={y + 3.5} textAnchor="end">
                {g}
              </text>
            </g>
          );
        })}
        {hover !== null && <line x1={xs[hover]} x2={xs[hover]} y1={top} y2={top + plotH} stroke="var(--line-strong)" />}
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {ys.map((y, i) =>
          y === null ? null : <circle key={i} cx={xs[i]} cy={y} r={hover === i || i === lastIdx ? 5 : 3.5} fill="var(--chart-line)" stroke="var(--surface)" strokeWidth={2} />,
        )}
        {lastIdx !== undefined && (
          <text className="val" x={xs[lastIdx]} y={(ys[lastIdx] ?? 0) - 9} textAnchor="middle">
            {data[lastIdx].value}%
          </text>
        )}
        {data.map((d, i) => (
          <text key={i} x={xs[i]} y={H - 6} textAnchor="middle">
            {d.label}
          </text>
        ))}
        {data.map((d, i) => (
          <rect
            key={`h${i}`}
            x={xs[i] - step / 2}
            y={top}
            width={step}
            height={plotH + bottom}
            fill="transparent"
            onMouseEnter={() => {
              setHover(i);
              setTip({ x: xs[i], y: ys[i] ?? top + plotH, text: d.detail ?? `${d.label}: ${d.value === null ? 'no data' : `${d.value}%`}` });
            }}
            onClick={() => {
              setHover(i);
              setTip({ x: xs[i], y: ys[i] ?? top + plotH, text: d.detail ?? `${d.label}: ${d.value === null ? 'no data' : `${d.value}%`}` });
            }}
          />
        ))}
      </svg>
      <TipBox tip={tip} width={W} height={H} />
    </div>
  );
}

export interface HBarDatum {
  label: string;
  value: number;
  max: number;
  right: string;
}

/** Horizontal bars with direct labels (category breakdown). */
export function HBars({ data }: { data: HBarDatum[] }) {
  return (
    <div role="list">
      {data.map((d) => (
        <div key={d.label} role="listitem" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 5 }}>
            <span style={{ fontWeight: 600 }}>{d.label}</span>
            <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {d.right}
            </span>
          </div>
          <div className="bar" aria-hidden>
            <span style={{ width: `${(d.value / Math.max(1, d.max)) * 100}%`, background: 'var(--chart-done)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
