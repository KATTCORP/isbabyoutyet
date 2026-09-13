import { expect, test } from "vitest";
import { htmlButton, htmlElement, htmlImage, htmlInput, htmlTextArea } from "./htmlElement";

test("htmlButton returns a button and rejects other nodes", () => {
  const button = document.createElement("button");
  expect(htmlButton(button)).toBe(button);
  expect(() => htmlButton(document.createElement("div"))).toThrow("expected HTMLButtonElement");
  expect(() => htmlButton(null)).toThrow("expected HTMLButtonElement");
  expect(() => htmlButton(undefined)).toThrow("expected HTMLButtonElement");
});

test("htmlInput returns an input and rejects other nodes", () => {
  const input = document.createElement("input");
  expect(htmlInput(input)).toBe(input);
  expect(() => htmlInput(document.createElement("div"))).toThrow("expected HTMLInputElement");
  expect(() => htmlInput(null)).toThrow("expected HTMLInputElement");
  expect(() => htmlInput(undefined)).toThrow("expected HTMLInputElement");
});

test("htmlTextArea returns a textarea and rejects other nodes", () => {
  const textarea = document.createElement("textarea");
  expect(htmlTextArea(textarea)).toBe(textarea);
  expect(() => htmlTextArea(document.createElement("div"))).toThrow("expected HTMLTextAreaElement");
  expect(() => htmlTextArea(null)).toThrow("expected HTMLTextAreaElement");
  expect(() => htmlTextArea(undefined)).toThrow("expected HTMLTextAreaElement");
});

test("htmlImage returns an image and rejects other nodes", () => {
  const image = document.createElement("img");
  expect(htmlImage(image)).toBe(image);
  expect(() => htmlImage(document.createElement("div"))).toThrow("expected HTMLImageElement");
  expect(() => htmlImage(null)).toThrow("expected HTMLImageElement");
  expect(() => htmlImage(undefined)).toThrow("expected HTMLImageElement");
});

test("htmlElement returns an HTMLElement and rejects non-elements", () => {
  const div = document.createElement("div");
  expect(htmlElement(div)).toBe(div);
  expect(() => htmlElement(document.createTextNode("x"))).toThrow("expected HTMLElement");
  expect(() => htmlElement(null)).toThrow("expected HTMLElement");
  expect(() => htmlElement(undefined)).toThrow("expected HTMLElement");
});
