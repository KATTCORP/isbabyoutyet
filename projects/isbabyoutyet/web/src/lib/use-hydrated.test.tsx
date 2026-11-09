import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { useHydrated } from "@/lib/use-hydrated";

function Probe() {
  return <span>{useHydrated() ? "client" : "server"}</span>;
}

test("useHydrated is false on the server, so client-only UI matches the server HTML", () => {
  expect(renderToString(<Probe />)).toBe("<span>server</span>");
});

test("useHydrated is true once rendering on the client", async () => {
  await using view = makeView(render(<Probe />));
  expect(screen.getByText("client")).toBeTruthy();
  expect(view.container.textContent).toBe("client");
});

function makeView(view: ReturnType<typeof render>) {
  return Object.assign(view, { [Symbol.asyncDispose]: async () => view.unmount() });
}
