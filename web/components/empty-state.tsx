"use client";

import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  onRemember?: () => void;
}

export function EmptyState({ onRemember }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <h2 className="font-display text-[2rem] italic leading-[1.15] text-mist">
        The well is still.
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-fathom">
        Nothing remembered here yet. As your tools work, what matters will
        surface.
      </p>
      <Button onClick={onRemember} className="mt-7">
        Remember something
      </Button>
    </div>
  );
}
