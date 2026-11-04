/** Frames to keep correcting after `change` settles: React's commit, then late layout. */
const SETTLE_FRAMES = 6;

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

/**
 * Runs `change` (say, loading items above `anchor`) and keeps `anchor` where
 * it was on screen, scrolling by however far it moved. Browsers with CSS
 * scroll anchoring usually do this already and leave nothing to correct;
 * Safari doesn't. Stops early if `anchor` leaves the document.
 */
export async function keepScrollAnchor(anchor: Element, change: () => Promise<void>) {
  const top = anchor.getBoundingClientRect().top;
  await change();
  for (let frame = 0; frame < SETTLE_FRAMES; frame++) {
    await nextFrame();
    if (!anchor.isConnected) {
      return;
    }
    const moved = anchor.getBoundingClientRect().top - top;
    if (moved !== 0) {
      window.scrollBy({ behavior: "instant", top: moved });
    }
  }
}
