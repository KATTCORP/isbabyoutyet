import { useId } from "react";
import { cn } from "@workspace/ui/lib/utils";
import type { DevicePlatform } from "@/lib/use-device-platform";

/**
 * `messages` is Apple's Messages app (iMessage and SMS share it); `sms` is
 * Google Messages, Android's default texting app.
 */
export type ChatApp = "messages" | "messenger" | "sms" | "whatsapp";

/*
 * Brand marks copied verbatim from simple-icons 16.37.0 (CC0 1.0,
 * https://simpleicons.org), 24×24 viewBox. The logos are trademarks of
 * their owners (Apple, Google, Meta) and appear only to depict their apps.
 */
const LOGO_PATHS = {
  messages:
    "M5.285 0A5.273 5.273 0 0 0 0 5.285v13.43A5.273 5.273 0 0 0 5.285 24h13.43A5.273 5.273 0 0 0 24 18.715V5.285A5.273 5.273 0 0 0 18.715 0ZM12 4.154a8.809 7.337 0 0 1 8.809 7.338A8.809 7.337 0 0 1 12 18.828a8.809 7.337 0 0 1-2.492-.303A8.656 7.337 0 0 1 5.93 19.93a9.929 7.337 0 0 0 1.54-2.155 8.809 7.337 0 0 1-4.279-6.283A8.809 7.337 0 0 1 12 4.154",
  messenger:
    "M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.008a.7.7 0 0 1 .364-.13",
  sms: "M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zM4.911 7.089h11.456a2.197 2.197 0 0 1 2.165 2.19v5.863a2.213 2.213 0 0 1-2.177 2.178H8.04c-1.174 0-2.04-.99-2.04-2.178v-4.639L4.503 7.905c-.31-.42-.05-.816.408-.816zm3.415 2.19c-.347 0-.68.21-.68.544 0 .334.333.544.68.544h7.905c.346 0 .68-.21.68-.544 0-.334-.334-.545-.68-.545zm0 2.177c-.347 0-.68.21-.68.544 0 .334.333.544.68.544h7.905c.346 0 .68-.21.68-.544 0-.334-.334-.544-.68-.544zm-.013 2.19c-.346 0-.68.21-.68.544 0 .334.334.544.68.544h5.728c.347 0 .68-.21.68-.544 0-.334-.333-.545-.68-.545z",
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
} as const satisfies Record<ChatApp, string>;

/** Brand colours from simple-icons; Messenger's mark is a gradient. */
const LOGO_FILL = {
  messages: "#34da50",
  messenger: "gradient",
  sms: "#1a73e8",
  whatsapp: "#25d366",
} as const satisfies Record<ChatApp, string>;

export const CHAT_APP_NAMES = {
  messages: "Messages",
  messenger: "Messenger",
  sms: "Messages",
  whatsapp: "WhatsApp",
} as const satisfies Record<ChatApp, string>;

const MESSENGER_GRADIENT_STOPS = [
  { color: "#0099ff", offset: "0" },
  { color: "#a033ff", offset: "0.6" },
  { color: "#ff5280", offset: "0.9" },
  { color: "#ff7061", offset: "1" },
] as const;

/**
 * The app's real icon as a badge on a chat avatar: a rounded square on iOS,
 * a circle on Android. The cut-outs in each mark (the bubble in Messages,
 * Messenger's bolt) show the white backing, like the real app icons.
 */
export function ChatAppLogo(props: { app: ChatApp; platform: DevicePlatform }) {
  const gradientId = useId();
  // On iOS, WhatsApp's app icon is the white mark on a green square.
  const isWhatsappTile = props.app === "whatsapp" && props.platform === "ios";
  const fill = isWhatsappTile
    ? "#ffffff"
    : LOGO_FILL[props.app] === "gradient"
      ? `url(#${gradientId})`
      : LOGO_FILL[props.app];
  return (
    <span
      className={cn(
        "absolute -right-1 -bottom-1 flex size-5 items-center justify-center overflow-hidden ring-2",
        isWhatsappTile ? "bg-[#25d366]" : "bg-white",
        props.platform === "ios"
          ? "rounded-[6px] ring-white/80 dark:ring-zinc-800"
          : "rounded-full ring-zinc-100 dark:ring-zinc-800",
      )}
      data-app={props.app}
    >
      <svg
        aria-hidden="true"
        className={props.app === "messages" || props.app === "sms" ? "size-full" : "size-[78%]"}
        viewBox="0 0 24 24"
      >
        {LOGO_FILL[props.app] === "gradient" && (
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1" y1="1" y2="0">
              {MESSENGER_GRADIENT_STOPS.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
        )}
        <path d={LOGO_PATHS[props.app]} fill={fill} />
      </svg>
    </span>
  );
}
