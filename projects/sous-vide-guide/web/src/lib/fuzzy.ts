/** Case-fold and strip combining marks for loose matching. */
function normalizeSearchText(value: string) {
  return value.normalize("NFD").replaceAll(/\p{M}/gu, "").toLocaleLowerCase("en-US");
}

function isWordChar(char: string | undefined) {
  return char !== undefined && /[a-z0-9]/.test(char);
}

/**
 * Scores how well `query` matches `candidate`.
 * Exact / substring / word-prefix beat subsequence; unmatched chars score 0.
 * Short needles skip subsequence matching to cut false positives.
 */
export function fuzzyScore(query: string, candidate: string) {
  const needle = normalizeSearchText(query);
  const hay = normalizeSearchText(candidate);
  if (needle.length < 2) {
    return 0;
  }
  if (hay === needle) {
    return 1000;
  }
  if (hay.includes(needle)) {
    return 800 + needle.length;
  }

  for (const word of hay.split(/[^a-z0-9]+/)) {
    if (word.startsWith(needle)) {
      return 700 + needle.length;
    }
  }

  // Subsequence only for longer needles, starting at a word boundary,
  // with a tight gap budget (avoids "räka" → "breakfast").
  if (needle.length < 4) {
    return 0;
  }

  const maxGaps = Math.max(1, Math.floor(needle.length / 2));

  for (let start = 0; start < hay.length; start += 1) {
    if (hay[start] !== needle[0]) {
      continue;
    }
    if (start > 0 && isWordChar(hay[start - 1])) {
      continue;
    }

    let qi = 1;
    let consecutive = 1;
    let score = 2;
    let gaps = 0;
    for (let hi = start + 1; hi < hay.length && qi < needle.length; hi += 1) {
      if (hay[hi] === needle[qi]) {
        consecutive += 1;
        score += 1 + consecutive;
        qi += 1;
      } else {
        consecutive = 0;
        gaps += 1;
        if (gaps > maxGaps) {
          break;
        }
      }
    }

    if (qi === needle.length) {
      return score;
    }
  }

  return 0;
}
