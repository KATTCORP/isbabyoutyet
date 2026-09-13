import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

type CoachmarkProps = {
  /** Matches `data-tour-id` on the highlighted element */
  targetId: string;
  title: string;
  description: string;
  onDismiss: () => void;
  /** When true, dismissing also completes the step */
  completeOnDismiss: boolean | undefined;
  onComplete: (() => void) | undefined;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * Soft spotlight + tip bubble anchored to `[data-tour-id=…]`.
 * Skippable; does not block the whole page (pointer-events only on the tip).
 */
export function Coachmark(props: CoachmarkProps) {
  const { t } = useI18n();
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<"above" | "below">("below");

  useEffect(() => {
    const el = document.querySelector(`[data-tour-id="${props.targetId}"]`);
    if (!(el instanceof HTMLElement)) {
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  }, [props.targetId]);

  useEffect(() => {
    function measure() {
      const el = document.querySelector(`[data-tour-id="${props.targetId}"]`);
      if (!(el instanceof HTMLElement)) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Prefer below the target; flip above if near the bottom of the viewport
      const spaceBelow = window.innerHeight - r.bottom;
      setPlacement(spaceBelow < 160 ? "above" : "below");
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const interval = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(interval);
    };
  }, [props.targetId]);

  if (!rect || typeof document === "undefined") {
    return null;
  }

  const tipTop = placement === "below" ? rect.top + rect.height + 12 : Math.max(8, rect.top - 12);
  const tipLeft = Math.min(Math.max(12, rect.left + rect.width / 2 - 140), window.innerWidth - 292);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[45]" aria-live="polite">
      <div
        className="absolute rounded-xl ring-2 ring-primary/70 ring-offset-2 ring-offset-background transition-all duration-300 animate-pulse"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        className={cn(
          "pointer-events-auto absolute w-72 rounded-xl border border-primary/20 bg-popover p-3 text-sm shadow-xl ring-1 ring-foreground/10",
          placement === "above" && "-translate-y-full",
        )}
        style={{ top: tipTop, left: tipLeft }}
        role="status"
      >
        <p className="font-medium text-foreground mb-1">{props.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{props.description}</p>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (props.completeOnDismiss) {
                props.onComplete?.();
              }
              props.onDismiss();
            }}
          >
            {props.completeOnDismiss ? t("Got it") : t("Hide tip")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
