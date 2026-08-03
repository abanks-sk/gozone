import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, KeyboardEvent, Platform, TextInput, ViewStyle } from 'react-native';

/**
 * Lifts the screen just enough to keep the focused text field above the keyboard.
 *
 * Applied once at the root of each app rather than per screen. Doing it per screen is how this
 * stayed broken: four auth screens had a `KeyboardAvoidingView`, every other form in the app had
 * nothing, and each new form had to remember to opt in.
 *
 * ## Why not the usual options
 *
 * - **`react-native-keyboard-controller`** is the better library, but it ships native code and so
 *   needs a development build. Everything here has to run in **Expo Go** — the same constraint
 *   that ruled out `react-native-maps`.
 * - **`KeyboardAvoidingView`** was already in use and still didn't work, for two reasons. Every
 *   call site passed `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`, and `undefined`
 *   on Android means *do nothing* — it defers to the window resizing instead. Under SDK 54's
 *   edge-to-edge the window does **not** resize; the app draws behind the keyboard. So Android,
 *   which is what the tester was using, got no keyboard handling at all.
 *
 * ## What this does instead
 *
 * Measures the real keyboard (`endCoordinates.screenY` is its top edge on the device, not a
 * guess) and the real position of the focused input, then shifts by **exactly the overlap** plus
 * a small gap.
 *
 * Shifting by the overlap rather than by the keyboard height is what makes this safe to apply
 * globally: a field that already clears the keyboard produces an overlap of zero, so the screen
 * does not move. A full-screen map with a search bar at the top stays put; only a form with a
 * field down near the bottom actually lifts.
 *
 * ## Known limits
 *
 * `Modal` renders in its own native view hierarchy, so a wrapper at the app root cannot move it.
 * Modals with fields near the bottom wrap their own content in this component — see the vendor
 * add-item sheet and `CashOutSheet`.
 *
 * No-op on web, where the browser scrolls the focused field into view by itself.
 */

/**
 * Breathing room between the bottom of the field and the top of the keyboard.
 *
 * Was 18, which put the field flush against the keyboard — technically visible, and reported as
 * "still quite low". This clears the field properly without shoving the rest of the form off the
 * top of the screen.
 */
const GAP = 28;

/**
 * How often to notice that focus moved to another field.
 *
 * Neither platform fires a keyboard event for it, so it has to be observed. 250ms was slow enough
 * to feel like a delayed jump when tabbing down a form; this is a JS-side registry read, not a
 * native call, and it only runs while the keyboard is up.
 */
const FOCUS_POLL_MS = 120;

export function KeyboardAvoider({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Top of the keyboard in screen coordinates; null while it is closed.
    let keyboardTop: number | null = null;
    // The input we last measured against — the focused component itself, compared by identity,
    // so that moving focus between fields can be noticed.
    let lastInput: unknown = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const animateTo = (value: number, duration: number) => {
      Animated.timing(shift, {
        toValue: value,
        duration: duration || 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    const reposition = (duration = 220) => {
      if (keyboardTop == null) return;
      const input = TextInput.State.currentlyFocusedInput?.();
      if (!input) { animateTo(0, duration); return; }

      /**
       * Measure against where the field would be with no lift applied.
       *
       * `measureInWindow` reports the field's position *including* this component's transform, so
       * measuring while already lifted returns a field that is comfortably above the keyboard —
       * overlap zero, animate back to zero, field hidden again. That is the "goes up then comes
       * back down" that was reported: the first lift was correct and the poll's next measurement
       * undid it 250ms later.
       *
       * Subtracting the current shift converts the measurement back to the resting position, which
       * makes repositioning idempotent — measure as often as you like and it settles on the same
       * answer instead of oscillating.
       *
       * `stopAnimation` is how the live value is read: a native-driven Animated.Value cannot be
       * read synchronously from JS, and it hands back the true current position mid-flight. We are
       * about to start a new animation anyway, so stopping the old one costs nothing. (Same trick
       * as the ride home's pull-down sheet.)
       */
      shift.stopAnimation((current: number) => {
        const applied = typeof current === 'number' ? current : 0;
        // measureInWindow can fire after the view has gone; guard against nonsense values.
        input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          if (typeof y !== 'number' || typeof h !== 'number') return;
          const restingBottom = (y - applied) + h;
          const overlap = restingBottom + GAP - keyboardTop!;
          animateTo(overlap > 0 ? -overlap : 0, duration);
        });
      });
    };

    const onShow = (e: KeyboardEvent) => {
      keyboardTop = e.endCoordinates.screenY;
      reposition(e.duration);
      // Record what we just measured against, so the watcher below only reacts to a real change of
      // field rather than repeating the work we have already done.
      lastInput = TextInput.State.currentlyFocusedInput?.() ?? null;
      // Neither platform fires a keyboard event when focus moves between two fields while the
      // keyboard is already open, and in a form those fields are at different heights — so
      // without this the screen would stay lifted for the previous one.
      if (!poll) {
        poll = setInterval(() => {
          const current: unknown = TextInput.State.currentlyFocusedInput?.() ?? null;
          if (current !== lastInput) { lastInput = current; reposition(140); }
        }, FOCUS_POLL_MS);
      }
    };

    const onHide = (e: KeyboardEvent) => {
      keyboardTop = null;
      lastInput = null;
      if (poll) { clearInterval(poll); poll = null; }
      animateTo(0, e?.duration);
    };

    // iOS gets the "will" events so the lift runs with the keyboard rather than after it.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
      // Fired when the keyboard changes size in place — switching to an emoji or number pad, or
      // a autocorrect bar appearing. The top edge moves, so the lift has to be recomputed.
      Keyboard.addListener('keyboardDidChangeFrame', (e: KeyboardEvent) => {
        keyboardTop = e.endCoordinates.screenY;
        reposition(e.duration);
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
      if (poll) clearInterval(poll);
    };
  }, [shift]);

  return (
    <Animated.View style={[{ flex: 1 }, style, { transform: [{ translateY: shift }] }]}>
      {children}
    </Animated.View>
  );
}
