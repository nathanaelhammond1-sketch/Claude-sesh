import { todayISO } from './dates';

/** Single source of "now" so tests can control time deterministically. */
let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

export function today() {
  return todayISO(now());
}

export function setClockForTests(fn: (() => Date) | null) {
  override = fn;
}
