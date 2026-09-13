import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n";
import { PhotoLightbox } from "./photo-lightbox";
import { renderResource } from "@/test/renderResource";
import { WithOverlayControl } from "@/test/overlayControl";

test("renders the photo and delegates the close control to overlay navigation", async () => {
  const onOpenChange = vi.fn<(open: boolean) => void>();
  await using _view = renderResource(
    <LocaleProvider locale="en-GB">
      <WithOverlayControl
        onOpenChange={onOpenChange}
        onOpenChangeComplete={vi.fn<(open: boolean) => void>()}
        open
      >
        {(overlay) => (
          <PhotoLightbox
            alt="Photo of Nova"
            blurDataUrl="data:image/jpeg;base64,abc"
            overlay={overlay}
            photoUrl="https://cdn.example/full.jpg"
          />
        )}
      </WithOverlayControl>
    </LocaleProvider>,
  );

  // The dialog renders into a portal, so query the whole document body.
  expect(screen.getByAltText("Photo of Nova")).toBeTruthy();
  // The lightbox supplies its own close button instead of the dialog's.
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close photo" }));
  expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
});
