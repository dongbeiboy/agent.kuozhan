import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Parsed agent definition from an .agent.md file.
 */
export interface AgentDefinition {
  /** Agent name (derived from filename or frontmatter "name") */
  name: string;
  /** Short description (frontmatter "description" field) */
  description: string;
  /** Tool restrictions (frontmatter "tools" field) */
  tools?: string[];
  /** Whether the agent is disabled (frontmatter "disabled" field) */
  disabled?: boolean;
  /** The markdown body (system prompt / instructions) */
  body: string;
  /** Absolute path to the source file */
  filePath: string;
  /** Raw frontmatter object for extensibility */
  frontmatter: Record<string, unknown>;
}

/**
 * Parse YAML-like frontmatter delimited by --- lines.
 * Simple regex-based parser — avoids dependency on a YAML library.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatter: Record<string, unknown> = {};
  let body = content;

  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter, body };
  }

  const fmBlock = match[1];
  body = match[2].trimStart();

  // Simple line-by-line YAML parser
  let currentKey: string | null = null;
  for (const line of fmBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Array items (lines starting with -)
    if (trimmed.startsWith('- ') && currentKey) {
      const value = trimmed.slice(2).trim();
      const current = frontmatter[currentKey];
      if (Array.isArray(current)) {
        current.push(value);
      }
      continue;
    }

    // Key: Value pairs
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    let value: unknown;
    if (rawValue === 'true') {
      value = true;
    } else if (rawValue === 'false') {
      value = false;
    } else if (rawValue === '' || rawValue === 'null' || rawValue === '~') {
      value = rawValue === '' ? '' : null;
    } else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
      value = Number(rawValue);
    } else {
      // Strip surrounding quotes
      value = rawValue.replace(/^['"](.*)['"]$/, '$1');
    }

    if (rawValue === '') {
      // Empty value means start of a list
      frontmatter[key] = [];
      currentKey = key;
    } else {
      frontmatter[key] = value;
      currentKey = key;
    }
  }

  return { frontmatter, body };
}

/**
 * Load and parse a single .agent.md file.
 */
export function parseAgentFile(filePath: string): AgentDefinition | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (!body.trim()) {
      console.warn(`[Custom Agent Loader] Empty body in: ${filePath}`);
    }

    const baseName = path.basename(filePath, '.agent.md');

    return {
      name: (frontmatter.name as string) || baseName,
      description: (frontmatter.description as string) || `Custom agent: ${baseName}`,
      tools: frontmatter.tools as string[] | undefined,
      disabled: frontmatter.disabled as boolean | undefined,
      body,
      filePath,
      frontmatter,
    };
  } catch (err) {
    console.error(`[Custom Agent Loader] Failed to parse ${filePath}:`, err);
    return null;
  }
}

/**
 * Scans directories for .agent.md files and returns parsed definitions.
 */
export function scanAgentDirectories(directories: string[]): AgentDefinition[] {
  const agents: AgentDefinition[] = [];
  const seen = new Set<string>();

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith('.agent.md')) {
          continue;
        }

        const filePath = path.join(dir, entry);
        if (seen.has(filePath)) {
          continue;
        }
        seen.add(filePath);

        const agent = parseAgentFile(filePath);
        if (agent && !agent.disabled) {
          agents.push(agent);
        }
      }
    } catch (err) {
      console.error(`[Custom Agent Loader] Failed to scan directory ${dir}:`, err);
    }
  }

  return agents;
}

/**
 * Collect all existing agent names across the given directories.
 * (Excludes disabled agents.)
 */
export function collectAgentNames(directories: string[]): Set<string> {
  const names = new Set<string>();
  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.agent.md')) continue;
        const agent = parseAgentFile(path.join(dir, entry));
        if (agent) {
          names.add(agent.name);
        }
      }
    } catch { /* skip unreadable */ }
  }
  return names;
}

/**
 * Rewrite the `name` field in an .agent.md file's frontmatter.
 * Used to auto-rename slot agents when name conflicts are detected.
 */
export function renameAgentName(filePath: string, newName: string): boolean {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let inFrontmatter = false;
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '---') {
        inFrontmatter = !inFrontmatter;
        continue;
      }
      if (inFrontmatter && /^name\s*:/i.test(trimmed)) {
        const indent = lines[i].match(/^\s*/)?.[0] || '';
        lines[i] = `${indent}name: ${newName}`;
        changed = true;
        break;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    }
    return changed;
  } catch {
    return false;
  }
}

/**
 * Detect name conflicts between slot agents and user agents.
 * Any slot whose name matches a user agent's name gets auto-renamed
 * to `cal-<name>` in its frontmatter.
 *
 * Returns the set of names that were changed.
 */
export function resolveSlotConflicts(
  directories: string[],
  slotsDir: string,
): Set<string> {
  const renamed = new Set<string>();

  // 1. Collect names from non-slot directories (user agents)
  const userNames = new Set<string>();
  for (const dir of directories) {
    if (dir === slotsDir) continue;
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.agent.md')) continue;
        const agent = parseAgentFile(path.join(dir, entry));
        if (agent && !agent.disabled) {
          userNames.add(agent.name);
        }
      }
    } catch { /* skip */ }
  }

  // 2. Check slot agents for conflicts
  if (!fs.existsSync(slotsDir)) return renamed;

  try {
    for (const entry of fs.readdirSync(slotsDir)) {
      if (!entry.endsWith('.agent.md')) continue;
      const filePath = path.join(slotsDir, entry);
      const agent = parseAgentFile(filePath);
      if (!agent || agent.disabled) continue;

      if (userNames.has(agent.name)) {
        const calName = `cal-${agent.name}`;

        // If even cal-name conflicts (e.g. user also has cal-batch-worker),
        // append a counter suffix
        let finalName = calName;
        let counter = 2;
        while (userNames.has(finalName) || renamed.has(finalName)) {
          finalName = `cal-${agent.name}-${counter}`;
          counter++;
        }

        if (renameAgentName(filePath, finalName)) {
          renamed.add(finalName);
          console.log(`[Custom Agent Loader] Slot renamed: ${agent.name} → ${finalName} (name conflict)`);
        }
      }
    }
  } catch { /* skip */ }

  return renamed;
}

/**
 * Create a new .agent.md file from a template.
 */
export function createAgentFile(
  folderPath: string,
  name: string,
  description: string,
  bodyTemplate?: string,
): string {
  const safeName = name.replace(/[<>:"/\\|?*]/g, '-').trim();
  const fileName = `${safeName}.agent.md`;
  const filePath = path.join(folderPath, fileName);

  const content = [
    '---',
    `name: ${safeName}`,
    `description: ${description}`,
    'tools: []',
    '---',
    '',
    bodyTemplate || `You are ${safeName}, a custom AI agent.`,
    '',
  ].join('\n');

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Set the disabled state of an agent in its .agent.md frontmatter.
 * Adds `disabled: true/false` if not present, updates it if it exists.
 */
export function setAgentDisabled(filePath: string, disabled: boolean): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let inFrontmatter = false;
  let fmStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (trimmed === '---') {
      if (fmStart === -1) {
        fmStart = i;
        inFrontmatter = true;
      } else {
        break; // reached closing ---
      }
      continue;
    }

    if (inFrontmatter && /^disabled\s*:/i.test(trimmed)) {
      const indent = lines[i].match(/^\s*/)?.[0] || '';
      lines[i] = `${indent}disabled: ${disabled}`;
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
      return;
    }
  }

  // Not found — insert after frontmatter start marker
  if (fmStart >= 0) {
    lines.splice(fmStart + 1, 0, `disabled: ${disabled}`);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }
}

/**
 * Agent file watcher — fires callback when .agent.md files change.
 */
export function watchAgentDirectories(
  directories: string[],
  onDidChange: () => void,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  const pattern = '**/*.agent.md';

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dir, pattern),
    );

    watcher.onDidCreate(onDidChange);
    watcher.onDidChange(onDidChange);
    watcher.onDidDelete(onDidChange);

    disposables.push(watcher);
  }

  return disposables;
}
