import { expect, test } from "vitest";
import { passwordResetCopy } from "./copy";
import { renderPasswordResetEmail } from "./render";

const resetUrl = "https://isbabyoutyet.com/auth/reset-password?token=secret";

function ctaStyle(html: string, href: string) {
  const hrefAttr = `href="${href}"`;
  const hrefIndex = html.indexOf(hrefAttr);
  expect(hrefIndex).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<a", hrefIndex);
  const end = html.indexOf(">", hrefIndex);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end + 1);
}

test("password reset template includes the reset link in text and html", async () => {
  const message = await renderPasswordResetEmail({
    resetUrl,
    subjectPrefix: "",
  });

  expect(message.subject).toBe(passwordResetCopy.subject);
  expect(message.text).toContain(`Reset your password: ${resetUrl}`);
  expect(message.html).toContain(`href="${resetUrl}"`);
  expect(message.html).toContain(passwordResetCopy.heading);
  expect(message.html).toContain(passwordResetCopy.wordmark);
  expect(message.html).toContain("rgb(244,157,37)");
  expect(message.html).toContain("rgb(253,251,247)");
  expect(message.html).toContain("6px 6px 0 0 rgba(244, 157, 37, 0.3)");
  expect(message.html).toContain("Nunito");
  expect(ctaStyle(message.html, resetUrl)).toContain("max-width:none");
  expect(ctaStyle(message.html, resetUrl)).toContain("width:auto");
});

test("preview prefix appears on the subject and in a banner", async () => {
  const message = await renderPasswordResetEmail({
    resetUrl,
    subjectPrefix: "[Preview] ",
  });

  expect(message.subject).toBe(`[Preview] ${passwordResetCopy.subject}`);
  expect(message.html).toContain(passwordResetCopy.previewBanner);
});

test("production html omits the preview banner", async () => {
  const message = await renderPasswordResetEmail({
    resetUrl,
    subjectPrefix: "",
  });

  expect(message.html).not.toContain(passwordResetCopy.previewBanner);
});

test("password reset html escapes special characters in the reset url", async () => {
  const hostileUrl = `https://isbabyoutyet.com/auth/reset-password?token=a&next="x"'<y>`;
  const message = await renderPasswordResetEmail({
    resetUrl: hostileUrl,
    subjectPrefix: "",
  });

  expect(message.html).toContain("https://isbabyoutyet.com/auth/reset-password?token=a&amp;next=");
  expect(message.html).not.toContain(`href="${hostileUrl}"`);
  expect(message.text).toContain(hostileUrl);
});
