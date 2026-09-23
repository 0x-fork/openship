import { readdir } from "node:fs/promises";
import { posix as path } from "node:path";
import type { CommandExecutor } from "../../types";
import { sq } from "../local-shell";

/** Certbot appends a numeric suffix when an imported certificate occupies the requested name. */
export function isCertbotLineageName(name: string, hostname: string): boolean {
  return (
    name === hostname ||
    (name.startsWith(`${hostname}-`) && /^\d{4,}$/.test(name.slice(hostname.length + 1)))
  );
}

/** Read candidate directories in the certificate store's own execution namespace. */
export async function certbotLineageDirs(
  executor: CommandExecutor | null,
  hostname: string,
  certDir = "/etc/letsencrypt/live",
): Promise<string[]> {
  const names = executor
    ? (await executor.exec(`ls -1 ${sq(certDir)} 2>/dev/null`).catch(() => "")).split("\n")
    : await readdir(certDir).catch(() => [] as string[]);
  const dirs = names
    .filter((name) => isCertbotLineageName(name, hostname))
    .sort()
    .reverse()
    .map((name) => path.join(certDir, name));
  return dirs.length ? dirs : [path.join(certDir, hostname)];
}
