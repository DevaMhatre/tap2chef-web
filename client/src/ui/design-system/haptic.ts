// A light tick on commit. Android only; elsewhere this does nothing.
export function haptic(): void {
  navigator.vibrate?.(10);
}

// Firmer, for the end of a job: a bill settled. Used once per flow.
export function hapticSuccess(): void {
  navigator.vibrate?.([12, 70, 24]);
}
