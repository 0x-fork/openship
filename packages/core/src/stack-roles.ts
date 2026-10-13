// Pure: detection (reading the Gemfile, walking the tree) is the caller's job.

import type { StackId, StackRole } from "./stacks";

/**
 * Opt-in Laravel cache-warming prefix (issue #19). `php artisan optimize` warms
 * Laravel's config/route/event/view caches. The `&&` chains the original web
 * command so the server process still becomes PID 1 and receives SIGTERM.
 */
const LARAVEL_WARMUP_PREFIX = "php artisan optimize && ";

/**
 * Apply the opt-in Laravel cache-warming prefix to a resolved WEB command.
 *
 * Returns the command unchanged unless the stack is `laravel` AND `optimize` is
 * `true`. A project that does not opt in keeps a byte-identical web command, so
 * the shared stack presets in `stacks.ts` stay untouched. This resolver prefixes
 * the web command only. Workers and schedulers are never warmed here.
 */
export function resolveWebCommand(input: {
  stack: StackId;
  command: string;
  optimize?: boolean;
}): string {
  if (input.stack !== "laravel" || input.optimize !== true) return input.command;
  return `${LARAVEL_WARMUP_PREFIX}${input.command}`;
}

export interface ResolveStackRolesInput {
  /** Non-web preset roles registered on the stack (STACKS[id].defaultRoles). */
  defaultRoles?: readonly StackRole[];
  /** Dependency names detected in the project (e.g. parsed Gemfile gems). */
  deps?: readonly string[];
  /** File paths detected in the project (e.g. "bin/jobs"). */
  files?: readonly string[];
  /**
   * openship.json `roles`, when the field is present AT ALL - including `[]`.
   * Leave undefined when the config has no `roles` key so presets can apply;
   * an explicit array (empty or not) replaces presets entirely.
   */
  configRoles?: readonly StackRole[];
}

function matchesGates(role: StackRole, deps: ReadonlySet<string>, files: ReadonlySet<string>): boolean {
  const { when, unless } = role;
  if (when?.deps && !when.deps.every((d) => deps.has(d.toLowerCase()))) return false;
  if (when?.files && !when.files.every((f) => files.has(f))) return false;
  if (unless?.deps?.some((d) => deps.has(d.toLowerCase()))) return false;
  if (unless?.files?.some((f) => files.has(f))) return false;
  return true;
}

/** Explicit config roles win; otherwise matching presets, minus ambiguous kinds. */
export function resolveStackRoles(input: ResolveStackRolesInput): StackRole[] {
  if (input.configRoles !== undefined) return [...input.configRoles];

  const deps = new Set((input.deps ?? []).map((d) => d.toLowerCase()));
  const files = new Set(input.files ?? []);
  const matched = (input.defaultRoles ?? []).filter((role) => matchesGates(role, deps, files));

  const countByKind = new Map<string, number>();
  for (const role of matched) {
    countByKind.set(role.kind, (countByKind.get(role.kind) ?? 0) + 1);
  }
  return matched.filter((role) => countByKind.get(role.kind) === 1);
}
