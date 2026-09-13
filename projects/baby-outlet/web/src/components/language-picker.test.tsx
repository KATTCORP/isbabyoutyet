import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LanguagePicker } from "./language-picker";
import { shouldApplyLocaleChange } from "@/lib/should-apply-locale-change";
import { renderResource } from "@/test/renderResource";

test("shouldApplyLocaleChange rejects empty, unsupported, and unchanged values", () => {
  expect(shouldApplyLocaleChange(null, "en-GB")).toBe(false);
  expect(shouldApplyLocaleChange("", "en-GB")).toBe(false);
  expect(shouldApplyLocaleChange("nope", "en-GB")).toBe(false);
  expect(shouldApplyLocaleChange("en-GB", "en-GB")).toBe(false);
  expect(shouldApplyLocaleChange("sv", "en-GB")).toBe(true);
});

function renderPicker(opts: {
  onValueChange: (locale: "en-GB" | "sv" | "en-US" | "es" | "pt-BR") => Promise<void>;
  value: "en-GB" | "sv";
}) {
  return renderResource(
    <LanguagePicker
      disabled={false}
      label="Language"
      onValueChange={opts.onValueChange}
      value={opts.value}
    />,
  );
}

test("ignores selecting the already-active locale", async () => {
  const onValueChange = vi.fn<(locale: "en-GB" | "sv" | "en-US" | "es" | "pt-BR") => Promise<void>>(
    async () => {},
  );

  await using _view = renderPicker({ onValueChange, value: "en-GB" });

  fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
  // British English is listed with a region qualifier; avoid matching en-US.
  const english = screen.getByRole("option", { name: /english.*uk|british|en-gb|united kingdom/i });
  fireEvent.pointerDown(english, { pointerType: "mouse" });
  fireEvent.click(english);

  expect(onValueChange).not.toHaveBeenCalled();
});

test("calls onValueChange when picking a different locale", async () => {
  const onValueChange = vi.fn<(locale: "en-GB" | "sv" | "en-US" | "es" | "pt-BR") => Promise<void>>(
    async () => {},
  );

  await using _view = renderPicker({ onValueChange, value: "en-GB" });

  fireEvent.click(screen.getByRole("combobox", { name: "Language" }));
  const swedish = screen.getByRole("option", { name: /^svenska$/i });
  fireEvent.pointerDown(swedish, { pointerType: "mouse" });
  fireEvent.click(swedish);

  await vi.waitFor(() => {
    expect(onValueChange).toHaveBeenCalledWith("sv");
  });
});
