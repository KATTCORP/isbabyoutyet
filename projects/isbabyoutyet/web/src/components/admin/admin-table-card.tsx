import type { ReactNode } from "react";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Spinner } from "@workspace/ui/components/spinner";
import { useIntersectionAction } from "@/lib/use-intersection-action";

export const ADMIN_PAGE_SIZE = 20;

export function formatWhen(ms: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function InfiniteScrollSentinel(props: { canLoadMore: boolean; onLoadMore: () => void }) {
  const sentinelRef = useIntersectionAction({
    enabled: props.canLoadMore,
    onIntersect: props.onLoadMore,
    threshold: 0.1,
  });
  return <div aria-hidden="true" className="h-8 w-full" ref={sentinelRef} />;
}

/** Card around an admin table that loads the next page when scrolled to its end. */
export function AdminTableCard(props: {
  canLoadMore: boolean;
  children: ReactNode;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <Card className="relative gap-0 py-0">
      <CardContent className="p-0">{props.children}</CardContent>
      <InfiniteScrollSentinel canLoadMore={props.canLoadMore} onLoadMore={props.onLoadMore} />
      {props.isLoadingMore ? (
        <div className="flex justify-center border-t py-3">
          <Spinner className="size-5 text-primary" />
        </div>
      ) : null}
    </Card>
  );
}
