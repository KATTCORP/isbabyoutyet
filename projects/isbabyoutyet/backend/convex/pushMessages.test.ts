import { expect, test } from "vitest";
import { getOwnerPushMessage, getPushMessage, truncateOwnerPushBody } from "../src/pushMessages";
import type { OwnerMessagePushEvent } from "../src/pushMessages";
import { SUPPORTED_LOCALES } from "../src/i18n";
import type { SupportedLocale } from "../src/i18n";
import type { NotifiableStatus } from "../src/types";

function msg(opts: { babyName: string; locale: SupportedLocale; status: NotifiableStatus }) {
  return getPushMessage(opts);
}

test("push copy follows the baby's locale and dialect", () => {
  expect(msg({ babyName: "Nova", locale: "sv", status: "labor_started" })).toEqual({
    body: "Värkarna har börjat. Kika in för senaste nytt!",
    title: "Nova: Förlossningen är igång!",
  });
  expect([
    msg({ babyName: "Nova", locale: "en-GB", status: "labor_started" }),
    msg({ babyName: "Nova", locale: "en-GB", status: "gone_to_hospital" }),
    msg({ babyName: "Nova", locale: "en-GB", status: "born" }),
    msg({ babyName: "Nova", locale: "en-GB", status: "photo_added" }),
    msg({ babyName: "Nova", locale: "en-GB", status: "update_posted" }),
  ]).toEqual([
    { body: "It's happening! Tap for the latest.", title: "Nova: Labour's started!" },
    { body: "They're heading in. Tap for the latest.", title: "Nova is heading to hospital!" },
    { body: "The wait is over. Tap for the happy news.", title: "Nova is here! 🎉" },
    { body: "Tap to have a look!", title: "Nova: New photo! 📸" },
    { body: "Tap for the latest.", title: "Nova: New update" },
  ]);
  expect([
    msg({ babyName: "Nova", locale: "en-US", status: "labor_started" }),
    msg({ babyName: "Nova", locale: "en-US", status: "gone_to_hospital" }),
    msg({ babyName: "Nova", locale: "en-US", status: "born" }),
    msg({ babyName: "Nova", locale: "en-US", status: "photo_added" }),
  ]).toEqual([
    { body: "It's happening! Tap for the latest.", title: "Nova: Labor's started!" },
    {
      body: "They're heading in. Tap for the latest.",
      title: "Nova is heading to the hospital!",
    },
    { body: "The wait is over. Tap for the happy news.", title: "Nova is here! 🎉" },
    { body: "Tap to take a look!", title: "Nova: New photo! 📸" },
  ]);
  expect(msg({ babyName: "Nova", locale: "es", status: "born" }).title).toBe(
    "¡Nova ya está aquí! 🎉",
  );
  expect([
    msg({ babyName: "Nova", locale: "pt-BR", status: "labor_started" }).title,
    msg({ babyName: "Nova", locale: "pt-BR", status: "gone_to_hospital" }).title,
    msg({ babyName: "Nova", locale: "pt-BR", status: "born" }).title,
    msg({ babyName: "Nova", locale: "pt-BR", status: "photo_added" }).title,
  ]).toEqual([
    "Nova: o trabalho de parto começou!",
    "Nova está a caminho do hospital!",
    "Nova chegou! 🎉",
    "Foto nova de Nova! 📸",
  ]);
});

test("owner message push copy names the visitor and truncates long notes", () => {
  expect(
    getOwnerPushMessage({
      authorName: "Grandma",
      babyName: "Nova",
      event: "created",
      locale: "en-GB",
      message: "Can't wait to meet you!",
    }),
  ).toEqual({
    body: "Grandma: Can't wait to meet you!",
    title: "New message for Nova",
  });
  expect(
    getOwnerPushMessage({
      authorName: "Grandma",
      babyName: "Nova",
      event: "updated",
      locale: "en-GB",
      message: "Fixed the typo",
    }),
  ).toEqual({
    body: "Fixed the typo",
    title: "Grandma updated their message on Nova's page",
  });
  expect(
    getOwnerPushMessage({
      authorName: "Mormor",
      babyName: "Nova",
      event: "updated",
      locale: "sv",
      message: "Korrigerade stavningen",
    }),
  ).toEqual({
    body: "Korrigerade stavningen",
    title: "Mormor uppdaterade sin hälsning på Novas sida",
  });
  expect(truncateOwnerPushBody("short")).toBe("short");
  expect(truncateOwnerPushBody("x".repeat(181)).length).toBe(180);
  expect(truncateOwnerPushBody("x".repeat(181)).endsWith("…")).toBe(true);

  const events = ["created", "updated"] as const satisfies Array<OwnerMessagePushEvent>;
  for (const locale of SUPPORTED_LOCALES) {
    for (const event of events) {
      const copy = getOwnerPushMessage({
        authorName: "Ada",
        babyName: "Nova",
        event,
        locale,
        message: "Hi from the waiting room",
      });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  }
});
