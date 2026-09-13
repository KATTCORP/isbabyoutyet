import { Button } from "@workspace/ui/components/button";
import { ButtonGroup, ButtonGroupSeparator } from "@workspace/ui/components/button-group";
import { ModeToggle } from "@workspace/ui/components/mode-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import {
  ChatCircleTextIcon,
  GearSixIcon,
  HouseIcon,
  ShareNetworkIcon,
  SignInIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

const postUpdateButtonClassName =
  "font-bold max-sm:size-8 max-sm:gap-0 max-sm:px-0 max-sm:has-data-[icon=inline-start]:pl-0";

function PostUpdateLabel(props: { label: string }) {
  return (
    <>
      <ChatCircleTextIcon data-icon="inline-start" />
      <span className="max-sm:sr-only">{props.label}</span>
    </>
  );
}

type BabyNavProps = {
  /** Dashboard link for signed-in visitors. Null when logged out. */
  dashboardButton: LinkProps | null;
  /** When post-update is open, close it through its guard (prompts when dirty). */
  onDismissPostUpdate: (() => void) | null;
  /** When settings is open, close it through its guard (prompts when dirty). */
  onDismissSettings: (() => void) | null;
  /** When share is open, close it (exit animation, then history.back). */
  onDismissShare: (() => void) | null;
  /** When login is open, close it (exit animation, then history.back). */
  onDismissSignIn: (() => void) | null;
  /** Fired when the owner opens Settings from the gear (not from a URL deep-link) */
  onSettingsOpened: (() => void) | null;
  /** Open post-update link (push). Null when the visitor cannot manage. */
  postUpdateButton: LinkProps | null;
  postUpdateOpen: boolean;
  /** Open-settings link (push). Null when the visitor cannot manage. */
  settingsButton: LinkProps | null;
  settingsOpen: boolean;
  /** Open-share link (push). Null when sharing is unavailable. */
  shareButton: LinkProps | null;
  shareOpen: boolean;
  /** Open parent login overlay. Null when the visitor is signed in. */
  signInButton: LinkProps | null;
  signInOpen: boolean;
};

export function BabyNav(props: BabyNavProps) {
  const { t } = useI18n();
  const hasOwnerActions = !!(props.postUpdateButton || props.settingsButton);

  const ownerActions = hasOwnerActions ? (
    <ButtonGroup aria-label={t("Owner actions")}>
      {props.postUpdateButton && (
        <Tooltip>
          <TooltipTrigger
            render={
              props.postUpdateOpen && props.onDismissPostUpdate ? (
                <Button
                  className={postUpdateButtonClassName}
                  data-tour-id="post_update"
                  onClick={props.onDismissPostUpdate}
                  variant="default"
                >
                  <PostUpdateLabel label={t("Post update")} />
                </Button>
              ) : (
                <Button
                  className={postUpdateButtonClassName}
                  data-tour-id="post_update"
                  nativeButton={false}
                  render={<Link {...props.postUpdateButton} />}
                  variant="ghost"
                >
                  <PostUpdateLabel label={t("Post update")} />
                </Button>
              )
            }
          />
          <TooltipContent>{t("Post update")}</TooltipContent>
        </Tooltip>
      )}
      {props.settingsButton && (
        <Tooltip>
          <TooltipTrigger
            render={
              props.settingsOpen && props.onDismissSettings ? (
                <Button
                  aria-label={t("Close settings")}
                  data-tour-id="explore_settings"
                  onClick={props.onDismissSettings}
                  size="icon"
                  variant="default"
                >
                  <GearSixIcon />
                </Button>
              ) : (
                <Button
                  aria-label={t("Settings")}
                  data-tour-id="explore_settings"
                  nativeButton={false}
                  onClick={() => {
                    props.onSettingsOpened?.();
                  }}
                  render={<Link {...props.settingsButton} />}
                  size="icon"
                  variant="ghost"
                >
                  <GearSixIcon />
                </Button>
              )
            }
          />
          <TooltipContent>
            {props.settingsOpen ? t("Close settings") : t("Settings")}
          </TooltipContent>
        </Tooltip>
      )}
    </ButtonGroup>
  ) : null;

  const accountAction = props.signInButton ? (
    <Tooltip>
      <TooltipTrigger
        render={
          props.signInOpen && props.onDismissSignIn ? (
            <Button
              aria-label={t("Sign in")}
              onClick={props.onDismissSignIn}
              size="icon"
              variant="default"
            >
              <SignInIcon />
            </Button>
          ) : (
            <Button
              aria-label={t("Sign in")}
              nativeButton={false}
              render={<Link {...props.signInButton} />}
              size="icon"
              variant="ghost"
            >
              <SignInIcon />
            </Button>
          )
        }
      />
      <TooltipContent>{t("Sign in")}</TooltipContent>
    </Tooltip>
  ) : props.dashboardButton ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={t("Dashboard")}
            nativeButton={false}
            render={<Link {...props.dashboardButton} />}
            size="icon"
            variant="ghost"
          >
            <HouseIcon />
          </Button>
        }
      />
      <TooltipContent>{t("Dashboard")}</TooltipContent>
    </Tooltip>
  ) : null;

  const pageActions = (
    <ButtonGroup aria-label={t("Page actions")}>
      <Tooltip>
        <TooltipTrigger
          render={
            props.shareOpen && props.onDismissShare ? (
              <Button
                aria-label={t("Close share preview")}
                data-tour-id="share_link"
                onClick={props.onDismissShare}
                size="icon"
                variant="default"
              >
                <ShareNetworkIcon />
              </Button>
            ) : (
              <Button
                aria-label={t("Share the link")}
                data-tour-id="share_link"
                disabled={!props.shareButton}
                nativeButton={!props.shareButton}
                render={props.shareButton ? <Link {...props.shareButton} /> : undefined}
                size="icon"
                variant="ghost"
              >
                <ShareNetworkIcon />
              </Button>
            )
          }
        />
        <TooltipContent>
          {props.shareOpen ? t("Close share preview") : t("Share the link")}
        </TooltipContent>
      </Tooltip>

      <ModeToggle />
      {accountAction}
    </ButtonGroup>
  );

  return (
    <ButtonGroup className="shrink-0 rounded-full border-2 border-border bg-background/85 p-1 shadow-sm backdrop-blur-md">
      {ownerActions}
      {ownerActions ? <ButtonGroupSeparator /> : null}
      {pageActions}
    </ButtonGroup>
  );
}
