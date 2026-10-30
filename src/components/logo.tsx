import { cn } from "@/lib/utils";

export function Logo({ dark = false, compact = false, className }: { dark?: boolean; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-brand-500 shadow-[0_8px_20px_-10px_rgba(32,157,128,0.9)]">
        <svg viewBox="0 0 40 40" className="size-8" fill="none" aria-hidden="true">
          <path d="M9 20.5h22c0 7.4-4.9 11.7-11 11.7S9 27.9 9 20.5Z" fill="#fffdf8" />
          <path d="M12 17.3c1.3-1.2 1.3-2.9 0-4.1M18 17.3c1.3-1.2 1.3-2.9 0-4.1M24 17.3c1.3-1.2 1.3-2.9 0-4.1" stroke="#f2c14e" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M27 9.2c2.6-.2 4.3 1 4.7 3.2-2.3.4-4.1-.7-4.7-3.2Z" fill="#b5e7d6" />
          <path d="M14 32.2h12" stroke="#b5e7d6" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className={cn("block font-display text-[1.15rem] tracking-[-0.03em]", dark ? "text-white" : "text-ink")}>
            Comedor
          </span>
          <span className={cn("mt-0.5 block text-[9px] font-extrabold uppercase tracking-[0.32em]", dark ? "text-brand-200" : "text-brand-600")}>
            Digital
          </span>
        </span>
      ) : null}
    </div>
  );
}
