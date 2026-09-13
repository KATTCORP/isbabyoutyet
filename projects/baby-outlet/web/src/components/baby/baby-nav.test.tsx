import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";

vi.mock("@tanstack/react-router", () => ({
  Link: (props: React.ComponentProps<"a"> & { to: string | undefined }) => (
    <a href={typeof props.to === "string" ? props.to : "#"} {...props} />
  ),
}));

vi.mock("@workspace/ui/components/mode-toggle", () => ({
  ModeToggle: () => <button type="button">Toggle theme</button>,
}));

const { BabyNav } = await import("@/components/baby/baby-nav");

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("groups owner actions separately from page actions", async () => {
  await using view = renderResource(
    <BabyNav
      shareLink="https://example.com/baby/demo"
      onPostUpdate={() => {}}
      onShareCopied={null}
      onSettingsOpened={null}
      settingsButton={{ to: "/" }}
      settingsOpen={false}
    />,
  );

  const ownerGroup = view.getByRole("group", { name: "Owner actions" });
  const pageGroup = view.getByRole("group", { name: "Page actions" });
  const postUpdate = view.getByRole("button", { name: /post update/i });
  const settings = view.getByRole("button", { name: /settings/i });
  const share = view.getByRole("button", { name: /copy link to share/i });
  const theme = view.getByRole("button", { name: /toggle theme/i });

  expect(ownerGroup.contains(postUpdate)).toBe(true);
  expect(ownerGroup.contains(settings)).toBe(true);
  expect(pageGroup.contains(share)).toBe(true);
  expect(pageGroup.contains(theme)).toBe(true);
});

test("hides the owner group when the visitor has no owner actions", async () => {
  await using view = renderResource(
    <BabyNav
      shareLink="https://example.com/baby/demo"
      onPostUpdate={null}
      onShareCopied={null}
      onSettingsOpened={null}
      settingsButton={null}
      settingsOpen={false}
    />,
  );

  expect(view.queryByRole("group", { name: "Owner actions" })).toBeNull();
  expect(view.getByRole("group", { name: "Page actions" })).toBeTruthy();
});

test("disables sharing when the share link is empty", async () => {
  await using view = renderResource(
    <BabyNav
      shareLink=""
      onPostUpdate={null}
      onShareCopied={null}
      onSettingsOpened={null}
      settingsButton={{ to: "/" }}
      settingsOpen={true}
    />,
  );

  const share = view.getByRole("button", { name: /copy link to share/i }) as HTMLButtonElement;
  expect(share.disabled).toBe(true);
  expect(view.getByRole("button", { name: /close settings/i })).toBeTruthy();
});
