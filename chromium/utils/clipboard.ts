/**
 * Clipboard writes with the page's own Clipboard API (no `clipboardWrite`
 * permission). Call them inside the click: the browser only allows a write
 * that follows the user's action. Each resolves to whether it worked.
 */
function settled(write: () => Promise<void>): Promise<boolean> {
  try {
    return write().then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

export const copyText = (text: string) => settled(() => navigator.clipboard.writeText(text));

/**
 * Starts a write whose value arrives later (a PNG being drawn, a short link
 * the server is creating): the write belongs to the click that started it.
 */
export const copyWhenReady = (type: "text/plain" | "image/png", value: Promise<Blob>) =>
  settled(() => navigator.clipboard.write([new ClipboardItem({ [type]: value })]));
