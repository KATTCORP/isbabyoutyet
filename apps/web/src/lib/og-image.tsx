import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement } from "react";
import { getCurrentStatus } from "@workspace/convex/src/types";
import type { SupportedLocale } from "@workspace/convex/src/i18n";
import type { MilestoneVisibility } from "@workspace/convex/src/types";
import { getThemeColors } from "@/components/baby/utils";
import type { BabyDueDateDisplay } from "@/lib/seo";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  babyPageDescription,
  babyStatusDetail,
  babyStatusLabel,
} from "@/lib/seo";
import { translate } from "@/lib/i18n";
import { CANONICAL_ORIGIN } from "@/lib/site-url";

const SITE_HOST = new URL(CANONICAL_ORIGIN).host;

/** @internal exported for tests */
export const FONT_CACHE_MAX_ENTRIES = 64;

/**
 * Process-wide memo of Google Fonts subsets. Safe to share across requests:
 * entries are public font bytes keyed only by weight + the glyph text they
 * were subset for. The key embeds each baby's name and status text, so the
 * cache is bounded (LRU) to keep distinct renders from growing it without
 * limit on a long-lived server.
 */
const fontCache = new Map<string, ArrayBuffer>();

function rememberFont(cacheKey: string, buffer: ArrayBuffer) {
  // Re-insert so Map iteration order doubles as least-recently-used order.
  fontCache.delete(cacheKey);
  fontCache.set(cacheKey, buffer);
  if (fontCache.size > FONT_CACHE_MAX_ENTRIES) {
    const oldestKey = fontCache.keys().next().value;
    if (oldestKey !== undefined) {
      fontCache.delete(oldestKey);
    }
  }
}

/**
 * Load a Nunito weight as ArrayBuffer for Satori. Uses the Google Fonts CSS
 * API with a text subset so we only pull glyphs we need.
 *
 * @internal exported for tests
 */
export async function loadNunitoFont(opts: { text: string; weight: 700 | 900 }) {
  const cacheKey = `${opts.weight}:${opts.text}`;
  const cached = fontCache.get(cacheKey);
  if (cached) {
    rememberFont(cacheKey, cached);
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
  rememberFont(cacheKey, buffer);
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
  const colors = getThemeColors(baby.theme);
  const primary = colors[0];
  const background = colors[1];
  const accent = colors[2];
  const status = getCurrentStatus(baby);
  const headline = translate(baby.locale, "Is {{name}} out yet?", { name: baby.name });
  const statusText = babyStatusLabel({ locale: baby.locale, status });
  const detail =
    status.type === "not_yet" ? babyStatusDetail({ baby, status }) : babyPageDescription(baby);
  const brand = translate(baby.locale, "Is Baby Out Yet?");
  const fontText = `${headline}${statusText}${detail}${brand}${SITE_HOST}`;
  const photoDataUrl = await resolvePhotoDataUrl(baby.photoUrl);

  const [bold, black] = await Promise.all([
    loadNunitoFont({ text: fontText, weight: 700 }),
    loadNunitoFont({ text: fontText, weight: 900 }),
  ]);

  const initial = baby.name.trim().slice(0, 1).toUpperCase() || baby.name;

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

export async function createHomepageOgImage(locale: SupportedLocale) {
  const title = translate(locale, "Is Baby Out Yet?");
  const description = translate(
    locale,
    "Stop answering 'any news yet?' texts. Create a simple page to keep everyone updated, let them send encouragement, and notify them the moment baby arrives.",
  );
  const primary = "#ea580c";
  const background = "#fff7ed";
  const accent = "#fed7aa";
  const fontText = `${title}${description}${SITE_HOST}`;

  const [bold, black] = await Promise.all([
    loadNunitoFont({ text: fontText, weight: 700 }),
    loadNunitoFont({ text: fontText, weight: 900 }),
  ]);

  return pngResponse({
    element: (
      <div
        style={{
          backgroundImage: `linear-gradient(145deg, ${background} 0%, ${accent} 45%, ${primary}44 100%)`,
          color: "#0f172a",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Nunito",
          gap: 28,
          height: "100%",
          justifyContent: "center",
          padding: "72px 80px",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            backgroundColor: primary,
            borderRadius: 28,
            color: "#fff",
            display: "flex",
            fontSize: 52,
            fontWeight: 900,
            height: 96,
            justifyContent: "center",
            width: 96,
          }}
        >
          {title.slice(0, 1)}
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            maxWidth: 980,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.35,
            maxWidth: 920,
            opacity: 0.85,
          }}
        >
          {description}
        </div>
        <div
          style={{ color: primary, display: "flex", fontSize: 28, fontWeight: 700, marginTop: 12 }}
        >
          {SITE_HOST}
        </div>
      </div>
    ),
    fonts: [
      { data: bold, name: "Nunito", style: "normal", weight: 700 },
      { data: black, name: "Nunito", style: "normal", weight: 900 },
    ],
  });
}
