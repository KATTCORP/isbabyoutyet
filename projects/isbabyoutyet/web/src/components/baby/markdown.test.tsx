import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Markdown } from "./markdown";

/** The message as the server renders it, without the wrapper around its blocks. */
function render(message: string) {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<Markdown>{message}</Markdown>);
  const blocks = container.firstElementChild;
  if (!blocks) {
    throw new Error("expected the message's wrapper");
  }
  return blocks;
}

/** The blocks' markup with styling left out. */
function structure(message: string) {
  return render(message).innerHTML.replaceAll(/ class="[^"]*"/g, "");
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
  { expected: "<p>one<br>two</p>", message: "one  \ntwo", name: "a hard line break" },
  {
    expected: "<p>5 &lt; 6 &amp; snake_case</p>",
    message: "5 < 6 & snake_case",
    name: "text that only looks like markup",
  },
])("renders $name", (testCase) => {
  expect(structure(testCase.message)).toBe(testCase.expected);
});

test("opens a link in a new tab that can't reach the page, written or bare", () => {
  const links = render(
    "[photos](https://example.com/a) and https://example.com/b",
  ).querySelectorAll("a");

  expect([...links].map((link) => link.getAttribute("href"))).toEqual([
    "https://example.com/a",
    "https://example.com/b",
  ]);
  for (const link of links) {
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow ugc");
    expect(link.getAttribute("target")).toBe("_blank");
  }
});

test("drops a link target that would run script", () => {
  expect(render("[click](javascript:alert(1))").querySelector("a")?.hasAttribute("href")).toBe(
    false,
  );
});

test("shows HTML in a message as text", () => {
  const blocks = render('<img src=x onerror="alert(1)"> <script>alert(1)</script> <b>bold</b>');

  expect(blocks.querySelector("img, script, b")).toBeNull();
  expect(blocks.textContent).toContain("<script>alert(1)</script> <b>bold</b>");
});

test("gives a heading no id, so a message can't shadow the page's anchors", () => {
  expect(render("# feed").querySelector("h1")?.hasAttribute("id")).toBe(false);
});

test("gives back the looks the CSS reset strips", () => {
  const blocks = render(
    "## Heading\n\n- item\n\n1. first\n\n> quote\n\n[link](https://example.com) and `code`",
  );
  const classOf = (selector: string) => blocks.querySelector(selector)?.getAttribute("class") ?? "";

  expect(classOf("ul")).toContain("list-disc");
  expect(classOf("ol")).toContain("list-decimal");
  expect(classOf("h2")).toContain("font-extrabold");
  expect(classOf("blockquote")).toContain("border-l-4");
  expect(classOf("a")).toContain("underline");
  expect(classOf("code")).toContain("font-mono");
});

test("spaces a message's blocks and wraps long words, even for a single paragraph", () => {
  const wrapper = render("W".repeat(240)).getAttribute("class") ?? "";

  expect(wrapper).toContain("space-y-2");
  expect(wrapper).toContain("[overflow-wrap:anywhere]");
});
