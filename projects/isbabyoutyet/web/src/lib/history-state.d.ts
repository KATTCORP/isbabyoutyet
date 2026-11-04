import "@tanstack/history";
import type { TimelineFeedAnchor } from "./timeline-feed";

declare module "@tanstack/history" {
  interface HistoryState {
    /**
     * Set when an overlay was opened via push from in-app navigation so
     * dismiss can prefer `history.back()` over a replace fallback.
     */
    overlay: true | undefined;
    /**
     * The feed an item's timestamp was followed from (`followedFromFeed`).
     * Untrusted: an entry can outlive the app version that wrote it.
     */
    timelineFeed: TimelineFeedAnchor | undefined;
  }
}
