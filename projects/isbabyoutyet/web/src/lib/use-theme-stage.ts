import { useState } from "react";
import { useAutoplayTick } from "@/lib/use-delayed-action";

type ThemeStageState = {
  /** Re-keys the notification toast on every step change. */
  announced: number;
  autoplay: boolean;
  /** Completed journeys, so other hero copy can change on the same beat. */
  journey: number;
  stageIndex: number;
  themeIndex: number;
};

const INITIAL_STATE: ThemeStageState = {
  announced: 0,
  autoplay: true,
  journey: 0,
  stageIndex: 0,
  themeIndex: 0,
};

/**
 * State for the homepage's self-playing theme stage: which journey step and
 * which theme are showing, and whether it still plays itself. It advances
 * through the steps and moves to the next theme after each full journey,
 * until the visitor takes the controls. `journey` counts completed journeys
 * so the rotating headline name can change on the same beat instead of
 * running its own clock.
 *
 * Every update is a pure function of the previous state, so a tick never
 * acts on a stale step.
 */
export function useThemeStage(opts: {
  intervalMs: number;
  stageCount: number;
  themeCount: number;
}) {
  const [state, setState] = useState(INITIAL_STATE);

  useAutoplayTick({
    enabled: state.autoplay,
    intervalMs: opts.intervalMs,
    onTick: () => {
      setState((previous) => {
        const stageIndex = (previous.stageIndex + 1) % opts.stageCount;
        const wrapped = stageIndex === 0;
        return {
          ...previous,
          announced: previous.announced + 1,
          journey: wrapped ? previous.journey + 1 : previous.journey,
          stageIndex,
          themeIndex: wrapped ? (previous.themeIndex + 1) % opts.themeCount : previous.themeIndex,
        };
      });
    },
  });

  return {
    announced: state.announced,
    journey: state.journey,
    pickStage: (index: number) => {
      setState((previous) => ({
        ...previous,
        announced: previous.announced + 1,
        autoplay: false,
        stageIndex: index,
      }));
    },
    pickTheme: (index: number) => {
      setState((previous) => ({ ...previous, autoplay: false, themeIndex: index }));
    },
    stageIndex: state.stageIndex,
    themeIndex: state.themeIndex,
  };
}
