// A light tick on commit. Android only; elsewhere this does nothing.
export function haptic(): void {
  navigator.vibrate?.(10);
}
