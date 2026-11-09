import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { canonicalUrl } from "@/lib/site-url";

const CHAT = [
  { from: "Grandma", message: "Any news?? 👀", tilt: "-rotate-1" },
  { from: "Your boss", message: "No rush! Just wondering if baby's here yet?", tilt: "rotate-1" },
  { from: "Auntie", message: "Thinking of you! Anything happening? 💕", tilt: "-rotate-2" },
  { from: "Best friend", message: "UPDATE PLEASE 😭", tilt: "rotate-1" },
  { from: "Grandma", message: "Any news?? 👀", tilt: "-rotate-1" },
] as const satisfies ReadonlyArray<{
  from: TranslationKey;
  message: TranslationKey;
  tilt: string;
}>;

/**
 * The problem and the fix side by side: a group chat drowning in "any news?"
 * versus one calm link.
 */
export function GroupChatVersusLink(props: { babyName: string; publicId: string }) {
  const { t } = useI18n();
  const pageUrl = canonicalUrl(`/baby/${props.publicId}`).replace(/^https?:\/\//, "");
  return (
    <div className="grid items-center gap-8 md:grid-cols-[1fr_auto_1fr]">
      <div className="relative rounded-[2rem] border-2 border-border bg-muted/70 p-5 pop-shadow">
        <span className="absolute -top-4 -right-3 rotate-6 rounded-full bg-destructive px-3 py-1 text-sm font-black text-white shadow-lg">
          {t("{{count}} unread", { count: 47 })}
        </span>
        <p className="text-xs font-black tracking-widest text-muted-foreground uppercase">
          {t("Before: the group chat")}
        </p>
        <ul className="mt-4 space-y-3">
          {CHAT.map((line, index) => (
            <li
              className={`max-w-[85%] rounded-2xl rounded-bl-md bg-card px-4 py-2.5 text-left shadow-sm ${line.tilt} ${
                index % 2 === 1 ? "ml-auto rounded-br-md rounded-bl-2xl" : ""
              }`}
              key={`${line.from}-${index}`}
            >
              <span className="block text-xs font-extrabold text-primary">{t(line.from)}</span>
              <span className="block text-sm font-semibold text-foreground">{t(line.message)}</span>
            </li>
          ))}
        </ul>
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
