/**
 * True for a key press that belongs to an input method: the Enter that accepts
 * a candidate, the arrows that move through candidates, the Escape that
 * cancels them. Such a key is never a command to the field's own list or view.
 * 229 is what browsers report when they say it only through the key code.
 */
export const isComposing = (event: { isComposing: boolean; keyCode: number }): boolean =>
  event.isComposing || event.keyCode === 229;
