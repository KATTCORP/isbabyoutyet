/** Copy text to the clipboard, falling back to `execCommand` when needed. */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.append(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (error) {
      document.body.removeChild(textArea);
      throw error;
    }
    document.body.removeChild(textArea);
  }
}
