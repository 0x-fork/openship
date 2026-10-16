/** Inspect shell assignments without executing shell syntax or expanding secrets. */
export interface CommandEnvironment {
  variables: Record<string, string>;
  keys: string[];
  command: string;
  migratable: boolean;
}

export function inspectCommandEnvironment(input: string): CommandEnvironment {
  const variables: Record<string, string> = {};
  const keys: string[] = [];
  let offset = 0;
  let safe = true;
  const prefix = input.match(/^\s*(env|cross-env|export)\s+/);
  if (prefix) offset = prefix[0].length;
  while (offset < input.length) {
    const match = input.slice(offset).match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match) break;
    const key = match[1]!;
    offset += match[0].length;
    let value = "";
    let quote = "";
    while (offset < input.length) {
      const char = input[offset]!;
      if (!quote && /\s|[;&|<>]/.test(char)) break;
      offset++;
      if (char === "'" && quote !== '"') {
        quote = quote ? "" : "'";
        continue;
      }
      if (char === '"' && quote !== "'") {
        quote = quote ? "" : '"';
        continue;
      }
      if (char === "\\" && quote !== "'") {
        const next = input[offset++];
        if (next === undefined || next === "\n") {
          safe = false;
          break;
        }
        // Inside double quotes, backslash only escapes these shell characters.
        if (quote === '"' && !/[\$`"\\]/.test(next)) value += "\\";
        value += next;
        continue;
      }
      if (quote !== "'" && /[$`]/.test(char)) safe = false;
      if (!quote && /[~*?\[\]{}()]/.test(char)) safe = false;
      value += char;
    }
    if (quote || Object.hasOwn(variables, key)) safe = false;
    variables[key] = value;
    keys.push(key);
  }
  let command = input.slice(offset).trimStart();
  if (prefix?.[1] === "export") {
    if (command.startsWith("&&")) command = command.slice(2).trimStart();
    else safe = false;
  }
  if (!command || /^[;&|<>]/.test(command)) safe = false;
  return {
    variables,
    keys,
    command: keys.length ? command : input,
    migratable: keys.length > 0 && safe,
  };
}

/** Names only; suitable for preflight, logs, and audit records. */
export function commandEnvironmentWarning(command: string, label: string): string | undefined {
  const result = inspectCommandEnvironment(command);
  if (!result.keys.length) return;
  return `${label} embeds environment variables: ${result.keys.join(", ")}. Manage these in Environment; saved variables are available during builds and at runtime.${result.migratable ? "" : " This command uses shell expressions and needs a manual edit."}`;
}
