import { useState } from "react";
import { useAutoplayTick } from "@/lib/use-delayed-action";

/**
 * State for the homepage's self-playing theme stage: which journey step and
 * which theme are showing, whether it still plays itself, and a counter that
 * re-keys the notification toast on every change. It advances through the
 * steps and moves to the next theme after each full journey, until the
 * visitor takes the controls.
 */
export function useThemeStage(opts: {
  intervalMs: number;
  stageCount: number;
  themeCount: number;
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const [themeIndex, setThemeIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [announced, setAnnounced] = useState(0);

  useAutoplayTick({
    enabled: autoplay,
    intervalMs: opts.intervalMs,
    onTick: () => {
      const next = (stageIndex + 1) % opts.stageCount;
      setStageIndex(next);
      setAnnounced((count) => count + 1);
      if (next === 0) {
        setThemeIndex((index) => (index + 1) % opts.themeCount);
      }
    },
  });

  return {
    announced,
    pickStage: (index: number) => {
      setAutoplay(false);
      setStageIndex(index);
      setAnnounced((count) => count + 1);
    },
    pickTheme: (index: number) => {
      setAutoplay(false);
      setThemeIndex(index);
    },
    stageIndex,
    themeIndex,
  };
}
