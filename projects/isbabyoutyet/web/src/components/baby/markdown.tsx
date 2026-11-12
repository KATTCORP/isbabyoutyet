import MarkdownToJsx from "markdown-to-jsx/react";
import type { MarkdownToJSX } from "markdown-to-jsx/react";
import type { ComponentProps, ReactNode } from "react";

/**
 * A link someone wrote in a message. Anyone can post one, so it opens in a
 * new tab that can't reach this page, and search engines are told not to
 * follow it.
 */
function MessageLink(props: { children: ReactNode; href: string | undefined }) {
  return (
    <a
      className="font-medium text-primary underline underline-offset-2"
      href={props.href}
      rel="noopener noreferrer nofollow ugc"
      target="_blank"
    >
      {props.children}
    </a>
  );
}

/** A message's blocks, spaced. A long word, link or code span wraps instead of widening the page. */
function MessageBlocks(props: { children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2 break-words [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_pre_code]:bg-transparent [&_pre_code]:p-0">
      {props.children}
    </div>
  );
}

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/**
 * A heading without the `id` the renderer derives from its text, which could
 * shadow the page's own anchors. Sized for a message, not a page.
 */
function heading(Tag: HeadingTag, className: string) {
  return function MessageHeading(props: ComponentProps<HeadingTag>) {
    return <Tag className={className}>{props.children}</Tag>;
  };
}

// Tailwind's reset strips what the browser gives these elements (list
// markers, heading sizes, link colour), so each gets its look back here.
const OPTIONS: MarkdownToJSX.Options = {
  // Messages are plain markdown. HTML in one shows as the text it is.
  disableParsingRawHTML: true,
  // One line is still a paragraph.
  forceBlock: true,
  // Even one paragraph gets the wrapper, which spaces and wraps the blocks.
  forceWrapper: true,
  overrides: {
    a: MessageLink,
    blockquote: {
      props: { className: "border-l-4 border-border pl-3 italic text-muted-foreground" },
    },
    code: { props: { className: "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]" } },
    h1: heading("h1", "text-lg font-extrabold"),
    h2: heading("h2", "text-base font-extrabold"),
    h3: heading("h3", "font-extrabold"),
    h4: heading("h4", "font-extrabold"),
    h5: heading("h5", "font-extrabold"),
    h6: heading("h6", "font-extrabold"),
    hr: { props: { className: "border-border" } },
    img: { props: { className: "max-w-full rounded-lg", loading: "lazy" } },
    ol: { props: { className: "list-decimal pl-5" } },
    pre: { props: { className: "max-w-full overflow-x-auto rounded-md bg-muted p-3" } },
    table: { props: { className: "block max-w-full overflow-x-auto" } },
    td: { props: { className: "px-2 py-1 text-left align-top" } },
    th: { props: { className: "px-2 py-1 text-left font-extrabold" } },
    ul: { props: { className: "list-disc pl-5" } },
  },
  wrapper: MessageBlocks,
};

/** A feed message, written in markdown. */
export function Markdown(props: { children: string }) {
  return <MarkdownToJsx options={OPTIONS}>{props.children}</MarkdownToJsx>;
}
