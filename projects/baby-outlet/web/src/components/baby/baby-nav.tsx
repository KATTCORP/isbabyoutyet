import { Button } from "@workspace/ui/components/button";
import { ModeToggle } from "@workspace/ui/components/mode-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { ChatCircleText, CheckCircle, GearSix, ShareNetwork } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

type BabyNavProps = {
  shareLink: string;
  settingsButton: LinkProps | null;
  settingsOpen: boolean;
  /** Owner-only "Post update" action */
  onPostUpdate: (() => void) | null;
  /** Fired after the share URL is copied (used by the first-run tour) */
  onShareCopied: (() => void) | null;
  /** Fired when the owner opens Settings from the gear (not from a URL deep-link) */
  onSettingsOpened: (() => void) | null;
};

export function BabyNav(props: BabyNavProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const hasOwnerActions = !!(props.onPostUpdate || props.settingsButton);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const ownerActions = hasOwnerActions ? (
    <div role="group" aria-label={t("Owner actions")} className="flex items-center gap-1">
      {props.onPostUpdate && (
        <Button
          variant="ghost"
          className="rounded-full font-bold"
          onClick={props.onPostUpdate}
          data-tour-id="post_update"
        >
          <ChatCircleText data-icon="inline-start" />
          {t("Post update")}
        </Button>
      )}
      {props.settingsButton && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={props.settingsOpen ? "default" : "ghost"}
                size="icon"
                className="rounded-full"
                render={<Link {...(props.settingsButton as any)} />}
                nativeButton={false}
                aria-label={props.settingsOpen ? t("Close settings") : t("Settings")}
                data-tour-id="explore_settings"
                onClick={() => {
                  if (!props.settingsOpen) {
                    props.onSettingsOpened?.();
                  }
                }}
              >
                <GearSix />
              </Button>
            }
          />
          <TooltipContent>
            {props.settingsOpen ? t("Close settings") : t("Settings")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  ) : null;

  const pageActions = (
    <div role="group" aria-label={t("Page actions")} className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              onClick={async () => {
                if (!props.shareLink) return;
                try {
                  await navigator.clipboard.writeText(props.shareLink);
                  setCopied(true);
                  toast.success(t("Copied to clipboard"));
                  props.onShareCopied?.();
                } catch {
                  // Fallback for older browsers
                  const textArea = document.createElement("textarea");
                  textArea.value = props.shareLink;
                  textArea.style.position = "fixed";
                  textArea.style.opacity = "0";
                  document.body.appendChild(textArea);
                  textArea.select();
                  try {
                    document.execCommand("copy");
                    setCopied(true);
                    toast.success(t("Copied to clipboard"));
                    props.onShareCopied?.();
                  } catch (cause) {
                    toast.error(
                      "Failed to copy to clipboard: " +
                        (cause instanceof Error ? cause.message : "Unknown error"),
                    );
                  }
                  document.body.removeChild(textArea);
                }
              }}
              variant="ghost"
              size="icon"
              className="rounded-full"
              disabled={!props.shareLink}
              aria-label={copied ? t("Copied!") : t("Copy link to share")}
              data-tour-id="share_link"
            >
              {copied ? <CheckCircle /> : <ShareNetwork />}
            </Button>
          }
        />
        <TooltipContent>{copied ? t("Copied!") : t("Copy link to share")}</TooltipContent>
      </Tooltip>

      <ModeToggle className="rounded-full" />
    </div>
  );

  // A floating pill dock; the page decides where it sits
  return (
    <div className="flex items-center gap-1 rounded-full border-2 border-border bg-background/85 p-1 backdrop-blur-md shadow-sm">
      {ownerActions}
      {ownerActions && <span className="h-5 w-px bg-border" aria-hidden="true" />}
      {pageActions}
    </div>
  );
}
