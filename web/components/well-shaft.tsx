import { cn } from "@/lib/utils";

/**
 * The signature element: a persistent shaft of candlelight descending from the
 * search field (the well's mouth) into the dark. Present in every state, full
 * or empty. Pure CSS, no motion, so it costs nothing and respects reduced-motion
 * by simply not moving.
 */
export function WellShaft({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center",
        className,
      )}
    >
      {/* glow at the mouth */}
      <div className="absolute top-0 h-[360px] w-[560px] max-w-full bg-[radial-gradient(50%_60%_at_50%_0%,rgba(233,184,122,0.10),transparent_72%)]" />
      {/* the descending shaft */}
      <div className="h-[75vh] w-px bg-gradient-to-b from-candle/30 via-candle/[0.06] to-transparent" />
    </div>
  );
}
