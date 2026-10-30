"use client";

import { cn } from "@/lib/utils";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 148,
  thickness = 16,
  className,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let cursor = 0;
  const stops: string[] = [];
  for (const segment of segments) {
    const start = total === 0 ? 0 : (cursor / total) * 100;
    cursor += segment.value;
    const end = total === 0 ? 0 : (cursor / total) * 100;
    stops.push(`${segment.color} ${start}% ${end}%`);
  }
  const background = total === 0 ? "#e5dfd2" : `conic-gradient(${stops.join(", ")})`;

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <div
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size, background }}
        role="img"
        aria-label={`Distribución: ${segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}`}
      >
        <div
          className="absolute rounded-full bg-card shadow-[inset_0_0_0_1px_rgba(229,223,210,0.7)]"
          style={{ inset: thickness }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-extrabold tracking-tight text-ink">{centerValue ?? total}</span>
          {centerLabel ? <span className="mt-0.5 max-w-[6rem] text-[9px] font-bold uppercase leading-tight tracking-[0.1em] text-muted">{centerLabel}</span> : null}
        </div>
      </div>
      <div className="w-full space-y-2">
        {segments.map((segment) => {
          const percentage = total === 0 ? 0 : Math.round((segment.value / total) * 100);
          return (
            <div key={segment.label} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{segment.label}</span>
              <span className="text-[11px] font-bold text-ink">{segment.value}</span>
              <span className="w-8 text-right text-[9px] text-muted">{percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  color = "#209d80",
  height = 150,
  valueSuffix = "",
}: {
  data: Array<{ label: string; value: number; hint?: string }>;
  color?: string;
  height?: number;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((item) => {
        const percentage = Math.max(4, (item.value / max) * 100);
        return (
          <div key={item.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[9px] font-bold text-muted opacity-0 transition group-hover:opacity-100">
              {item.value}
              {valueSuffix}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-lg transition-all duration-700 group-hover:opacity-80"
                style={{ height: `${percentage}%`, background: color }}
                title={`${item.label}: ${item.value}${valueSuffix}`}
              />
            </div>
            <span className="max-w-full truncate text-[8px] font-semibold uppercase tracking-wide text-muted">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MiniBar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "citrus" | "clay" | "sky" }) {
  const tones = { brand: "#209d80", citrus: "#f2c14e", clay: "#df7a5e", sky: "#5ca8bc" };
  const percentage = max === 0 ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percentage}%`, background: tones[tone] }} />
    </div>
  );
}

export function HourlyStrip({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-10 items-end gap-1", className)}>
      {values.map((value, index) => (
        <div
          key={index}
          className="flex-1 rounded-sm bg-brand-200 transition hover:bg-brand-500"
          style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
          title={`${value} consumos`}
        />
      ))}
    </div>
  );
}
