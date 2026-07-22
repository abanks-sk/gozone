/**
 * One-shot signal from the map picker to the screen that opened it.
 *
 * Picking a place on the map fills the field straight away, but the picker sits
 * on top of the search / delivery-address list — so closing it would drop the
 * user back on that list, where the only visible change is a new "Recent" row.
 * The picker raises this flag before closing; the list screen consumes it when
 * it regains focus and closes itself too, landing the user back on the composer
 * with the field filled.
 *
 * A flag (rather than router.dismiss(2)) because the screens live in different
 * stacks: the shop address screen is inside the nested `(shop)` stack while the
 * picker is a root route, so popping twice on one stack would eject the user
 * from the shop flow entirely.
 */
let picked = false;

export function signalPicked() {
  picked = true;
}

/** Returns true once per signal, then resets. */
export function consumePicked(): boolean {
  const was = picked;
  picked = false;
  return was;
}
