import MarkdownToJsx from "markdown-to-jsx/react";
import type { MarkdownToJSX } from "markdown-to-jsx/react";
import { Fragment } from "react";
import type { ComponentProps, ReactNode } from "react";

/**
 * A link someone wrote in a message. Anyone can post one, so it opens in a
 * new tab that can't reach this page, and search engines are told not to
 * follow it.
 */
function MessageLink(props: { children: ReactNode; href: string | undefined }) {
  return (
    <a href={props.href} rel="noopener noreferrer nofollow ugc" target="_blank">
      {props.children}
    </a>
  );
}

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

/** A heading without the `id` the renderer derives from its text, which could shadow the page's own anchors. */
function heading(Tag: HeadingTag) {
  return function MessageHeading(props: ComponentProps<HeadingTag>) {
    return <Tag>{props.children}</Tag>;
  };
}

const OPTIONS: MarkdownToJSX.Options = {
  // Messages are plain markdown. HTML in one shows as the text it is.
  disableParsingRawHTML: true,
  // One line is still a paragraph.
  forceBlock: true,
  overrides: {
    a: MessageLink,
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
    img: { props: { loading: "lazy" } },
  },
  wrapper: Fragment,
};

/** A feed message, written in markdown. */
export function Markdown(props: { children: string }) {
  return <MarkdownToJsx options={OPTIONS}>{props.children}</MarkdownToJsx>;
}
