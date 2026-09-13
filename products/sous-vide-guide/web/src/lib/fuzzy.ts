/** Case-fold and strip combining marks for loose matching. */
function normalizeSearchText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US");
}

/**
 * Scores how well `query` matches `candidate`.
 * Exact / substring beats subsequence; unmatched query chars score 0.
 */
export function fuzzyScore(query: string, candidate: string) {
  const needle = normalizeSearchText(query);
  const hay = normalizeSearchText(candidate);
  if (needle.length === 0) {
    return 0;
  }
  if (hay === needle) {
    return 1000;
  }
  if (hay.includes(needle)) {
    return 800 + needle.length;
  }

  let qi = 0;
  let consecutive = 0;
  let score = 0;
  for (let hi = 0; hi < hay.length && qi < needle.length; hi += 1) {
    if (hay[hi] === needle[qi]) {
      consecutive += 1;
      score += 1 + consecutive;
      qi += 1;
    } else {
      consecutive = 0;
    }
  }

  if (qi < needle.length) {
    return 0;
  }

  return score;
}
