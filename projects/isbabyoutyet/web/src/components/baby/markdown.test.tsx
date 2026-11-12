import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Markdown } from "./markdown";

function html(message: string) {
  return renderToStaticMarkup(<Markdown>{message}</Markdown>);
}

test.each([
  {
    expected: "<p>On our way to the hospital!</p>",
    message: "On our way to the hospital!",
    name: "a single line",
  },
  { expected: "<p>First</p><p>Second</p>", message: "First\n\nSecond", name: "paragraphs" },
  {
    expected: "<p><strong>bold</strong>, <em>italic</em> and <del>gone</del></p>",
    message: "**bold**, *italic* and ~~gone~~",
    name: "emphasis",
  },
  { expected: "<ul><li>one</li><li>two</li></ul>", message: "- one\n- two", name: "a list" },
  { expected: "<p>one<br/>two</p>", message: "one  \ntwo", name: "a hard line break" },
  {
    expected: "<p>5 &lt; 6 &amp; snake_case</p>",
    message: "5 < 6 & snake_case",
    name: "text that only looks like markup",
  },
])("renders $name", (testCase) => {
  expect(html(testCase.message)).toBe(testCase.expected);
});

test("opens a link in a new tab that can't reach the page, written or bare", () => {
  expect(html("[photos](https://example.com/a) and https://example.com/b")).toBe(
    '<p><a href="https://example.com/a" rel="noopener noreferrer nofollow ugc" target="_blank">photos</a>' +
      ' and <a href="https://example.com/b" rel="noopener noreferrer nofollow ugc" target="_blank">https://example.com/b</a></p>',
  );
});

test("drops a link target that would run script", () => {
  expect(html("[click](javascript:alert(1))")).not.toContain("javascript:");
});

test("shows HTML in a message as text", () => {
  const rendered = html('<img src=x onerror="alert(1)"> <script>alert(1)</script>');

  expect(rendered).not.toContain("<img");
  expect(rendered).not.toContain("<script");
  expect(rendered).toContain("&lt;script&gt;");
});

test("gives a heading no id, so a message can't shadow the page's anchors", () => {
  expect(html("# feed")).toBe("<h1>feed</h1>");
});
