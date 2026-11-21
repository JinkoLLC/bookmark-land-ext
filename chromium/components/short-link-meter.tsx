import { shortLinkMeter, type ShortLinkUsage } from "@/utils/short-link";

const MUTED = "text-neutral-500 dark:text-neutral-400";

/** The month's short links: how many are used, how many are left, and a bar. */
export function ShortLinkMeter({ usage }: { usage: ShortLinkUsage }) {
  const meter = shortLinkMeter(usage);
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className={MUTED}>{meter.usedLine}</span>
        <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">{meter.leftLine}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Short links used this month"
        aria-valuemin={0}
        aria-valuemax={meter.monthly}
        aria-valuenow={meter.used}
        aria-valuetext={`${meter.usedLine}, ${meter.leftLine}`}
        className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
      >
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${meter.fill * 100}%` }} />
      </div>
      {meter.inUse && <span className={MUTED}>{meter.inUse}</span>}
    </div>
  );
}
