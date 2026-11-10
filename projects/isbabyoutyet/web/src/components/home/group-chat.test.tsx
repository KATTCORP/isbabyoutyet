import { screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { GroupChatVersusLink, LockScreenNotificationsView } from "./group-chat";
import { renderResource } from "@/test/renderResource";

test("iOS notifications show group senders, 'ago' times and collapsed stacks", async () => {
  await using _view = renderResource(
    <LocaleProvider locale="en-GB">
      <LockScreenNotificationsView platform="ios" />
    </LocaleProvider>,
  );
  expect(screen.getByText("Any news?? 👀")).toBeTruthy();
  expect(screen.getByText("18 more messages")).toBeTruthy();
  expect(screen.getByText("Your boss")).toBeTruthy();
  expect(screen.getByText("Baby shower crew")).toBeTruthy();
  expect(
    screen.getByText("Gym buddy: Sweepstake closes Friday. I've got Thursday, so no pressure 💸"),
  ).toBeTruthy();
  expect(screen.getByText("Baby still holding out? Takes after you. Always late 🙄")).toBeTruthy();
  expect(screen.getByText("3m ago")).toBeTruthy();
  expect(screen.getByText("now")).toBeTruthy();
});

test("Android notifications use short times and count collapsed messages", async () => {
  await using _view = renderResource(
    <LocaleProvider locale="sv">
      <LockScreenNotificationsView platform="android" />
    </LocaleProvider>,
  );
  expect(screen.getByText("Babyshower-gänget")).toBeTruthy();
  expect(screen.getByText("3 min")).toBeTruthy();
  expect(screen.queryByText("3 min sedan")).toBeNull();
  expect(screen.getByText("18 meddelanden till")).toBeTruthy();
  expect(screen.getByText("19")).toBeTruthy();
});

test("Android chats come from WhatsApp and Messenger, with Grandma on SMS", async () => {
  await using view = renderResource(
    <LocaleProvider locale="en-GB">
      <LockScreenNotificationsView platform="android" />
    </LocaleProvider>,
  );
  expect(appsShown(view.container)).toEqual([
    "sms",
    "messenger",
    "whatsapp",
    "whatsapp",
    "messenger",
  ]);
});

test("iPhone chats are mostly iMessage, with one WhatsApp group", async () => {
  await using view = renderResource(
    <LocaleProvider locale="en-GB">
      <LockScreenNotificationsView platform="ios" />
    </LocaleProvider>,
  );
  expect(appsShown(view.container)).toEqual([
    "messages",
    "messages",
    "messages",
    "whatsapp",
    "messages",
  ]);
});

function appsShown(container: HTMLElement) {
  return [...container.querySelectorAll("[data-app]")].map((badge) =>
    badge.getAttribute("data-app"),
  );
}

test("the server renders iOS so the cached homepage is the same for every device", () => {
  const html = renderToString(
    <LocaleProvider locale="en-GB">
      <GroupChatVersusLink babyName="Alba" publicId="alba-willis" />
    </LocaleProvider>,
  );
  expect(html).toContain('data-platform="ios"');
});
