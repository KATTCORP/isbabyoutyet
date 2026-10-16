import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement } from "react";
import { getCurrentStatus } from "@isbabyoutyet/backend/src/types";
import type { SupportedLocale } from "@isbabyoutyet/backend/src/i18n";
import type { MilestoneVisibility } from "@isbabyoutyet/backend/src/types";
import { getThemeColors } from "@/components/baby/utils";
import type { BabyDueDateDisplay } from "@/lib/seo";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  babyPageDescription,
  babyStatusDetail,
  babyStatusLabel,
} from "@/lib/seo";
import { splitMessageList, translate } from "@/lib/i18n";
import { CANONICAL_ORIGIN } from "@/lib/site-url";

const SITE_HOST = new URL(CANONICAL_ORIGIN).host;

const fontCache = new Map<string, ArrayBuffer>();

/**
 * Sanitize user text for Satori + Nunito OG images. Missing glyphs render as
 * tofu, so keep only what that Latin/Cyrillic webfont can draw:
 * NFKC-normalize (fullwidth → ASCII, circled digits → digits), strip emoji /
 * variation selectors / controls / format / private-use, then allowlist Latin +
 * Cyrillic letters, marks, decimal digits, punctuation, currency, and spaces.
 *
 * @internal
 */
export function textForOgImage(text: string) {
  return text
    .normalize("NFKC")
    .replaceAll(/\p{Extended_Pictographic}/gu, "")
    .replaceAll(/\p{Emoji_Modifier}/gu, "")
    .replaceAll(/\p{Variation_Selector}/gu, "")
    .replaceAll("⃣", "")
    .replaceAll(/\p{Cc}|\p{Cf}|\p{Co}|\p{Cs}|\p{Cn}/gu, "")
    .replaceAll(/[^\p{Script=Latin}\p{Script=Cyrillic}\p{Nd}\p{P}\p{Sc}\p{Zs}\p{M}]+/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * Load a Nunito weight as ArrayBuffer for Satori. Uses the Google Fonts CSS
 * API with a text subset so we only pull glyphs we need.
 */
async function loadNunitoFont(opts: { text: string; weight: 700 | 900 }) {
  const cacheKey = `${opts.weight}:${opts.text}`;
  const cached = fontCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const cssUrl = `https://fonts.googleapis.com/css2?family=Nunito:wght@${opts.weight}&text=${encodeURIComponent(opts.text)}`;
  const cssResponse = await fetch(cssUrl, {
    headers: {
      // Old Safari UA makes Google Fonts return TTF/OTF (Satori cannot use woff2).
      "User-Agent":
        "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
    },
  });
  if (!cssResponse.ok) {
    throw new Error(`Failed to load Nunito CSS (${cssResponse.status})`);
  }
  const css = await cssResponse.text();
  const fontUrlMatch = css.match(/src:\s*url\(([^)]+)\)/);
  const fontUrl = fontUrlMatch?.[1];
  if (!fontUrl) {
    throw new Error("Nunito font URL missing from Google Fonts CSS");
  }
  const buffer = await fetch(fontUrl).then((response) => response.arrayBuffer());
  fontCache.set(cacheKey, buffer);
  return buffer;
}

async function pngResponse(opts: {
  element: ReactElement;
  fonts: Array<{ data: ArrayBuffer; name: string; style: "normal"; weight: 700 | 900 }>;
}) {
  const svg = await satori(opts.element, {
    fonts: opts.fonts,
    height: OG_IMAGE_HEIGHT,
    width: OG_IMAGE_WIDTH,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
  })
    .render()
    .asPng();

  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
    },
  });
}

type BabyOgImageBase = {
  babyBorn: string | null | undefined;
  laborStarted: string | null | undefined;
  locale: SupportedLocale;
  name: string;
  photoUrl: string | null;
  theme: string | null | undefined;
  timeZone: string | undefined;
  wentToHospital: string | null | undefined;
} & Partial<{ milestoneVisibility: MilestoneVisibility | null }>;

export type BabyOgImageInput = BabyOgImageBase & BabyDueDateDisplay;

async function resolvePhotoDataUrl(photoUrl: string | null) {
  if (!photoUrl) {
    return null;
  }
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function createBabyOgImage(baby: BabyOgImageInput) {
  const name = textForOgImage(baby.name) || "?";
  const ogBaby =
    baby.dueDateDisplayMode === "message"
      ? {
          ...baby,
          name,
          publicDueDateText: textForOgImage(baby.publicDueDateText),
        }
      : { ...baby, name };
  const colors = getThemeColors(ogBaby.theme);
  const primary = colors[0];
  const background = colors[1];
  const accent = colors[2];
  const status = getCurrentStatus(ogBaby);
  const headline = translate(ogBaby.locale, "Is {{name}} out yet?", { name: ogBaby.name });
  const statusText = babyStatusLabel({ locale: ogBaby.locale, status });
  const detail =
    status.type === "not_yet"
      ? babyStatusDetail({ baby: ogBaby, status })
      : babyPageDescription(ogBaby);
  const brand = translate(ogBaby.locale, "Is Baby Out Yet?");
  const fontText = `${headline}${statusText}${detail}${brand}${SITE_HOST}`;
  const photoDataUrl = await resolvePhotoDataUrl(ogBaby.photoUrl);

  const [bold, black] = await Promise.all([
    loadNunitoFont({ text: fontText, weight: 700 }),
    loadNunitoFont({ text: fontText, weight: 900 }),
  ]);

  const initial = ogBaby.name.slice(0, 1).toUpperCase() || ogBaby.name;

  return pngResponse({
    element: (
      <div
        style={{
          backgroundImage: `linear-gradient(135deg, ${background} 0%, ${accent} 55%, ${primary}33 100%)`,
          color: "#0f172a",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Nunito",
          height: "100%",
          justifyContent: "space-between",
          padding: "64px 72px",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 40 }}>
          {photoDataUrl ? (
            <img
              height={180}
              src={photoDataUrl}
              style={{
                border: `6px solid ${primary}`,
                borderRadius: 36,
                height: 180,
                objectFit: "cover",
                width: 180,
              }}
              width={180}
            />
          ) : (
            <div
              style={{
                alignItems: "center",
                backgroundColor: primary,
                borderRadius: 36,
                color: "#fff",
                display: "flex",
                fontSize: 84,
                fontWeight: 900,
                height: 180,
                justifyContent: "center",
                width: 180,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 20 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              {headline}
            </div>
            <div
              style={{
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: primary,
                borderRadius: 999,
                color: "#fff",
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                padding: "10px 22px",
              }}
            >
              {statusText}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, opacity: 0.8 }}>{detail}</div>
          </div>
        </div>
        <div
          style={{
            alignItems: "flex-end",
            borderTop: `4px solid ${primary}55`,
            color: primary,
            display: "flex",
            fontSize: 28,
            fontWeight: 700,
            justifyContent: "space-between",
            paddingTop: 28,
          }}
        >
          <span>{brand}</span>
          <span style={{ opacity: 0.7 }}>{SITE_HOST}</span>
        </div>
      </div>
    ),
    fonts: [
      { data: bold, name: "Nunito", style: "normal", weight: 700 },
      { data: black, name: "Nunito", style: "normal", weight: 900 },
    ],
  });
}

/** Default (unthemed) app palette from `globals.css`, resolved to sRGB for Satori. */
const HOMEPAGE_OG_COLORS = {
  background: "#fdfbf7",
  border: "#ebe7e0",
  card: "#ffffff",
  foreground: "#020817",
  muted: "#f5f3f0",
  mutedForeground: "#64748b",
  primary: "#f49d25",
} as const;

function primaryTint(alpha: number) {
  return `rgba(244, 157, 37, ${alpha})`;
}

function inkTint(alpha: number) {
  return `rgba(2, 8, 23, ${alpha})`;
}

const OG_HEART_PATH =
  "M0 8 C-14 -2 -12 -14 -4 -14 C-1 -14 0 -11 0 -10 C0 -11 1 -14 4 -14 C12 -14 14 -2 0 8Z";
const OG_SPARKLE_PATH = "M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12Z";

/**
 * Homepage hero art for the OG card: a phone showing a just-born baby page
 * with a notification and an encouragement arriving around it. Satori passes
 * inline SVG through to resvg, so colours are literal values, not CSS vars.
 */
function homepageOgIllustration() {
  const c = HOMEPAGE_OG_COLORS;
  const notificationCard = (card: {
    icon: "bell" | "heart";
    rotate: number;
    x: number;
    y: number;
  }) => (
    <g transform={`rotate(${card.rotate} ${card.x + 116} ${card.y + 35})`}>
      <rect
        fill={primaryTint(0.25)}
        height="70"
        rx="20"
        width="232"
        x={card.x + 6}
        y={card.y + 8}
      />
      <rect
        fill={c.card}
        height="70"
        rx="20"
        stroke={c.border}
        strokeWidth="3"
        width="232"
        x={card.x}
        y={card.y}
      />
      <rect
        fill={primaryTint(0.15)}
        height="40"
        rx="12"
        width="40"
        x={card.x + 14}
        y={card.y + 15}
      />
      {card.icon === "bell" ? (
        <g fill={c.primary}>
          <path d={`M${card.x + 24} ${card.y + 42} h20 l-2.5 -4 v-7 a7.5 7.5 0 0 0 -15 0 v7Z`} />
          <circle cx={card.x + 34} cy={card.y + 45} r="2.6" />
        </g>
      ) : (
        <path
          d={OG_HEART_PATH}
          fill={c.primary}
          transform={`translate(${card.x + 34} ${card.y + 37}) scale(1.05)`}
        />
      )}
      <rect fill={inkTint(0.75)} height="9" rx="4.5" width="104" x={card.x + 66} y={card.y + 20} />
      <rect fill={inkTint(0.15)} height="7" rx="3.5" width="146" x={card.x + 66} y={card.y + 39} />
    </g>
  );

  return (
    <svg height="440" viewBox="170 0 620 440" width="620">
      {[
        { fill: c.primary, rotate: 20, x: 330, y: 160 },
        { fill: primaryTint(0.5), rotate: -30, x: 622, y: 40 },
        { fill: inkTint(0.25), rotate: 45, x: 612, y: 210 },
        { fill: primaryTint(0.7), rotate: -15, x: 268, y: 214 },
        { fill: primaryTint(0.6), rotate: 10, x: 770, y: 236 },
      ].map((piece) => (
        <rect
          fill={piece.fill}
          height="7"
          key={`${piece.x}-${piece.y}`}
          rx="2"
          transform={`translate(${piece.x} ${piece.y}) rotate(${piece.rotate})`}
          width="16"
        />
      ))}
      {[
        { scale: 0.9, x: 300, y: 50 },
        { scale: 1.1, x: 640, y: 380 },
        { scale: 0.8, x: 236, y: 370 },
        { scale: 1.2, x: 760, y: 330 },
      ].map((sparkle) => (
        <path
          d={OG_SPARKLE_PATH}
          fill={primaryTint(0.7)}
          key={`${sparkle.x}-${sparkle.y}`}
          transform={`translate(${sparkle.x} ${sparkle.y}) scale(${sparkle.scale})`}
        />
      ))}

      <g transform="rotate(-8 280 268)">
        <path
          d="M236 238 h88 a16 16 0 0 1 16 16 v28 a16 16 0 0 1 -16 16 h-62 l-18 14 v-14 h-8 a16 16 0 0 1 -16 -16 v-28 a16 16 0 0 1 16 -16Z"
          fill={c.muted}
          stroke={c.border}
          strokeWidth="3"
        />
        {[256, 280, 304].map((x) => (
          <g key={x} transform={`translate(${x} 268)`}>
            <path
              d="M-5 -6 a5 5 0 1 1 7 4.6 q-2 1 -2 4"
              fill="none"
              stroke={c.mutedForeground}
              strokeLinecap="round"
              strokeOpacity="0.45"
              strokeWidth="3.5"
            />
            <circle cx="0" cy="9" fill={c.mutedForeground} fillOpacity="0.45" r="1.5" />
          </g>
        ))}
        <path d="M238 290 L326 244" stroke={c.primary} strokeLinecap="round" strokeWidth="5" />
      </g>

      <path
        d="M690 150 q-10 30 4 60 q12 26 -2 60"
        fill="none"
        stroke={inkTint(0.3)}
        strokeWidth="2.5"
      />
      <ellipse cx="690" cy="104" fill={c.primary} rx="38" ry="46" />
      <ellipse cx="676" cy="86" fill="rgba(255, 255, 255, 0.45)" rx="9" ry="15" />
      <path d="M684 152 h12 l-6 -8Z" fill={c.primary} />

      <rect fill={primaryTint(0.3)} height="400" rx="42" width="240" x="372" y="34" />
      <rect
        fill={c.card}
        height="400"
        rx="42"
        stroke={c.border}
        strokeWidth="4"
        width="240"
        x="360"
        y="22"
      />
      <rect fill={c.background} height="368" rx="30" width="208" x="376" y="38" />
      <rect fill={c.border} height="9" rx="4.5" width="56" x="452" y="50" />

      <rect fill={primaryTint(0.15)} height="150" rx="24" width="180" x="390" y="72" />
      <circle cx="480" cy="136" fill={c.card} r="40" stroke={inkTint(0.8)} strokeWidth="3.5" />
      <path d="M496 101 L522 116 L530 80Z" fill={c.primary} />
      <circle cx="530" cy="79" fill={c.primary} r="5" />
      <path
        d="M478 97 q-10 -14 4 -18 q10 -2 5 8 M461 134 q6 6 12 0 M487 134 q6 6 12 0 M472 152 q8 8 16 0"
        fill="none"
        stroke={inkTint(0.8)}
        strokeLinecap="round"
        strokeWidth="3.5"
      />
      <circle cx="458" cy="148" fill={primaryTint(0.4)} r="6" />
      <circle cx="502" cy="148" fill={primaryTint(0.4)} r="6" />
      <rect fill={c.primary} height="22" rx="11" width="104" x="428" y="188" />
      <path d={OG_HEART_PATH} fill="#ffffff" transform="translate(446 200) scale(0.55)" />
      <rect fill="rgba(255, 255, 255, 0.8)" height="6" rx="3" width="58" x="460" y="196" />

      <path d="M406 248 H554" stroke={c.primary} strokeWidth="4" />
      {[406, 455, 505].map((x) => (
        <circle cx={x} cy="248" fill={c.primary} key={x} r="8" />
      ))}
      <circle cx="554" cy="248" fill={c.primary} r="10" stroke={primaryTint(0.3)} strokeWidth="6" />

      <rect fill={inkTint(0.7)} height="9" rx="4.5" width="140" x="392" y="274" />
      <rect fill={inkTint(0.15)} height="7" rx="3.5" width="170" x="392" y="292" />
      {[316, 360].map((y) => (
        <g key={y}>
          <rect
            fill={c.card}
            height="36"
            rx="14"
            stroke={c.border}
            strokeWidth="2.5"
            width="176"
            x="392"
            y={y}
          />
          <circle cx="412" cy={y + 18} fill={primaryTint(0.3)} r="9" />
          <rect fill={inkTint(0.55)} height="6" rx="3" width="80" x="428" y={y + 10} />
          <rect fill={inkTint(0.15)} height="6" rx="3" width="118" x="428" y={y + 21} />
        </g>
      ))}

      {notificationCard({ icon: "bell", rotate: -5, x: 198, y: 94 })}
      {notificationCard({ icon: "heart", rotate: 4, x: 518, y: 264 })}
    </svg>
  );
}

export async function createHomepageOgImage(locale: SupportedLocale) {
  const c = HOMEPAGE_OG_COLORS;
  const badge = translate(locale, "Free forever, no ads");
  const before = translate(locale, "Hero before");
  const babyWord = splitMessageList(translate(locale, "Hero names"))[0] ?? "";
  const after = translate(locale, "Hero after");
  const tagline = textForOgImage(
    translate(
      locale,
      'Stop answering "any news yet?" texts. Share one link and let everyone follow along.',
    ),
  );
  const fontText = `${badge}${before}${babyWord}${after}${tagline}${SITE_HOST}`;
  // Keeps "Is baby" / "Är bäbisen" on one line and "¿Ya nació bebé o todavía no?" on two.
  const headlineFontSize = Math.max(
    64,
    Math.min(100, Math.floor(1600 / `${before} ${babyWord} ${after}`.length)),
  );

  const [bold, black] = await Promise.all([
    loadNunitoFont({ text: fontText, weight: 700 }),
    loadNunitoFont({ text: fontText, weight: 900 }),
  ]);

  return pngResponse({
    element: (
      <div
        style={{
          backgroundColor: c.background,
          backgroundImage: `radial-gradient(circle, ${inkTint(0.09)} 2px, transparent 2.5px)`,
          backgroundSize: "26px 26px",
          color: c.foreground,
          display: "flex",
          fontFamily: "Nunito",
          height: "100%",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            justifyContent: "center",
            padding: "0 0 0 76px",
            width: 600,
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              backgroundColor: primaryTint(0.1),
              border: `3px solid ${primaryTint(0.3)}`,
              borderRadius: 999,
              boxShadow: `5px 5px 0 0 ${primaryTint(0.18)}`,
              color: c.primary,
              display: "flex",
              fontSize: 26,
              fontWeight: 900,
              padding: "8px 24px",
              transform: "rotate(-2deg)",
            }}
          >
            {badge}
          </div>
          <div
            style={{
              alignItems: "center",
              columnGap: headlineFontSize / 4,
              display: "flex",
              flexWrap: "wrap",
              fontSize: headlineFontSize,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
              marginTop: 32,
            }}
          >
            {before === "" ? null : <span>{before}</span>}
            <span
              style={{
                backgroundColor: primaryTint(0.15),
                borderRadius: headlineFontSize / 3,
                color: c.primary,
                padding: `0 ${headlineFontSize / 4}px 6px`,
                transform: "rotate(-1.5deg)",
              }}
            >
              {babyWord}
            </span>
            <span>{after}</span>
          </div>
          <div
            style={{
              color: c.mutedForeground,
              fontSize: 30,
              fontWeight: 700,
              lineHeight: 1.4,
              marginTop: 28,
            }}
          >
            {tagline}
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: 28,
              fontWeight: 900,
              gap: 14,
              marginTop: 36,
            }}
          >
            <div
              style={{
                backgroundColor: c.primary,
                borderRadius: 999,
                display: "flex",
                height: 16,
                width: 16,
              }}
            />
            {SITE_HOST}
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            height: "100%",
            position: "absolute",
            right: 0,
            top: 0,
          }}
        >
          {homepageOgIllustration()}
        </div>
      </div>
    ),
    fonts: [
      { data: bold, name: "Nunito", style: "normal", weight: 700 },
      { data: black, name: "Nunito", style: "normal", weight: 900 },
    ],
  });
}
