import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { ReactElement, ReactNode } from "react";
import { getCurrentStatus } from "@baby-outlet/backend/src/types";
import type { SupportedLocale } from "@baby-outlet/backend/src/i18n";
import type { MilestoneVisibility } from "@baby-outlet/backend/src/types";
import { getThemeColors } from "@/components/baby/utils";
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

const fontCache = new Map<string, ArrayBuffer>();

/**
 * Load a Nunito weight as ArrayBuffer for Satori. Uses the Google Fonts CSS
 * API with a text subset so we only pull glyphs we need.
 */
async function loadNunitoFont(opts: { weight: 700 | 900; text: string }) {
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
  element: ReactNode;
  fonts: { name: string; data: ArrayBuffer; weight: 700 | 900; style: "normal" }[];
  cacheControl: string;
}) {
  const svg = await satori(opts.element as ReactElement, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: opts.fonts,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_IMAGE_WIDTH },
  })
    .render()
    .asPng();

  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": opts.cacheControl,
    },
  });
}

type BabyOgImageBase = {
  name: string;
  theme: string | null | undefined;
  locale: SupportedLocale;
  babyBorn: string | null | undefined;
  wentToHospital: string | null | undefined;
  laborStarted: string | null | undefined;
  photoUrl: string | null;
} & Partial<{ milestoneVisibility: MilestoneVisibility | null }>;

export type BabyOgImageInput = BabyOgImageBase &
  (
    | { dueDateDisplayMode: "exact"; dueDate: string }
    | { dueDateDisplayMode: "message"; publicDueDateText: string }
  );

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
  const statusText = babyStatusLabel({ status, locale: baby.locale });
  const detail =
    status.type === "not_yet"
      ? babyStatusDetail({ baby, status })
      : babyPageDescription({
          name: baby.name,
          ...(baby.dueDateDisplayMode === "exact"
            ? { dueDateDisplayMode: "exact" as const, dueDate: baby.dueDate }
            : {
                dueDateDisplayMode: "message" as const,
                publicDueDateText: baby.publicDueDateText,
              }),
          publicId: "",
          theme: baby.theme,
          locale: baby.locale,
          babyBorn: baby.babyBorn,
          wentToHospital: baby.wentToHospital,
          laborStarted: baby.laborStarted,
          milestoneVisibility: baby.milestoneVisibility,
        });
  const brand = translate(baby.locale, "Is Baby Out Yet?");
  const fontText = `${headline}${statusText}${detail}${brand}${SITE_HOST}`;
  const photoDataUrl = await resolvePhotoDataUrl(baby.photoUrl);

  const [bold, black] = await Promise.all([
    loadNunitoFont({ weight: 700, text: fontText }),
    loadNunitoFont({ weight: 900, text: fontText }),
  ]);

  const initial = baby.name.trim().slice(0, 1).toUpperCase() || baby.name;

  return pngResponse({
    fonts: [
      { name: "Nunito", data: bold, weight: 700, style: "normal" },
      { name: "Nunito", data: black, weight: 900, style: "normal" },
    ],
    cacheControl: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
    element: (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundImage: `linear-gradient(135deg, ${background} 0%, ${accent} 55%, ${primary}33 100%)`,
          color: "#0f172a",
          fontFamily: "Nunito",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {photoDataUrl ? (
            <img
              src={photoDataUrl}
              width={180}
              height={180}
              style={{
                width: 180,
                height: 180,
                borderRadius: 36,
                objectFit: "cover",
                border: `6px solid ${primary}`,
              }}
            />
          ) : (
            <div
              style={{
                width: 180,
                height: 180,
                borderRadius: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: primary,
                color: "#fff",
                fontSize: 84,
                fontWeight: 900,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
              }}
            >
              {headline}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                alignSelf: "flex-start",
                padding: "10px 22px",
                borderRadius: 999,
                backgroundColor: primary,
                color: "#fff",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {statusText}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, opacity: 0.8 }}>{detail}</div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: `4px solid ${primary}55`,
            paddingTop: 28,
            fontSize: 28,
            fontWeight: 700,
            color: primary,
          }}
        >
          <span>{brand}</span>
          <span style={{ opacity: 0.7 }}>{SITE_HOST}</span>
        </div>
      </div>
    ),
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
    loadNunitoFont({ weight: 700, text: fontText }),
    loadNunitoFont({ weight: 900, text: fontText }),
  ]);

  return pngResponse({
    fonts: [
      { name: "Nunito", data: bold, weight: 700, style: "normal" },
      { name: "Nunito", data: black, weight: 900, style: "normal" },
    ],
    cacheControl: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    element: (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 28,
          padding: "72px 80px",
          backgroundImage: `linear-gradient(145deg, ${background} 0%, ${accent} 45%, ${primary}44 100%)`,
          color: "#0f172a",
          fontFamily: "Nunito",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 28,
            backgroundColor: primary,
            color: "#fff",
            fontSize: 52,
            fontWeight: 900,
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
          style={{ display: "flex", marginTop: 12, fontSize: 28, fontWeight: 700, color: primary }}
        >
          {SITE_HOST}
        </div>
      </div>
    ),
  });
}
