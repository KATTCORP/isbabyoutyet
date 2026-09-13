import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/baby/$publicId/")({
  component: BabyPageIndex,
});

export function BabyPageIndex() {
  return null;
}
