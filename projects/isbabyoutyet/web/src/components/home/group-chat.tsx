import { CaretDownIcon, ChatCircleIcon } from "@phosphor-icons/react";
import { cn } from "@workspace/ui/lib/utils";
import type { TranslationFunction, TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { canonicalUrl } from "@/lib/site-url";
import type { DevicePlatform } from "@/lib/use-device-platform";
import { useDevicePlatform } from "@/lib/use-device-platform";

type LockScreenEntry = {
  avatar: string;
  avatarTint: string;
  chat: TranslationKey;
  message: TranslationKey;
  minutesAgo: number;
  /** Who wrote it, for group chats; direct chats are titled by the sender. */
  sender: TranslationKey | null;
};

/** Newest first, like a lock screen. */
const NOTIFICATIONS = [
  {
    avatar: "👨‍👩‍👧",
    avatarTint: "from-sky-300 to-indigo-500",
    chat: "Family",
    message: "Any news?? 👀",
    minutesAgo: 0,
    sender: "Grandma",
  },
  {
    avatar: "👯",
    avatarTint: "from-violet-300 to-fuchsia-500",
    chat: "Best friend",
    message: "Baby still holding out? Takes after you. Always late 🙄",
    minutesAgo: 1,
    sender: null,
  },
  {
    avatar: "💼",
    avatarTint: "from-slate-300 to-slate-500",
    chat: "Your boss",
    message: "No rush! Just wondering if baby's here yet?",
    minutesAgo: 3,
    sender: null,
  },
  {
    avatar: "🎀",
    avatarTint: "from-pink-300 to-rose-500",
    chat: "Baby shower crew",
    message: "Sweepstake closes Friday. I've got Thursday, so no pressure 💸",
    minutesAgo: 6,
    sender: "Gym buddy",
  },
  {
    avatar: "💕",
    avatarTint: "from-amber-200 to-orange-400",
    chat: "Auntie",
    message: "Thinking of you! Anything happening? 💕",
    minutesAgo: 9,
    sender: null,
  },
  {
    avatar: "👨‍👩‍👧",
    avatarTint: "from-sky-300 to-indigo-500",
    chat: "Family",
    message: "Any news?? 👀",
    minutesAgo: 14,
    sender: "Grandma",
  },
] as const satisfies ReadonlyArray<LockScreenEntry>;

type ChatNotification = (typeof NOTIFICATIONS)[number];

const SYSTEM_FONT = {
  android: { fontFamily: 'Roboto, "Google Sans Text", system-ui, sans-serif' },
  ios: { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
} as const satisfies Record<DevicePlatform, React.CSSProperties>;

function notificationTime(
  t: TranslationFunction,
  props: { minutesAgo: number; platform: DevicePlatform },
) {
  if (props.minutesAgo === 0) {
    return t("now");
  }
  return props.platform === "ios"
    ? t("{{count}}m ago", { count: props.minutesAgo })
    : t("{{count}}m", { count: props.minutesAgo });
}

function notificationBody(t: TranslationFunction, notification: ChatNotification) {
  return notification.sender === null
    ? t(notification.message)
    : t("{{sender}}: {{message}}", {
        message: t(notification.message),
        sender: t(notification.sender),
      });
}

function ChatAvatar(props: { notification: ChatNotification; platform: DevicePlatform }) {
  return (
    <span aria-hidden="true" className="relative mt-0.5 shrink-0 self-start">
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full bg-linear-to-b text-xl",
          props.notification.avatarTint,
        )}
      >
        {props.notification.avatar}
      </span>
      <span
        className={cn(
          "absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center ring-2",
          props.platform === "ios"
            ? "rounded-[5px] bg-linear-to-b from-[#62f57c] to-[#0cbd2a] ring-white/80 dark:ring-zinc-800"
            : "rounded-full bg-emerald-600 ring-zinc-100 dark:ring-zinc-800",
        )}
      >
        <ChatCircleIcon className="size-3 text-white" weight="fill" />
      </span>
    </span>
  );
}

/**
 * iOS lock screen: frosted cards, title and time on one line, and the oldest
 * notification collapsed into a stack.
 */
function IosNotification(props: { isLast: boolean; notification: ChatNotification }) {
  const { t } = useI18n();
  return (
    <li className={cn("relative", props.isLast && "mb-4")}>
      {props.isLast && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-6 top-4 -bottom-4 rounded-[20px] bg-white/35 backdrop-blur-xl dark:bg-zinc-800/40"
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-3 top-2 -bottom-2 rounded-[21px] bg-white/50 backdrop-blur-xl dark:bg-zinc-800/55"
          />
        </>
      )}
      <div className="relative flex gap-3 rounded-[22px] bg-white/75 px-3.5 py-3 text-left shadow-sm backdrop-blur-xl dark:bg-zinc-800/75">
        <ChatAvatar notification={props.notification} platform="ios" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-950 dark:text-white">
              {t(props.notification.chat)}
            </span>
            <span className="shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">
              {notificationTime(t, { minutesAgo: props.notification.minutesAgo, platform: "ios" })}
            </span>
          </p>
          <p className="line-clamp-4 text-[15px] leading-snug text-zinc-900 dark:text-zinc-100">
            {notificationBody(t, props.notification)}
          </p>
        </div>
      </div>
    </li>
  );
}

/**
 * Android shade: grouped Material cards with big outer corners, small inner
 * ones, a `title • time` line, and an expand chevron.
 */
function AndroidNotification(props: {
  isFirst: boolean;
  isLast: boolean;
  notification: ChatNotification;
}) {
  const { t } = useI18n();
  return (
    <li
      className={cn(
        "flex gap-3 bg-zinc-100 px-4 py-3.5 text-left dark:bg-zinc-800",
        props.isFirst ? "rounded-t-[26px]" : "rounded-t-md",
        props.isLast ? "rounded-b-[26px]" : "rounded-b-md",
      )}
    >
      <ChatAvatar notification={props.notification} platform="android" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="min-w-0 truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">
            {t(props.notification.chat)}
          </span>
          <span aria-hidden="true">•</span>
          <span className="shrink-0">
            {notificationTime(t, {
              minutesAgo: props.notification.minutesAgo,
              platform: "android",
            })}
          </span>
        </p>
        <p className="line-clamp-4 text-sm leading-snug text-zinc-700 dark:text-zinc-300">
          {notificationBody(t, props.notification)}
        </p>
      </div>
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
      >
        <CaretDownIcon className="size-3.5" weight="bold" />
      </span>
    </li>
  );
}

/**
 * A wallpaper with the week's "any news?" texts piled up as lock-screen
 * notifications from direct and group chats, styled like the visitor's phone.
 * @internal
 */
export function LockScreenNotificationsView(props: { platform: DevicePlatform }) {
  const lastIndex = NOTIFICATIONS.length - 1;
  return (
    <div
      className="mt-4 rounded-[1.6rem] bg-linear-to-br from-primary/45 via-accent/40 to-secondary/60 p-2.5"
      data-platform={props.platform}
      style={SYSTEM_FONT[props.platform]}
    >
      <ul className={props.platform === "ios" ? "space-y-2" : "space-y-0.5"}>
        {NOTIFICATIONS.map((notification, index) =>
          props.platform === "ios" ? (
            <IosNotification
              isLast={index === lastIndex}
              key={`${notification.chat}-${notification.minutesAgo}`}
              notification={notification}
            />
          ) : (
            <AndroidNotification
              isFirst={index === 0}
              isLast={index === lastIndex}
              key={`${notification.chat}-${notification.minutesAgo}`}
              notification={notification}
            />
          ),
        )}
      </ul>
    </div>
  );
}

/**
 * The problem and the fix side by side: a lock screen drowning in "any news?"
 * versus one calm link.
 */
export function GroupChatVersusLink(props: { babyName: string; publicId: string }) {
  const { t } = useI18n();
  const platform = useDevicePlatform();
  const pageUrl = canonicalUrl(`/baby/${props.publicId}`).replace(/^https?:\/\//, "");
  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
      <div className="relative rounded-[2rem] border-2 border-border bg-muted/70 p-5 pop-shadow">
        <span className="absolute -top-4 -right-3 z-10 rotate-6 rounded-full bg-destructive px-3 py-1 text-sm font-black text-white shadow-lg">
          {t("{{count}} unread", { count: 47 })}
        </span>
        <p className="text-xs font-black tracking-widest text-muted-foreground uppercase">
          {t("Before: your lock screen")}
        </p>
        <LockScreenNotificationsView platform={platform} />
      </div>

      <span
        aria-hidden="true"
        className="mx-auto flex h-14 w-14 rotate-90 items-center justify-center rounded-full bg-primary text-2xl font-black text-primary-foreground pop-shadow md:rotate-0"
      >
        →
      </span>

      <div className="rounded-[2rem] border-2 border-primary/30 bg-card p-6 text-center pop-shadow-strong">
        <p className="text-xs font-black tracking-widest text-muted-foreground uppercase">
          {t("After: one link")}
        </p>
        <p className="mx-auto mt-4 inline-block -rotate-1 rounded-full border-2 border-border bg-background px-4 py-2 font-mono text-sm font-bold text-foreground">
          {pageUrl}
        </p>
        <p className="mt-5 text-3xl font-black tracking-tight text-primary">
          {t("Yes! Baby is out")}
        </p>
        <h3 className="mt-4 text-xl font-black text-foreground">
          {t("One link. Everyone knows.")}
        </h3>
        <p className="mx-auto mt-2 max-w-sm font-medium text-muted-foreground">
          {t(
            "Family checks {{name}}'s page and gets a push the moment baby arrives. You get to rest.",
            { name: props.babyName },
          )}
        </p>
      </div>
    </div>
  );
}
