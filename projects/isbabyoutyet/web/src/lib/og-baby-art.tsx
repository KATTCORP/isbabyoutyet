import type { ReactNode } from "react";
import type { BabyStatus } from "@isbabyoutyet/backend/src/types";

/**
 * Per-theme art direction for baby page OG cards. Each theme gets a palette
 * resolved to literal sRGB (Satori cannot read CSS vars), a card style, an
 * avatar frame, and backdrop art drawn as inline SVG on the 1200×630 canvas.
 * The avatar sits at {@link OG_AVATAR}; the left ~680px are kept clear for
 * text.
 */

export const OG_AVATAR = { cx: 930, cy: 300, r: 150 } as const;

type StatusType = BabyStatus["type"];

type OgBabyPalette = {
  background: string;
  /** Root CSS `background-image`; washes that need a radial gradient are drawn in `back` instead. */
  backgroundImage: string;
  backgroundSize: string;
  border: string;
  card: string;
  confetti: ReadonlyArray<string>;
  foreground: string;
  /** Question line colour; usually the foreground. */
  heading: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
};

export type OgBabyArt = {
  /** `text-shadow` for the big status answer. */
  answerTextShadow: string;
  /** `circle`, or an arch with a rounded top and soft bottom corners. */
  avatarFrame: "arch" | "circle";
  /**
   * Rings via spread-only shadows are cheap; blurred shadows make resvg
   * several times slower, so glows are drawn with {@link avatarGlow}.
   */
  avatarStyle: { border: string; boxShadow: string };
  /** Art behind the avatar. */
  back: (status: StatusType) => ReactNode;
  cardStyle: {
    border: string;
    borderRadius: number;
    boxShadow: string;
  };
  /** Art in front of the avatar (badges, confetti). */
  front: (status: StatusType) => ReactNode;
  palette: OgBabyPalette;
};

const HEART_PATH =
  "M0 8 C-14 -2 -12 -14 -4 -14 C-1 -14 0 -11 0 -10 C0 -11 1 -14 4 -14 C12 -14 14 -2 0 8Z";
const SPARKLE_PATH = "M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12Z";

/** `#rrggbb` → `rgba(r, g, b, alpha)`. */
export function withAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Deterministic PRNG so every render of a card is identical. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Point = { rotate: number; scale: number; x: number; y: number };

/**
 * Scatter points in the art area (right of the text column), keeping clear
 * of the avatar disc.
 */
function scatter(opts: { clearance: number; count: number; seed: number }) {
  const random = seededRandom(opts.seed);
  const points: Array<Point> = [];
  let attempts = 0;
  while (points.length < opts.count && attempts < opts.count * 40) {
    attempts++;
    const x = 690 + random() * 500;
    const y = 16 + random() * 598;
    if (Math.hypot(x - OG_AVATAR.cx, y - OG_AVATAR.cy) < OG_AVATAR.r + opts.clearance) {
      continue;
    }
    if (points.some((point) => Math.hypot(point.x - x, point.y - y) < 44)) {
      continue;
    }
    points.push({ rotate: random() * 360, scale: 0.7 + random() * 0.6, x, y });
  }
  return points;
}

function pick<T>(items: ReadonlyArray<T>, index: number): T {
  const item = items[index % items.length];
  if (item === undefined) {
    throw new Error("pick() needs a non-empty list");
  }
  return item;
}

function sparkles(opts: { colors: ReadonlyArray<string>; count: number; seed: number }) {
  return scatter({ clearance: 40, count: opts.count, seed: opts.seed }).map((point, index) => (
    <path
      d={SPARKLE_PATH}
      fill={pick(opts.colors, index)}
      key={`s${point.x}`}
      transform={`translate(${point.x} ${point.y}) scale(${point.scale})`}
    />
  ));
}

/** Confetti burst for the born card: ribbons, dots, and hearts. */
function confetti(opts: { colors: ReadonlyArray<string>; seed: number }) {
  return scatter({ clearance: 26, count: 34, seed: opts.seed }).map((point, index) => {
    const fill = pick(opts.colors, index);
    const transform = `translate(${point.x} ${point.y}) rotate(${point.rotate}) scale(${point.scale})`;
    switch (index % 4) {
      case 0: {
        return (
          <rect
            fill={fill}
            height="9"
            key={`c${point.x}`}
            rx="2.5"
            transform={transform}
            width="22"
            x="-11"
            y="-4.5"
          />
        );
      }
      case 1: {
        return <circle cx="0" cy="0" fill={fill} key={`c${point.x}`} r="6" transform={transform} />;
      }
      case 2: {
        return (
          <path
            d="M-12 0 q6 -10 12 0 t12 0"
            fill="none"
            key={`c${point.x}`}
            stroke={fill}
            strokeLinecap="round"
            strokeWidth="5"
            transform={transform}
          />
        );
      }
      default: {
        return (
          <path
            d={HEART_PATH}
            fill={fill}
            key={`c${point.x}`}
            transform={`translate(${point.x} ${point.y}) rotate(${(point.rotate % 40) - 20}) scale(${point.scale})`}
          />
        );
      }
    }
  });
}

/** Expanding rings that say "something is happening right now". */
function pulseRings(opts: { color: string; offset: number }) {
  return [0.45, 0.28, 0.14].map((alpha, index) => (
    <circle
      cx={OG_AVATAR.cx}
      cy={OG_AVATAR.cy}
      fill="none"
      key={alpha}
      r={OG_AVATAR.r + opts.offset + index * 26}
      stroke={withAlpha(opts.color, alpha)}
      strokeWidth={6 - index * 1.5}
    />
  ));
}

/** Round sticker on the avatar's lower right showing the status at a glance. */
function statusBadge(opts: { fill: string; ink: string; ring: string; status: StatusType }) {
  const x = OG_AVATAR.cx + OG_AVATAR.r * 0.72;
  const y = OG_AVATAR.cy + OG_AVATAR.r * 0.72;
  let icon: ReactNode;
  switch (opts.status) {
    case "born": {
      icon = (
        <path d={HEART_PATH} fill={opts.ink} transform={`translate(${x} ${y + 2}) scale(1.45)`} />
      );
      break;
    }
    case "gone_to_hospital": {
      icon = (
        <path
          d="M-6 -18 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 v-12 h12Z"
          fill={opts.ink}
          transform={`translate(${x} ${y})`}
        />
      );
      break;
    }
    case "labor_started": {
      icon = (
        <path d={SPARKLE_PATH} fill={opts.ink} transform={`translate(${x} ${y}) scale(1.9)`} />
      );
      break;
    }
    case "not_yet": {
      icon = (
        <g
          fill="none"
          stroke={opts.ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
          transform={`translate(${x} ${y})`}
        >
          <path d="M-12 -18 h24 M-12 18 h24 M-9 -18 q0 12 9 18 q9 -6 9 -18 M-9 18 q0 -12 9 -18 q9 6 9 18" />
          <path d="M-4 12 h8" strokeWidth="5" />
        </g>
      );
      break;
    }
    default: {
      const _exhaustive: never = opts.status;
      return _exhaustive;
    }
  }
  return (
    <g>
      <circle cx={x} cy={y} fill={opts.ring} r="46" />
      <circle cx={x} cy={y} fill={opts.fill} r="38" />
      {icon}
    </g>
  );
}

/**
 * Line-art baby face for pages without a photo: asleep while waiting, awake
 * with a party hat once born. Drawn in a 300×300 box.
 */
export function BabyFace(props: {
  background: string;
  cheek: string;
  face: string;
  hat: string;
  ink: string;
  status: StatusType;
}) {
  const awake = props.status === "born";
  return (
    <svg height="300" viewBox="0 0 300 300" width="300">
      <rect fill={props.background} height="300" width="300" />
      <circle cx="150" cy="168" fill={props.face} r="92" stroke={props.ink} strokeWidth="7" />
      <path
        d="M146 78 q-22 -30 6 -38 q20 -4 10 16"
        fill="none"
        stroke={props.ink}
        strokeLinecap="round"
        strokeWidth="7"
      />
      {awake ? (
        <g fill={props.ink}>
          <ellipse cx="114" cy="160" rx="9" ry="12" />
          <ellipse cx="186" cy="160" rx="9" ry="12" />
          <circle cx="117" cy="155" fill="#ffffff" r="3.5" />
          <circle cx="189" cy="155" fill="#ffffff" r="3.5" />
        </g>
      ) : (
        <path
          d="M98 160 q16 14 32 0 M170 160 q16 14 32 0"
          fill="none"
          stroke={props.ink}
          strokeLinecap="round"
          strokeWidth="7"
        />
      )}
      <circle cx="96" cy="194" fill={props.cheek} r="14" />
      <circle cx="204" cy="194" fill={props.cheek} r="14" />
      {awake ? (
        <path
          d="M126 200 q24 26 48 0Z"
          fill={props.ink}
          stroke={props.ink}
          strokeLinejoin="round"
          strokeWidth="6"
        />
      ) : (
        <path
          d="M138 206 q12 9 24 0"
          fill="none"
          stroke={props.ink}
          strokeLinecap="round"
          strokeWidth="7"
        />
      )}
      {awake ? (
        <g>
          <path
            d="M184 88 L232 104 L226 34Z"
            fill={props.hat}
            stroke={props.ink}
            strokeLinejoin="round"
            strokeWidth="6"
          />
          <circle cx="226" cy="32" fill={props.cheek} r="11" stroke={props.ink} strokeWidth="5" />
        </g>
      ) : (
        <g
          fill="none"
          opacity="0.55"
          stroke={props.ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
        >
          <path d="M212 66 h20 l-20 22 h20" />
          <path d="M244 40 h14 l-14 16 h14" />
        </g>
      )}
    </svg>
  );
}

function hardShadow(opts: { color: string; size: number }) {
  return `${opts.size}px ${opts.size}px 0 0 ${opts.color}`;
}

/** Full-canvas radial colour wash; cheaper in SVG than as a CSS gradient. */
function radialWash(opts: {
  cx: number;
  cy: number;
  r: number;
  stops: ReadonlyArray<readonly [number, string]>;
}) {
  return (
    <g>
      <defs>
        <radialGradient
          cx={opts.cx}
          cy={opts.cy}
          gradientUnits="userSpaceOnUse"
          id="wash"
          r={opts.r}
        >
          {opts.stops.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </radialGradient>
      </defs>
      <rect fill="url(#wash)" height="630" width="1200" />
    </g>
  );
}

/**
 * Soft glow under the avatar. Drawn as an SVG radial gradient because a
 * blurred CSS `box-shadow` makes resvg several times slower.
 */
function avatarGlow(opts: { color: string; dy: number; reach: number }) {
  return (
    <g>
      <defs>
        <radialGradient id="avatar-glow">
          <stop offset="0.55" stopColor={opts.color} stopOpacity="1" />
          <stop offset="1" stopColor={opts.color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={OG_AVATAR.cx}
        cy={OG_AVATAR.cy + opts.dy}
        fill="url(#avatar-glow)"
        r={OG_AVATAR.r + opts.reach}
      />
    </g>
  );
}

const DOT_GRID = (color: string) => `radial-gradient(circle, ${color} 2px, transparent 2.5px)`;
const DOT_GRID_SIZE = "26px 26px";
const NO_SHADOW = "0 0 0 0 transparent";
const NO_TEXT_SHADOW = "0 0 0 transparent";

// ---------------------------------------------------------------------------
// Mango (default app theme): dotted paper, sticker shadows, warm orange.
// ---------------------------------------------------------------------------

const MANGO: OgBabyPalette = {
  background: "#fcf6ee",
  backgroundImage: DOT_GRID("rgba(2, 8, 23, 0.08)"),
  backgroundSize: DOT_GRID_SIZE,
  border: "#e6ded4",
  card: "#fffcf9",
  confetti: ["#f49d25", "#ea580c", "#fbbf24", "#fdba74", "#64748b"],
  foreground: "#1f1915",
  heading: "#1f1915",
  mutedForeground: "#6c6158",
  primary: "#f1840b",
  primaryForeground: "#260f00",
};

const mangoArt: OgBabyArt = {
  answerTextShadow: NO_TEXT_SHADOW,
  avatarFrame: "circle",
  avatarStyle: {
    border: `8px solid ${MANGO.primary}`,
    boxShadow: hardShadow({ color: withAlpha(MANGO.primary, 0.3), size: 12 }),
  },
  back: (status) => (
    <g>
      <circle cx={OG_AVATAR.cx} cy={OG_AVATAR.cy} fill={withAlpha(MANGO.primary, 0.12)} r="218" />
      <circle
        cx={OG_AVATAR.cx}
        cy={OG_AVATAR.cy}
        fill="none"
        r="252"
        stroke={withAlpha(MANGO.primary, 0.4)}
        strokeDasharray="2 16"
        strokeLinecap="round"
        strokeWidth="6"
      />
      {status === "labor_started" || status === "gone_to_hospital"
        ? pulseRings({ color: MANGO.primary, offset: 28 })
        : null}
      {sparkles({
        colors: [withAlpha(MANGO.primary, 0.8), withAlpha("#64748b", 0.4)],
        count: 7,
        seed: 11,
      })}
    </g>
  ),
  cardStyle: {
    border: `3px solid ${MANGO.border}`,
    borderRadius: 28,
    boxShadow: hardShadow({ color: withAlpha(MANGO.primary, 0.25), size: 7 }),
  },
  front: (status) => (
    <g>
      {status === "born" ? confetti({ colors: MANGO.confetti, seed: 3 }) : null}
      {statusBadge({ fill: MANGO.primary, ink: "#ffffff", ring: MANGO.background, status })}
    </g>
  ),
  palette: MANGO,
};

// ---------------------------------------------------------------------------
// Violet Bloom: clean white, a big soft violet flower behind the avatar.
// ---------------------------------------------------------------------------

const VIOLET: OgBabyPalette = {
  background: "#f6f6fb",
  backgroundImage: "linear-gradient(#fdfdfd, #fdfdfd)",
  backgroundSize: "auto",
  border: "#dfdee7",
  card: "#fdfcff",
  confetti: ["#6f39f0", "#1e69dc", "#a78bfa", "#c4b5fd", "#79c0ff"],
  foreground: "#1a1828",
  heading: "#1a1828",
  mutedForeground: "#636174",
  primary: "#6f39f0",
  primaryForeground: "#ffffff",
};

function bloom(opts: { cx: number; cy: number; fill: string; petals: number; size: number }) {
  return Array.from({ length: opts.petals }, (_, index) => (
    <ellipse
      cx={opts.cx}
      cy={opts.cy - opts.size}
      fill={opts.fill}
      key={index}
      rx={opts.size * 0.42}
      ry={opts.size}
      transform={`rotate(${(360 / opts.petals) * index} ${opts.cx} ${opts.cy})`}
    />
  ));
}

const violetArt: OgBabyArt = {
  answerTextShadow: NO_TEXT_SHADOW,
  avatarFrame: "circle",
  avatarStyle: {
    border: "8px solid #ffffff",
    boxShadow: `0 0 0 4px ${VIOLET.primary}`,
  },
  back: (status) => (
    <g>
      {radialWash({
        cx: 940,
        cy: 250,
        r: 620,
        stops: [
          [0, "#e2ebff"],
          [0.6, "#fdfdfd"],
        ],
      })}
      <defs>
        <linearGradient id="petal" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={VIOLET.primary} stopOpacity="0.32" />
          <stop offset="1" stopColor={VIOLET.primary} stopOpacity="0.06" />
        </linearGradient>
      </defs>
      {bloom({ cx: OG_AVATAR.cx, cy: OG_AVATAR.cy, fill: "url(#petal)", petals: 10, size: 132 })}
      <g transform={`rotate(18 ${OG_AVATAR.cx} ${OG_AVATAR.cy})`}>
        {bloom({
          cx: OG_AVATAR.cx,
          cy: OG_AVATAR.cy,
          fill: withAlpha("#1e69dc", 0.07),
          petals: 10,
          size: 120,
        })}
      </g>
      {avatarGlow({ color: "rgba(111, 57, 240, 0.35)", dy: 22, reach: 46 })}
      {status === "labor_started" || status === "gone_to_hospital"
        ? pulseRings({ color: VIOLET.primary, offset: 26 })
        : null}
      {[
        { cx: 1140, cy: 70, fill: withAlpha(VIOLET.primary, 0.55), size: 18 },
        { cx: 720, cy: 560, fill: withAlpha("#1e69dc", 0.4), size: 15 },
        { cx: 1150, cy: 560, fill: withAlpha(VIOLET.primary, 0.35), size: 22 },
        { cx: 735, cy: 70, fill: withAlpha("#a78bfa", 0.6), size: 12 },
      ].map((flower) => (
        <g key={flower.cx}>
          {bloom({ ...flower, petals: 5 })}
          <circle cx={flower.cx} cy={flower.cy} fill="#ffffff" r={flower.size * 0.45} />
          <circle cx={flower.cx} cy={flower.cy} fill="#fbbf24" r={flower.size * 0.3} />
        </g>
      ))}
    </g>
  ),
  cardStyle: {
    border: `2px solid ${VIOLET.border}`,
    borderRadius: 30,
    boxShadow: hardShadow({ color: withAlpha(VIOLET.primary, 0.2), size: 7 }),
  },
  front: (status) => (
    <g>
      {status === "born" ? confetti({ colors: VIOLET.confetti, seed: 7 }) : null}
      {statusBadge({ fill: VIOLET.primary, ink: "#ffffff", ring: "#ffffff", status })}
    </g>
  ),
  palette: VIOLET,
};

// ---------------------------------------------------------------------------
// Baby Blue: a pale sky with fluffy clouds; the avatar floats on one.
// ---------------------------------------------------------------------------

const BLUE: OgBabyPalette = {
  background: "#ffffff",
  backgroundImage: "linear-gradient(180deg, #f3f8fd 0%, #ffffff 45%, #e3ecf6 100%)",
  backgroundSize: "auto",
  border: "#e1eaef",
  card: "#f7f8f8",
  confetti: ["#1e9df1", "#7cc4f7", "#0f1419", "#ffd166", "#bfe1fb"],
  foreground: "#0f1419",
  heading: "#0f1419",
  mutedForeground: "#536471",
  primary: "#1e9df1",
  primaryForeground: "#ffffff",
};

function cloud(opts: { fill: string; scale: number; x: number; y: number }) {
  return (
    <g transform={`translate(${opts.x} ${opts.y}) scale(${opts.scale})`}>
      <path
        d="M-90 30 a34 34 0 0 1 10 -66 a48 48 0 0 1 88 -18 a40 40 0 0 1 72 30 a32 32 0 0 1 10 54Z"
        fill={withAlpha(BLUE.primary, 0.12)}
        transform="translate(6 10)"
      />
      <path
        d="M-90 30 a34 34 0 0 1 10 -66 a48 48 0 0 1 88 -18 a40 40 0 0 1 72 30 a32 32 0 0 1 10 54Z"
        fill={opts.fill}
        stroke="#d6e6f5"
        strokeWidth="3"
      />
    </g>
  );
}

const blueArt: OgBabyArt = {
  answerTextShadow: NO_TEXT_SHADOW,
  avatarFrame: "circle",
  avatarStyle: {
    border: `8px solid ${BLUE.primary}`,
    boxShadow: NO_SHADOW,
  },
  back: (status) => (
    <g>
      <circle cx={OG_AVATAR.cx} cy={OG_AVATAR.cy} fill="#ffffff" r="220" />
      <circle
        cx={OG_AVATAR.cx}
        cy={OG_AVATAR.cy}
        fill="none"
        r="220"
        stroke="#e3ecf6"
        strokeWidth="3"
      />
      <path
        d="M700 140 q120 -110 260 -90 t220 60"
        fill="none"
        stroke={withAlpha(BLUE.primary, 0.35)}
        strokeDasharray="2 14"
        strokeLinecap="round"
        strokeWidth="5"
      />
      {cloud({ fill: "#ffffff", scale: 0.6, x: 1110, y: 120 })}
      {cloud({ fill: "#ffffff", scale: 0.45, x: 760, y: 250 })}
      {avatarGlow({ color: "rgba(30, 157, 241, 0.3)", dy: 22, reach: 40 })}
      {status === "labor_started" || status === "gone_to_hospital"
        ? pulseRings({ color: BLUE.primary, offset: 26 })
        : null}
      {sparkles({
        colors: [withAlpha(BLUE.primary, 0.75), withAlpha("#ffd166", 0.9)],
        count: 6,
        seed: 5,
      })}
    </g>
  ),
  cardStyle: {
    border: `2px solid ${BLUE.border}`,
    borderRadius: 26,
    boxShadow: hardShadow({ color: withAlpha(BLUE.primary, 0.22), size: 7 }),
  },
  front: (status) => (
    <g>
      {cloud({ fill: "#ffffff", scale: 1.2, x: OG_AVATAR.cx - 10, y: OG_AVATAR.cy + 190 })}
      {cloud({ fill: "#f7fbff", scale: 0.8, x: OG_AVATAR.cx + 150, y: OG_AVATAR.cy + 215 })}
      {status === "born" ? confetti({ colors: BLUE.confetti, seed: 9 }) : null}
      {statusBadge({ fill: BLUE.primary, ink: "#ffffff", ring: "#ffffff", status })}
    </g>
  ),
  palette: BLUE,
};

// ---------------------------------------------------------------------------
// Bubblegum: pink paper, chunky outlines, hard pink shadows, bubbles.
// ---------------------------------------------------------------------------

const BUBBLEGUM: OgBabyPalette = {
  background: "#feeaf2",
  backgroundImage:
    "repeating-linear-gradient(135deg, rgba(208, 79, 153, 0.06) 0px, rgba(208, 79, 153, 0.06) 14px, rgba(246, 230, 238, 0) 14px, rgba(246, 230, 238, 0) 34px)",
  backgroundSize: "auto",
  border: "#d04f99",
  card: "#fffafc",
  confetti: ["#d04f99", "#eacbf1", "#fbe2a7", "#e670ab", "#b2e1eb"],
  foreground: "#462836",
  heading: "#462836",
  mutedForeground: "#85506a",
  primary: "#c5438b",
  primaryForeground: "#ffffff",
};

function bubble(opts: { fill: string; r: number; x: number; y: number }) {
  return (
    <g key={`${opts.x}-${opts.y}`}>
      <circle
        cx={opts.x}
        cy={opts.y}
        fill={opts.fill}
        r={opts.r}
        stroke={BUBBLEGUM.primary}
        strokeWidth="4"
      />
      <path
        d={`M${opts.x - opts.r * 0.55} ${opts.y - opts.r * 0.1} a${opts.r * 0.6} ${opts.r * 0.6} 0 0 1 ${opts.r * 0.5} ${-opts.r * 0.45}`}
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth={Math.max(3, opts.r * 0.14)}
      />
    </g>
  );
}

const bubblegumArt: OgBabyArt = {
  answerTextShadow: "5px 5px 0 #8acfd1",
  avatarFrame: "circle",
  avatarStyle: {
    border: `6px solid ${BUBBLEGUM.primary}`,
    boxShadow: hardShadow({ color: BUBBLEGUM.primary, size: 12 }),
  },
  back: (status) => (
    <g>
      <circle cx={OG_AVATAR.cx + 14} cy={OG_AVATAR.cy + 14} fill={BUBBLEGUM.primary} r="222" />
      <circle
        cx={OG_AVATAR.cx}
        cy={OG_AVATAR.cy}
        fill="#fbe2a7"
        r="222"
        stroke={BUBBLEGUM.primary}
        strokeWidth="5"
      />
      <circle
        cx={OG_AVATAR.cx}
        cy={OG_AVATAR.cy}
        fill="none"
        r="196"
        stroke={BUBBLEGUM.primary}
        strokeDasharray="10 12"
        strokeWidth="3"
      />
      <path
        d="M700 600 q30 -24 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0"
        fill="none"
        stroke="#eacbf1"
        strokeLinecap="round"
        strokeWidth="8"
      />
      {status === "labor_started" || status === "gone_to_hospital"
        ? pulseRings({ color: BUBBLEGUM.primary, offset: 86 })
        : null}
    </g>
  ),
  cardStyle: {
    border: `4px solid ${BUBBLEGUM.primary}`,
    borderRadius: 10,
    boxShadow: hardShadow({ color: BUBBLEGUM.primary, size: 8 }),
  },
  front: (status) => (
    <g>
      {[
        { fill: "#eacbf1", r: 34, x: 1130, y: 90 },
        { fill: "#b2e1eb", r: 18, x: 1080, y: 40 },
        { fill: "#ffffff", r: 22, x: 730, y: 110 },
        { fill: "#e670ab", r: 14, x: 760, y: 60 },
        { fill: "#b2e1eb", r: 26, x: 740, y: 470 },
        { fill: "#fbe2a7", r: 16, x: 1160, y: 500 },
      ].map((spec) => bubble(spec))}
      {status === "born" ? confetti({ colors: BUBBLEGUM.confetti, seed: 21 }) : null}
      {statusBadge({ fill: BUBBLEGUM.primary, ink: "#ffffff", ring: BUBBLEGUM.card, status })}
    </g>
  ),
  palette: BUBBLEGUM,
};

// ---------------------------------------------------------------------------
// Catppuccin: pastel Latte flavours as a rainbow, and the avatar has cat ears.
// ---------------------------------------------------------------------------

const LATTE = {
  blue: "#1e66f5",
  flamingo: "#dd7878",
  green: "#40a02b",
  lavender: "#7287fd",
  mauve: "#8839ef",
  peach: "#fe640b",
  pink: "#ea76cb",
  sky: "#04a5e5",
  teal: "#179299",
  yellow: "#df8e1d",
} as const;

const CATPPUCCIN: OgBabyPalette = {
  background: "#eff1f5",
  backgroundImage: DOT_GRID("rgba(76, 79, 105, 0.09)"),
  backgroundSize: DOT_GRID_SIZE,
  border: "#bcc0cc",
  card: "#ffffff",
  confetti: [
    LATTE.mauve,
    LATTE.pink,
    LATTE.peach,
    LATTE.yellow,
    LATTE.green,
    LATTE.sky,
    LATTE.lavender,
  ],
  foreground: "#4c4f69",
  heading: "#4c4f69",
  mutedForeground: "#5c5f77",
  primary: LATTE.mauve,
  primaryForeground: "#ffffff",
};

function catEar(opts: { flip: boolean }) {
  const sign = opts.flip ? -1 : 1;
  const baseX = OG_AVATAR.cx + sign * 96;
  const baseY = OG_AVATAR.cy - 108;
  return (
    <g key={sign}>
      <path
        d={`M${baseX - sign * 70} ${baseY + 30} L${baseX + sign * 26} ${baseY - 120} L${baseX + sign * 62} ${baseY + 52}Z`}
        fill={LATTE.mauve}
        stroke={LATTE.mauve}
        strokeLinejoin="round"
        strokeWidth="16"
      />
      <path
        d={`M${baseX - sign * 34} ${baseY + 20} L${baseX + sign * 20} ${baseY - 72} L${baseX + sign * 38} ${baseY + 30}Z`}
        fill="#f5c2e7"
        stroke="#f5c2e7"
        strokeLinejoin="round"
        strokeWidth="10"
      />
    </g>
  );
}

function pawPrint(opts: { fill: string; rotate: number; x: number; y: number }) {
  return (
    <g
      fill={opts.fill}
      key={`${opts.x}-${opts.y}`}
      transform={`translate(${opts.x} ${opts.y}) rotate(${opts.rotate})`}
    >
      <ellipse cx="0" cy="6" rx="11" ry="9" />
      <circle cx="-12" cy="-8" r="4.5" />
      <circle cx="-4" cy="-14" r="4.5" />
      <circle cx="5" cy="-14" r="4.5" />
      <circle cx="13" cy="-8" r="4.5" />
    </g>
  );
}

const catppuccinArt: OgBabyArt = {
  answerTextShadow: NO_TEXT_SHADOW,
  avatarFrame: "circle",
  avatarStyle: {
    border: `9px solid ${LATTE.mauve}`,
    boxShadow: NO_SHADOW,
  },
  back: (status) => (
    <g>
      {[
        LATTE.mauve,
        LATTE.pink,
        LATTE.peach,
        LATTE.yellow,
        LATTE.green,
        LATTE.sky,
        LATTE.lavender,
      ].map((color, index) => {
        const radius = 250 - index * 14;
        return (
          <path
            d={`M${OG_AVATAR.cx - radius} ${OG_AVATAR.cy + 40} a${radius} ${radius} 0 0 1 ${radius * 2} 0`}
            fill="none"
            key={color}
            stroke={withAlpha(color, 0.75)}
            strokeLinecap="round"
            strokeWidth="12"
          />
        );
      })}
      {catEar({ flip: false })}
      {catEar({ flip: true })}
      {avatarGlow({ color: "rgba(136, 57, 239, 0.3)", dy: 20, reach: 40 })}
      {status === "labor_started" || status === "gone_to_hospital"
        ? pulseRings({ color: LATTE.mauve, offset: 22 })
        : null}
      {[
        { fill: withAlpha(LATTE.lavender, 0.45), rotate: -20, x: 740, y: 520 },
        { fill: withAlpha(LATTE.pink, 0.5), rotate: 15, x: 790, y: 575 },
        { fill: withAlpha(LATTE.mauve, 0.35), rotate: 25, x: 1150, y: 540 },
        { fill: withAlpha(LATTE.sky, 0.45), rotate: -10, x: 1155, y: 470 },
      ].map((paw) => pawPrint(paw))}
    </g>
  ),
  cardStyle: {
    border: `2px solid ${CATPPUCCIN.border}`,
    borderRadius: 14,
    boxShadow: hardShadow({ color: withAlpha(LATTE.mauve, 0.3), size: 7 }),
  },
  front: (status) => (
    <g>
      {status === "born" ? confetti({ colors: CATPPUCCIN.confetti, seed: 13 }) : null}
      {statusBadge({ fill: LATTE.peach, ink: "#ffffff", ring: CATPPUCCIN.background, status })}
    </g>
  ),
  palette: CATPPUCCIN,
};

// ---------------------------------------------------------------------------
// Mocha Mousse: warm linen, a boho rainbow arch and botanical sprigs.
// ---------------------------------------------------------------------------

const MOCHA: OgBabyPalette = {
  background: "#f8eee4",
  backgroundImage: "linear-gradient(#f1f0e5, #f1f0e5)",
  backgroundSize: "auto",
  border: "#d4c4b3",
  card: "#fff9f3",
  confetti: ["#a37764", "#e4c7b8", "#baab92", "#8a655a", "#c39e88"],
  foreground: "#4e3b34",
  heading: "#4e3b34",
  mutedForeground: "#7a5b50",
  primary: "#9d6952",
  primaryForeground: "#ffffff",
};

function sprig(opts: { flip: boolean; x: number; y: number }) {
  const scaleX = opts.flip ? -1 : 1;
  return (
    <g key={`${opts.x}-${opts.y}`} transform={`translate(${opts.x} ${opts.y}) scale(${scaleX} 1)`}>
      <path
        d="M0 0 q-6 -70 30 -130"
        fill="none"
        stroke="#8a655a"
        strokeLinecap="round"
        strokeWidth="4"
      />
      {[
        { a: -50, x: -3, y: -30 },
        { a: 40, x: 4, y: -58 },
        { a: -40, x: 8, y: -86 },
        { a: 50, x: 20, y: -108 },
      ].map((leaf) => (
        <ellipse
          cx={leaf.x}
          cy={leaf.y}
          fill={leaf.a < 0 ? "#baab92" : "#c39e88"}
          key={leaf.y}
          rx="9"
          ry="20"
          transform={`rotate(${leaf.a} ${leaf.x} ${leaf.y}) translate(${leaf.a < 0 ? -12 : 12} 0)`}
        />
      ))}
    </g>
  );
}

const mochaArt: OgBabyArt = {
  answerTextShadow: NO_TEXT_SHADOW,
  avatarFrame: "arch",
  avatarStyle: {
    border: "8px solid #faf8f1",
    boxShadow: `0 0 0 3px ${MOCHA.primary}`,
  },
  back: (status) => (
    <g>
      {radialWash({
        cx: 960,
        cy: 315,
        r: 760,
        stops: [
          [0, "#f7f3ea"],
          [0.5, "#f1f0e5"],
          [1, "#e6dfcd"],
        ],
      })}
      {["#a37764", "#c39e88", "#e4c7b8", "#baab92"].map((color, index) => {
        const radius = 222 - index * 27;
        const baseY = 640;
        const top = OG_AVATAR.cy - 60;
        return (
          <path
            d={`M${OG_AVATAR.cx - radius} ${baseY} V${top} a${radius} ${radius} 0 0 1 ${radius * 2} 0 V${baseY}`}
            fill="none"
            key={color}
            stroke={color}
            strokeWidth="23"
          />
        );
      })}
      {sprig({ flip: false, x: 1150, y: 630 })}
      {sprig({ flip: true, x: 710, y: 630 })}
      {avatarGlow({ color: "rgba(78, 59, 52, 0.28)", dy: 24, reach: 44 })}
      {status === "labor_started" || status === "gone_to_hospital"
        ? sparkles({ colors: [MOCHA.primary, "#c39e88"], count: 6, seed: 41 })
        : null}
      <circle cx="1150" cy="62" fill="#e4c7b8" r="26" />
      <circle cx="1150" cy="62" fill="none" r="38" stroke="#e4c7b8" strokeWidth="3" />
    </g>
  ),
  cardStyle: {
    border: `2px solid ${MOCHA.border}`,
    borderRadius: 16,
    boxShadow: hardShadow({ color: withAlpha(MOCHA.foreground, 0.14), size: 6 }),
  },
  front: (status) => (
    <g>
      {status === "born" ? confetti({ colors: MOCHA.confetti, seed: 17 }) : null}
      {statusBadge({ fill: MOCHA.primary, ink: "#faf8f1", ring: MOCHA.background, status })}
    </g>
  ),
  palette: MOCHA,
};

// ---------------------------------------------------------------------------
// Quantum Rose: the dark variant; neon rose glow and atomic orbits.
// ---------------------------------------------------------------------------

const QUANTUM: OgBabyPalette = {
  background: "#1c0614",
  backgroundImage: "linear-gradient(#1a0922, #1a0922)",
  backgroundSize: "auto",
  border: "#51223f",
  card: "#2c0f20",
  confetti: ["#ff6bef", "#ffb3ff", "#e6067a", "#79e2ff", "#ffffff"],
  foreground: "#ffe2ee",
  heading: "#ffffff",
  mutedForeground: "#e69abb",
  primary: "#fe65ab",
  primaryForeground: "#270b17",
};

function orbit(opts: { rotate: number }) {
  const angle = (opts.rotate * Math.PI) / 180;
  const electronX = OG_AVATAR.cx + Math.cos(angle) * 262;
  const electronY = OG_AVATAR.cy + Math.sin(angle) * 262;
  return (
    <g key={opts.rotate}>
      <ellipse
        cx={OG_AVATAR.cx}
        cy={OG_AVATAR.cy}
        fill="none"
        rx="262"
        ry="92"
        stroke="rgba(254, 101, 171, 0.55)"
        strokeWidth="3"
        transform={`rotate(${opts.rotate} ${OG_AVATAR.cx} ${OG_AVATAR.cy})`}
      />
      <circle cx={electronX} cy={electronY} fill="rgba(254, 101, 171, 0.35)" r="16" />
      <circle cx={electronX} cy={electronY} fill="#ffffff" r="7" />
    </g>
  );
}

const quantumArt: OgBabyArt = {
  answerTextShadow: "0 0 18px rgba(254, 101, 171, 0.75)",
  avatarFrame: "circle",
  avatarStyle: {
    border: `6px solid ${QUANTUM.primary}`,
    boxShadow: "0 0 0 8px rgba(254, 101, 171, 0.25)",
  },
  back: (status) => {
    const stars = scatter({ clearance: 0, count: 26, seed: 31 });
    return (
      <g>
        {radialWash({
          cx: 936,
          cy: 300,
          r: 560,
          stops: [
            [0, "#7a0c55"],
            [0.3, "#3d1048"],
            [0.65, "#1a0922"],
          ],
        })}
        {stars.map((star, index) => (
          <circle
            cx={star.x}
            cy={star.y}
            fill={index % 3 === 0 ? "#ffffff" : "#ffb3ff"}
            key={star.x}
            opacity={0.35 + (index % 4) * 0.15}
            r={1.2 + star.scale * 1.4}
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <path
            d={`M${OG_AVATAR.cx} 420 L${OG_AVATAR.cx + (index - 2.5) * 260} 640`}
            key={index}
            stroke="rgba(254, 101, 171, 0.16)"
            strokeWidth="2"
          />
        ))}
        {[470, 520, 585].map((y) => (
          <path d={`M640 ${y} H1200`} key={y} stroke="rgba(254, 101, 171, 0.12)" strokeWidth="2" />
        ))}
        {[-60, 0, 60].map((rotate) => orbit({ rotate }))}
        {avatarGlow({ color: "rgba(254, 101, 171, 0.55)", dy: 0, reach: 60 })}
        {status === "labor_started" || status === "gone_to_hospital"
          ? pulseRings({ color: QUANTUM.primary, offset: 22 })
          : null}
      </g>
    );
  },
  cardStyle: {
    border: "2px solid rgba(254, 101, 171, 0.45)",
    borderRadius: 18,
    boxShadow: "0 0 0 6px rgba(254, 101, 171, 0.12)",
  },
  front: (status) => (
    <g>
      {status === "born" ? confetti({ colors: QUANTUM.confetti, seed: 23 }) : null}
      {statusBadge({
        fill: QUANTUM.primary,
        ink: QUANTUM.primaryForeground,
        ring: QUANTUM.background,
        status,
      })}
    </g>
  ),
  palette: QUANTUM,
};

// ---------------------------------------------------------------------------
// Sunny Days: a big sun behind the avatar and teal hills below.
// ---------------------------------------------------------------------------

const SUNNY: OgBabyPalette = {
  background: "#fff8e8",
  backgroundImage: "linear-gradient(180deg, #fff3cc 0%, #fff9e8 60%)",
  backgroundSize: "auto",
  border: "#ecddb9",
  card: "#fffdf7",
  confetti: ["#f2a614", "#8ed1c5", "#ffe58a", "#52a695", "#f97362"],
  foreground: "#443925",
  heading: "#443925",
  mutedForeground: "#716146",
  primary: "#e0950a",
  primaryForeground: "#3c2b05",
};

const sunnyArt: OgBabyArt = {
  answerTextShadow: NO_TEXT_SHADOW,
  avatarFrame: "circle",
  avatarStyle: {
    border: "8px solid #ffffff",
    boxShadow: `0 0 0 6px ${SUNNY.primary}`,
  },
  back: (status) => (
    <g>
      {Array.from({ length: 18 }, (_, index) => (
        <rect
          fill={index % 2 === 0 ? "#f2a614" : "#ffd45e"}
          height="58"
          key={index}
          rx="15"
          transform={`rotate(${index * 20} ${OG_AVATAR.cx} ${OG_AVATAR.cy})`}
          width="30"
          x={OG_AVATAR.cx - 15}
          y={OG_AVATAR.cy - 256}
        />
      ))}
      <circle cx={OG_AVATAR.cx} cy={OG_AVATAR.cy} fill="#ffe58a" r="190" />
      <circle cx={OG_AVATAR.cx} cy={OG_AVATAR.cy} fill="#ffd45e" r="172" />
      {status === "labor_started" || status === "gone_to_hospital"
        ? pulseRings({ color: "#f2a614", offset: 130 })
        : null}
    </g>
  ),
  cardStyle: {
    border: `3px solid ${SUNNY.border}`,
    borderRadius: 26,
    boxShadow: hardShadow({ color: "rgba(242, 166, 20, 0.35)", size: 7 }),
  },
  front: (status) => (
    <g>
      <path d="M560 640 Q760 470 980 560 T1200 520 V640Z" fill="#8ed1c5" />
      <path d="M760 640 Q960 520 1200 580 V640Z" fill="#52a695" />
      {[
        { x: 1040, y: 560 },
        { x: 1110, y: 600 },
        { x: 870, y: 590 },
      ].map((flower) => (
        <g key={flower.x}>
          {[0, 72, 144, 216, 288].map((angle) => (
            <circle
              cx={flower.x}
              cy={flower.y - 7}
              fill="#ffffff"
              key={angle}
              r="6"
              transform={`rotate(${angle} ${flower.x} ${flower.y})`}
            />
          ))}
          <circle cx={flower.x} cy={flower.y} fill="#f2a614" r="5" />
        </g>
      ))}
      {[
        { x: 760, y: 120 },
        { x: 800, y: 150 },
      ].map((bird) => (
        <path
          d={`M${bird.x - 14} ${bird.y} q7 -9 14 0 q7 -9 14 0`}
          fill="none"
          key={bird.x}
          stroke="#443c2a"
          strokeLinecap="round"
          strokeWidth="3.5"
        />
      ))}
      {status === "born" ? confetti({ colors: SUNNY.confetti, seed: 29 }) : null}
      {statusBadge({ fill: "#52a695", ink: "#ffffff", ring: "#ffffff", status })}
    </g>
  ),
  palette: SUNNY,
};

const OG_BABY_ART = new Map([
  ["baby-blue", blueArt],
  ["bubblegum", bubblegumArt],
  ["catppuccin", catppuccinArt],
  ["mocha-mousse", mochaArt],
  ["quantum-rose", quantumArt],
  ["sunny-days", sunnyArt],
  ["violet-bloom", violetArt],
]);

export function getOgBabyArt(theme: string | null | undefined): OgBabyArt {
  return (theme ? OG_BABY_ART.get(theme) : undefined) ?? mangoArt;
}
