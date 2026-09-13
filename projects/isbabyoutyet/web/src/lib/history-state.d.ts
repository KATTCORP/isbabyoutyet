import "@tanstack/history";

declare module "@tanstack/history" {
  interface HistoryState {
    /**
     * Set when an overlay was opened via push from in-app navigation so
     * dismiss can prefer `history.back()` over a replace fallback.
     */
    overlay: true | undefined;
  }
}
