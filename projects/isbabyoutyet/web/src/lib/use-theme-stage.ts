import { useState } from "react";
import { useAutoplayTick } from "@/lib/use-delayed-action";

type ThemeStageState = {
  /** Re-keys the notification toast on every step change. */
  announced: number;
  autoplay: boolean;
  /**
   * Ticks of the shared clock. Keeps counting after the visitor takes the
   * controls, so other hero copy (the rotating headline name) keeps its
   * rhythm and stays in step with the stage.
   */
  beat: number;
  stageIndex: number;
  themeIndex: number;
};

const INITIAL_STATE: ThemeStageState = {
  announced: 0,
  autoplay: true,
  beat: 0,
  stageIndex: 0,
  themeIndex: 0,
};

/**
 * State for the homepage's self-playing theme stage: which journey step and
 * which theme are showing, and whether it still plays itself. It advances
 * through the steps and moves to the next theme after each full journey,
 * until the visitor takes the controls. `beat` counts every tick of the
 * same clock, so the rotating headline name changes together with the stage
 * instead of running a clock of its own.
 *
 * Every update is a pure function of the previous state, so a tick never
 * acts on a stale step.
 */
export function useThemeStage(opts: {
  /** Length of one beat; the headline name changes every beat. */
  intervalMs: number;
  stageCount: number;
  /** The stage moves one step every this many beats. */
  stepEveryBeats: number;
  themeCount: number;
}) {
  const [state, setState] = useState(INITIAL_STATE);

  useAutoplayTick({
    enabled: true,
    intervalMs: opts.intervalMs,
    onTick: () => {
      setState((previous) => {
        const beat = previous.beat + 1;
        if (!previous.autoplay || beat % opts.stepEveryBeats !== 0) {
          return { ...previous, beat };
        }
        const stageIndex = (previous.stageIndex + 1) % opts.stageCount;
        const wrapped = stageIndex === 0;
        return {
          ...previous,
          announced: previous.announced + 1,
          beat,
          stageIndex,
          themeIndex: wrapped ? (previous.themeIndex + 1) % opts.themeCount : previous.themeIndex,
        };
      });
    },
  });

  return {
    announced: state.announced,
    beat: state.beat,
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
