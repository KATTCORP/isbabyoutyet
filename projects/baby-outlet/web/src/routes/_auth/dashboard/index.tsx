import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/dashboard/")({
  component: DashboardIndex,
});

export function DashboardIndex() {
  return null;
}
