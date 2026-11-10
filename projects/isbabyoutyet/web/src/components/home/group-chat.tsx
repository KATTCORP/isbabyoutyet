import {
  CaretDownIcon,
  ChatCircleIcon,
  ChatCircleTextIcon,
  MessengerLogoIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import { cn } from "@workspace/ui/lib/utils";
import type { TranslationFunction, TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { canonicalUrl } from "@/lib/site-url";
import type { DevicePlatform } from "@/lib/use-device-platform";
import { useDevicePlatform } from "@/lib/use-device-platform";

/**
 * `messages` is Apple's Messages app (iMessage and SMS share it); `sms` is
 * Android's default Messages app, which mostly grandparents still text from.
 */
type ChatApp = "messages" | "messenger" | "sms" | "whatsapp";

const CHAT_APPS = {
  messages: {
    badge: "bg-linear-to-b from-[#62f57c] to-[#0cbd2a]",
    icon: ChatCircleIcon,
    name: "Messages",
  },
  messenger: {
    badge: "bg-linear-to-br from-[#0099ff] via-[#a033ff] to-[#ff5c87]",
    icon: MessengerLogoIcon,
    name: "Messenger",
  },
  sms: { badge: "bg-[#1a73e8]", icon: ChatCircleTextIcon, name: "Messages" },
  whatsapp: { badge: "bg-[#25d366]", icon: WhatsappLogoIcon, name: "WhatsApp" },
} as const satisfies Record<ChatApp, { badge: string; icon: typeof ChatCircleIcon; name: string }>;

type LockScreenEntry = {
  /** Which app the chat lives in on each platform. */
  app: Record<DevicePlatform, ChatApp>;
  avatar: string;
  avatarTint: string;
  chat: TranslationKey;
  message: TranslationKey;
  minutesAgo: number;
  /** Older messages from the same chat, collapsed behind this one. */
  moreCount: number;
  /** Who wrote it, for group chats; direct chats are titled by the sender. */
  sender: TranslationKey | null;
};

/**
 * Newest first, one notification per chat with the rest collapsed behind it.
 * The five shown plus every `moreCount` add up to the "47 unread" sticker.
 */
const NOTIFICATIONS = [
  {
    app: { android: "sms", ios: "messages" },
    avatar: "👵",
    avatarTint: "from-sky-200 to-sky-400",
    chat: "Grandma",
    message: "Any news?? 👀",
    minutesAgo: 0,
    moreCount: 18,
    sender: null,
  },
  {
    app: { android: "messenger", ios: "messages" },
    avatar: "👯",
    avatarTint: "from-violet-300 to-fuchsia-500",
    chat: "Best friend",
    message: "Baby still holding out? Takes after you. Always late 🙄",
    minutesAgo: 1,
    moreCount: 6,
    sender: null,
  },
  {
    app: { android: "whatsapp", ios: "messages" },
    avatar: "💼",
    avatarTint: "from-slate-300 to-slate-500",
    chat: "Your boss",
    message: "No rush! Just wondering if baby's here yet?",
    minutesAgo: 3,
    moreCount: 0,
    sender: null,
  },
  {
    app: { android: "whatsapp", ios: "whatsapp" },
    avatar: "🎀",
    avatarTint: "from-pink-300 to-rose-500",
    chat: "Baby shower crew",
    message: "Sweepstake closes Friday. I've got Thursday, so no pressure 💸",
    minutesAgo: 6,
    moreCount: 14,
    sender: "Gym buddy",
  },
  {
    app: { android: "messenger", ios: "messages" },
    avatar: "💕",
    avatarTint: "from-amber-200 to-orange-400",
    chat: "Auntie",
    message: "Thinking of you! Anything happening? 💕",
    minutesAgo: 9,
    moreCount: 4,
    sender: null,
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

/** The app's icon on the avatar: a rounded square on iOS, a circle on Android. */
function AppBadge(props: { app: ChatApp; platform: DevicePlatform }) {
  const app = CHAT_APPS[props.app];
  const Icon = app.icon;
  return (
    <span
      className={cn(
        "absolute -right-1 -bottom-1 flex size-5 items-center justify-center ring-2",
        app.badge,
        props.platform === "ios"
          ? "rounded-[6px] ring-white/80 dark:ring-zinc-800"
          : "rounded-full ring-zinc-100 dark:ring-zinc-800",
      )}
      data-app={props.app}
    >
      <Icon className="size-3.5 text-white" weight="fill" />
    </span>
  );
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
      <AppBadge app={props.notification.app[props.platform]} platform={props.platform} />
    </span>
  );
}

/**
 * iOS: frosted cards with title and time on one line. A chat with more
 * messages is a collapsed stack: layered cards underneath and an
 * "N more messages" line.
 */
function IosNotification(props: { notification: ChatNotification }) {
  const { t } = useI18n();
  const isStack = props.notification.moreCount > 0;
  return (
    <li className={cn("relative", isStack && "mb-3")}>
      {isStack && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-6 top-4 -bottom-3 rounded-[20px] bg-white/35 backdrop-blur-xl dark:bg-zinc-600/40"
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-3 top-2 -bottom-1.5 rounded-[21px] bg-white/50 backdrop-blur-xl dark:bg-zinc-600/60"
          />
        </>
      )}
      <div className="relative flex gap-3 rounded-[22px] bg-white/75 px-3.5 py-3 text-left shadow-sm backdrop-blur-xl dark:bg-zinc-800/75">
        <ChatAvatar notification={props.notification} platform="ios" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-950 dark:text-white">
              {t(props.notification.chat)}
              <span className="sr-only">{` (${CHAT_APPS[props.notification.app.ios].name})`}</span>
            </span>
            <span className="shrink-0 text-[13px] text-zinc-500 dark:text-zinc-400">
              {notificationTime(t, { minutesAgo: props.notification.minutesAgo, platform: "ios" })}
            </span>
          </p>
          <p className="line-clamp-4 text-[15px] leading-snug text-zinc-900 dark:text-zinc-100">
            {notificationBody(t, props.notification)}
          </p>
          {isStack && (
            <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
              {t("{{count}} more messages", { count: props.notification.moreCount })}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Android shade: grouped Material cards with big outer corners, small inner
 * ones, and a `title • time` line. A chat with more messages is a collapsed
 * group whose expand pill shows how many it holds.
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
            <span className="sr-only">{` (${CHAT_APPS[props.notification.app.android].name})`}</span>
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
      <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center gap-0.5 rounded-full bg-zinc-200 px-1.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
        {props.notification.moreCount > 0 && (
          <span className="sr-only">
            {t("{{count}} more messages", { count: props.notification.moreCount })}
          </span>
        )}
        {props.notification.moreCount > 0 && (
          <span aria-hidden="true">{props.notification.moreCount + 1}</span>
        )}
        <CaretDownIcon aria-hidden="true" className="size-3.5" weight="bold" />
      </span>
    </li>
  );
}

/**
 * A wallpaper with the week's "any news?" texts piled up as notifications
 * from direct and group chats, styled like the visitor's phone.
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
            <IosNotification key={notification.chat} notification={notification} />
          ) : (
            <AndroidNotification
              isFirst={index === 0}
              isLast={index === lastIndex}
              key={notification.chat}
              notification={notification}
            />
          ),
        )}
      </ul>
    </div>
  );
}

/**
 * The problem and the fix side by side: a phone drowning in "any news?"
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
          {t("Before: your phone")}
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
