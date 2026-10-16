import type { ReactElement } from "react";
import { expect, test } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { renderWithTestRouter } from "@/test/renderWithTestRouter";
import { UsersSection } from "@/routes/_auth/dashboard_.admin/users";

function renderAdmin(ui: ReactElement) {
  return renderWithTestRouter(<LocaleProvider locale="en-GB">{ui}</LocaleProvider>, {
    path: "/dashboard/admin/users",
  });
}

test("users section shows empty and rows", async () => {
  await using empty = await renderAdmin(
    <UsersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      users={[]}
    />,
  );
  expect(empty.getByText("No users yet")).toBeTruthy();

  await using filled = await renderAdmin(
    <UsersSection
      hasNextPage={false}
      isFetchingNextPage={false}
      onLoadMore={() => undefined}
      users={[
        {
          _id: "user-1",
          babies: [
            { demo: false, name: "River", publicId: "baby-river" },
            { demo: true, name: "Sky", publicId: "baby-sky" },
          ],
          createdAt: Date.UTC(2026, 0, 15, 12, 0),
          email: "ada@example.com",
          name: "Ada",
        },
        {
          _id: "user-2",
          babies: [],
          createdAt: Date.UTC(2026, 0, 16, 12, 0),
          email: "bob@example.com",
          name: "Bob",
        },
      ]}
    />,
  );
  expect(filled.getByText("Ada")).toBeTruthy();
  expect(filled.getByText("ada@example.com")).toBeTruthy();
  expect(filled.getByRole("link", { name: "River" })).toBeTruthy();
  expect(filled.getByRole("link", { name: "Sky" })).toBeTruthy();
  expect(filled.getByText(/Demo/)).toBeTruthy();
  expect(filled.getByText("Bob")).toBeTruthy();
  expect(filled.getByText("—")).toBeTruthy();
});

test("users section shows loading-more spinner", async () => {
  await using view = await renderAdmin(
    <UsersSection
      hasNextPage={true}
      isFetchingNextPage={true}
      onLoadMore={() => undefined}
      users={[
        {
          _id: "user-1",
          babies: [{ demo: false, name: "River", publicId: "baby-river" }],
          createdAt: Date.UTC(2026, 0, 15, 12, 0),
          email: "ada@example.com",
          name: "Ada",
        },
      ]}
    />,
  );
  expect(view.getByText("Ada")).toBeTruthy();
  expect(view.getAllByRole("status", { name: "Loading" }).length).toBeGreaterThan(0);
});
