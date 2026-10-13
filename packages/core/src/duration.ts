/**
 * Compose / Go duration strings ("90s", "1m30s", "500ms", "1.5h") and bare
 * numbers of seconds ("30"), the forms compose's `stop_grace_period` and
 * healthcheck timings take.
 *
 * ONE grammar for every reader. The openship.json parser rejects a value that
 * doesn't match it, the compose parser warns about one, and the runtime treats
 * one as unset (Docker keeps its default). The match is anchored on purpose: a
 * scan for unit groups reads "1m30" as one minute and drops the 30, and "abc5s"
 * as five seconds: a value nobody asked for, applied without a word.
 */
const DURATION_RE = /^(?:\d+(?:\.\d+)?|(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h))+)$/;
const BARE_SECONDS_RE = /^\d+(?:\.\d+)?$/;

const UNIT_NS: Record<string, number> = {
  ns: 1,
  us: 1_000,
  µs: 1_000,
  ms: 1_000_000,
  s: 1_000_000_000,
  m: 60_000_000_000,
  h: 3_600_000_000_000,
};

/** True when the WHOLE string is a duration. No trimming: `" 90s"` is not one. */
export function isComposeDuration(value: string): boolean {
  return DURATION_RE.test(value);
}

/**
 * Nanoseconds (the unit Docker's Engine API takes for healthcheck timings), or
 * undefined when the value is absent, blank, or not a whole duration.
 * Surrounding whitespace is tolerated here, as the runtime always has.
 */
export function parseComposeDurationNs(
  value: string | number | null | undefined,
): number | undefined {
  if (value == null) return undefined;
  const str = String(value).trim();
  if (!str || !DURATION_RE.test(str)) return undefined;
  if (BARE_SECONDS_RE.test(str)) return Math.round(parseFloat(str) * UNIT_NS.s!);
  const groups = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = groups.exec(str)) !== null) {
    total += parseFloat(m[1]!) * UNIT_NS[m[2]!]!;
  }
  return Math.round(total);
}
