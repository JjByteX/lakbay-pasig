import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import type { DayPoint } from "@/lib/admin-dashboard";

// Building blocks for pages/admin-dashboard.tsx. Charts are plain SVG: the app
// has no chart library and a PWA should not gain one for two small charts.
// Colors come from the theme tokens only (--primary for data, --border for the
// grid, --muted-foreground for text), so light and dark both work.

// A titled region: heading row above, one bordered container below. The
// container is the only box, nothing nests inside another card. `bodyRef` goes
// to useAutoPageSize so a list can count how many rows fit.
export function Pane({
  title,
  action,
  children,
  bodyRef,
  className,
}: Readonly<{
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  className?: string;
}>) {
  return (
    <section className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex h-8 shrink-0 items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

// Filter-style segmented buttons (date range, chart metric). Real buttons with
// aria-pressed rather than tabs: they filter, they do not switch panels.
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}>) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 items-center rounded-md bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-6 items-center rounded-sm px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            option.value === value
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A share of a whole: 8px track, fill in the accent. */
export function Meter({ value, label }: Readonly<{ value: number; label: string }>) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2 w-full overflow-hidden rounded-lg bg-primary/15"
    >
      <div className="h-full rounded-lg bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Tiny trend line for a figure. Grey line, accent end dot (the current period). */
export function Sparkline({ values, label }: Readonly<{ values: number[]; label: string }>) {
  const W = 96;
  const H = 32;
  const PAD = 4;
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (values.length - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="h-8 w-24 shrink-0">
      <polyline
        points={points}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-muted-foreground/50"
      />
      <circle cx={x(last)} cy={y(values[last])} r={3} className="fill-primary stroke-card" strokeWidth={2} />
    </svg>
  );
}

// Round tick values: about four steps, whole numbers only (these are counts).
function niceScale(max: number): { step: number; top: number } {
  const rough = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 1);
  return { step, top: Math.ceil(Math.max(max, 1) / step) * step };
}

const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

/**
 * One series per day as a line over a faint area. A crosshair snaps to the
 * nearest day on hover and on arrow keys, and a visually hidden table carries
 * the same numbers for screen readers. Fills its parent.
 */
export function AreaChart({
  points,
  noun,
}: Readonly<{ points: DayPoint[]; noun: { one: string; other: string } }>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = points.length;
  const { step, top } = niceScale(Math.max(...points.map((p) => p.value)));
  const plotW = Math.max(0, size.w - PAD.left - PAD.right);
  const plotH = Math.max(0, size.h - PAD.top - PAD.bottom);
  const x = (i: number) => PAD.left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64))));

  const nearest = (clientX: number): number => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n < 2) return 0;
    const ratio = (clientX - rect.left - PAD.left) / plotW;
    return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const from = active ?? n - 1;
    const next =
      event.key === "ArrowLeft" ? from - 1 : event.key === "ArrowRight" ? from + 1 : event.key === "Home" ? 0 : event.key === "End" ? n - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(n - 1, next)));
  };

  const hovered = active === null ? null : points[active];
  const tooltipLeft = active === null ? 0 : Math.max(8, Math.min(size.w - 120, x(active) - 52));

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {size.w > 0 && (
        <svg
          width={size.w}
          height={size.h}
          role="img"
          aria-label={`${noun.other} per day, ${points[0].label} to ${points[n - 1].label}. Use the left and right arrow keys to read each day.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(nearest(e.clientX))}
          onPointerLeave={() => setActive(null)}
          className="block rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={size.w - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-xs">
                {t}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (n - 1 - i) % labelEvery === 0 ? (
              <text key={p.key} x={x(i)} y={size.h - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground text-xs">
                {p.label}
              </text>
            ) : null
          )}
          <path d={area} className="fill-primary/10" />
          <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" />
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} className="stroke-muted-foreground/40" strokeWidth={1} />
          )}
          <circle cx={x(active ?? n - 1)} cy={y(points[active ?? n - 1].value)} r={4} className="fill-primary stroke-card" strokeWidth={2} />
        </svg>
      )}
      {hovered && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: tooltipLeft }}
        >
          <p className="font-semibold text-foreground">
            {hovered.value} {hovered.value === 1 ? noun.one : noun.other}
          </p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}
      <table className="sr-only">
        <caption>{noun.other} per day</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.key}>
              <th scope="row">{p.label}</th>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
