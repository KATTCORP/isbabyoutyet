import { Link, useRouterState } from "@tanstack/react-router";

import type { TemperatureUnit } from "@/lib/temperature";
import { m } from "@/paraglide/messages";

type TemperatureUnitToggleProps = {
  unit: TemperatureUnit;
};

/**
 * Compact °C / °F segmented control for the sticky header. The active unit is
 * owned by the URL (`?unit=`); locale defaults apply when the param is absent.
 */
export function TemperatureUnitToggle(props: TemperatureUnitToggleProps) {
  const search = useRouterState({ select: (state) => state.location.search });

  return (
    <div
      aria-label={m.temperature_unit()}
      className="inline-flex rounded-lg border border-border/70 bg-background/80 p-0.5"
      role="group"
    >
      <Link
        aria-pressed={props.unit === "c"}
        className={
          props.unit === "c"
            ? "inline-flex h-9 min-w-10 items-center justify-center rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground touch-manipulation sm:h-8"
            : "inline-flex h-9 min-w-10 items-center justify-center rounded-md px-2.5 text-xs font-semibold text-muted-foreground touch-manipulation hover:text-foreground sm:h-8"
        }
        replace
        search={{ ...search, unit: "c" }}
        to="/"
      >
        {m.unit_celsius_short()}
      </Link>
      <Link
        aria-pressed={props.unit === "f"}
        className={
          props.unit === "f"
            ? "inline-flex h-9 min-w-10 items-center justify-center rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground touch-manipulation sm:h-8"
            : "inline-flex h-9 min-w-10 items-center justify-center rounded-md px-2.5 text-xs font-semibold text-muted-foreground touch-manipulation hover:text-foreground sm:h-8"
        }
        replace
        search={{ ...search, unit: "f" }}
        to="/"
      >
        {m.unit_fahrenheit_short()}
      </Link>
    </div>
  );
}
