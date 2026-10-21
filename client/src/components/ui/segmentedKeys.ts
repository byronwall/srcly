const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Keyboard for a segmented control (radiogroup or tablist), put on the group:
 * arrows move and select, wrapping; Home and End jump to the ends. Options use
 * a roving tabindex (only the selected one is tabbable), so focus follows.
 * `ids` lists the enabled options only, in order.
 */
export function segmentedKeyDown<T>(e: KeyboardEvent, ids: readonly T[], current: T, select: (id: T) => void) {
  const i = ids.indexOf(current);
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? ids.length - 1 : e.key in STEP ? i + STEP[e.key] : null;
  if (next === null || e.altKey || e.metaKey || e.ctrlKey) return;
  // The graph moves its selection with arrows too; this group owns them while focused.
  e.preventDefault();
  e.stopPropagation();
  const index = (next + ids.length) % ids.length;
  select(ids[index]);
  const options = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
    ':is([role="radio"], [role="tab"]):not(:disabled)'
  );
  options[index]?.focus();
}
