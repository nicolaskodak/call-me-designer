const TYPING_TAGS = new Set(['input', 'textarea', 'select']);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    TYPING_TAGS.has(target.tagName.toLowerCase()) ||
    target.isContentEditable === true ||
    target.contentEditable === 'true'
  );
}
