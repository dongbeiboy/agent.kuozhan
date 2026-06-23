import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentDefinition, scanAgentDirectories, watchAgentDirectories, resolveSlotConflicts } from './agentFileParser';

/**
 * Manages scanning and watching of agent file directories.
 *
 * NOTE: Agent registration is handled statically via package.json
 * `contributes.chatAgents`. This class only manages file-level
 * operations (scanning, watching, tree view data).
 */
export class AgentLoader {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private fileWatchers: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('Custom Agent Loader');
  }

  /**
   * Initial load: scan all configured directories.
   */
  load(): AgentDefinition[] {
    const directories = this.getAgentDirectories();
    const slotsDir = path.join(this.context.extensionPath, 'slots');

    // Auto-rename slot agents whose name conflicts with user agents
    const renamed = resolveSlotConflicts(directories, slotsDir);
    if (renamed.size > 0) {
      this.log(`Name conflict resolved: ${[...renamed].join(', ')}`);
    }

    const agents = scanAgentDirectories(directories);

    this.log(`Scanned ${directories.length} directories, found ${agents.length} agents`);

    for (const agent of agents) {
      this.log(`  → ${agent.name}: ${agent.description}`);
    }

    // Set up file watchers for auto-reload
    this.fileWatchers = watchAgentDirectories(directories, () => {
      this.log('Agent file change detected, reloading...');
      this.reload();
    });

    this.context.subscriptions.push(...this.fileWatchers);

    return agents;
  }

  /**
   * Reload: re-scan directories.
   */
  reload(): AgentDefinition[] {
    // Dispose old watchers
    for (const w of this.fileWatchers) {
      w.dispose();
    }
    this.fileWatchers = [];
    return this.load();
  }

  /**
   * Get the agent directories to scan:
   * 1. Extension's own agents/ directory
   * 2. slots/ directory
   * 3. User-configured additional directories
   */
  getAgentDirectories(): string[] {
    const dirs: string[] = [];

    // Built-in agents/ directory
    const builtinDir = path.join(this.context.extensionPath, 'agents');
    dirs.push(builtinDir);

    // Built-in slots/ directory
    const slotsDir = path.join(this.context.extensionPath, 'slots');
    dirs.push(slotsDir);

    // User-configured directories
    const config = vscode.workspace.getConfiguration('customAgentLoader');
    const extraDirs = config.get<string[]>('agentDirectories') || [];
    for (const dir of extraDirs) {
      if (dir && fs.existsSync(dir)) {
        dirs.push(dir);
      }
    }

    return dirs;
  }

  dispose(): void {
    for (const w of this.fileWatchers) {
      w.dispose();
    }
    this.fileWatchers = [];
    this.outputChannel.dispose();
  }

  log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
