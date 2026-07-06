"use client";

import { useEffect } from "react";

export function PoolCurrentTimeScroller({
  enabled,
  startMinutes,
  endMinutes
}: {
  enabled: boolean;
  startMinutes: number;
  endMinutes: number;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const clampedMinutes = Math.min(Math.max(currentMinutes, startMinutes), endMinutes);
    const slotMinutes = Math.floor(clampedMinutes / 5) * 5;
    const target = document.getElementById(`pool-slot-${slotMinutes}`);

    target?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [enabled, startMinutes, endMinutes]);

  return null;
}
