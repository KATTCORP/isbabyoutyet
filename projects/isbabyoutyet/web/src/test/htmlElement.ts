/**
 * Parses a Testing Library / DOM node to a concrete HTML element.
 * Prototype checks are the boundary; tests should not assert these.
 */

function isHtml<T extends Element>(
  node: EventTarget | Node | null | undefined,
  ctor: { prototype: T },
): node is T {
  return (
    node !== null && node !== undefined && Object.prototype.isPrototypeOf.call(ctor.prototype, node)
  );
}

export function htmlButton(node: EventTarget | Node | null | undefined) {
  if (isHtml(node, HTMLButtonElement)) {
    return node;
  }
  throw new Error("expected HTMLButtonElement");
}

export function htmlInput(node: EventTarget | Node | null | undefined) {
  if (isHtml(node, HTMLInputElement)) {
    return node;
  }
  throw new Error("expected HTMLInputElement");
}

export function htmlTextArea(node: EventTarget | Node | null | undefined) {
  if (isHtml(node, HTMLTextAreaElement)) {
    return node;
  }
  throw new Error("expected HTMLTextAreaElement");
}

export function htmlImage(node: EventTarget | Node | null | undefined) {
  if (isHtml(node, HTMLImageElement)) {
    return node;
  }
  throw new Error("expected HTMLImageElement");
}

export function htmlElement(node: EventTarget | Node | null | undefined) {
  if (isHtml(node, HTMLElement)) {
    return node;
  }
  throw new Error("expected HTMLElement");
}
