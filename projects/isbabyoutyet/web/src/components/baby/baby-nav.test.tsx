import { fireEvent } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, test, vi } from "vitest";
import { BabyNav } from "@/components/baby/baby-nav";
import { htmlButton, htmlElement } from "@/test/htmlElement";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";

type BabyNavProps = ComponentProps<typeof BabyNav>;

function navProps(overrides: Partial<BabyNavProps>): BabyNavProps {
  return {
    dashboardButton: null,
    onDismissPostUpdate: null,
    onDismissSettings: null,
    onDismissShare: null,
    onDismissSignIn: null,
    onSettingsOpened: null,
    postUpdateButton: { to: "/baby/$publicId/post" },
    postUpdateOpen: false,
    settingsButton: { to: "/" },
    settingsOpen: false,
    shareButton: { to: "/baby/$publicId/share" },
    shareOpen: false,
    signInButton: null,
    signInOpen: false,
    ...overrides,
  };
}

test("groups owner actions separately from page actions", async () => {
  await using view = await renderWithTestRouter(<BabyNav {...navProps({})} />);

  const ownerGroup = view.getByRole("group", { name: "Owner actions" });
  const pageGroup = view.getByRole("group", { name: "Page actions" });
  const postUpdate = view.getByRole("button", { name: /post update/i });
  const settings = view.getByRole("button", { name: /settings/i });
  const share = view.getByRole("button", { name: /share the link/i });
  const theme = view.getByRole("button", { name: /toggle theme/i });

  expect(ownerGroup.contains(postUpdate)).toBe(true);
  expect(ownerGroup.contains(settings)).toBe(true);
  expect(pageGroup.contains(share)).toBe(true);
  expect(pageGroup.contains(theme)).toBe(true);
});

test("collapses Post update to an icon on small screens without dropping the name", async () => {
  await using view = await renderWithTestRouter(<BabyNav {...navProps({})} />);

  expect(htmlElement(view.getByRole("button", { name: "Post update" })).className).toMatch(
    /max-sm:size-8/,
  );
  const label = [...view.container.querySelectorAll("span")].find(
    (el) => el.textContent === "Post update",
  );
  expect(htmlElement(label ?? null).className).toMatch(/max-sm:sr-only/);
});

test("hides the owner group when the visitor has no owner actions", async () => {
  await using view = await renderWithTestRouter(
    <BabyNav
      {...navProps({
        postUpdateButton: null,
        settingsButton: null,
      })}
    />,
  );

  expect(view.queryByRole("group", { name: "Owner actions" })).toBeNull();
  expect(view.getByRole("group", { name: "Page actions" })).toBeTruthy();
});

test("disables sharing when the share link is empty", async () => {
  await using view = await renderWithTestRouter(
    <BabyNav
      {...navProps({
        onDismissSettings: () => {},
        postUpdateButton: null,
        settingsOpen: true,
        shareButton: null,
      })}
    />,
  );

  const share = htmlButton(view.getByRole("button", { name: /share the link/i }));
  expect(share.disabled).toBe(true);
  expect(view.getByRole("button", { name: /close settings/i })).toBeTruthy();
});

test("calls dismiss handlers when overlay owner actions are open", async () => {
  const onDismissShare = vi.fn<() => void>();
  const onDismissPostUpdate = vi.fn<() => void>();
  const onDismissSettings = vi.fn<() => void>();

  await using view = await renderWithTestRouter(
    <BabyNav
      {...navProps({
        onDismissPostUpdate,
        onDismissSettings,
        onDismissShare,
        postUpdateButton: { to: "/baby/$publicId/post" },
        postUpdateOpen: true,
        settingsButton: { to: "/baby/$publicId/settings" },
        settingsOpen: true,
        shareButton: { to: "/baby/$publicId/share" },
        shareOpen: true,
      })}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: /close share preview/i }));
  fireEvent.click(view.getByRole("button", { name: /post update/i }));
  fireEvent.click(view.getByRole("button", { name: /close settings/i }));

  expect(onDismissShare).toHaveBeenCalledOnce();
  expect(onDismissPostUpdate).toHaveBeenCalledOnce();
  expect(onDismissSettings).toHaveBeenCalledOnce();
});

test("logged-out visitors get a sign-in icon in page actions", async () => {
  await using view = await renderWithTestRouter(
    <BabyNav
      {...navProps({
        postUpdateButton: null,
        settingsButton: null,
        signInButton: { params: { publicId: "baby-waiting" }, to: "/baby/$publicId/login" },
      })}
    />,
  );

  const pageGroup = view.getByRole("group", { name: "Page actions" });
  const signIn = view.getByRole("button", { name: "Sign in" });
  expect(pageGroup.contains(signIn)).toBe(true);
  expect(signIn.getAttribute("href")).toBe("/baby/baby-waiting/login");
  expect(view.queryByRole("button", { name: "Dashboard" })).toBeNull();
});

test("signed-in visitors get a dashboard icon in page actions", async () => {
  await using view = await renderWithTestRouter(
    <BabyNav {...navProps({ dashboardButton: { to: "/dashboard" } })} />,
  );

  const pageGroup = view.getByRole("group", { name: "Page actions" });
  const dashboard = view.getByRole("button", { name: "Dashboard" });
  expect(pageGroup.contains(dashboard)).toBe(true);
  expect(dashboard.getAttribute("href")).toBe("/dashboard");
  expect(view.queryByRole("button", { name: "Sign in" })).toBeNull();
});

test("calls dismiss when the sign-in overlay is open", async () => {
  const onDismissSignIn = vi.fn<() => void>();
  await using view = await renderWithTestRouter(
    <BabyNav
      {...navProps({
        onDismissSignIn,
        postUpdateButton: null,
        settingsButton: null,
        signInButton: { params: { publicId: "baby-waiting" }, to: "/baby/$publicId/login" },
        signInOpen: true,
      })}
    />,
  );

  fireEvent.click(view.getByRole("button", { name: "Sign in" }));
  expect(onDismissSignIn).toHaveBeenCalledOnce();
});
