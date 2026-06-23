import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentDefinition, ScanResult, scanAgentDirectories, watchAgentDirectories, resolveSlotConflicts } from './agentFileParser';

/**
 * Manages scanning and watching of agent file directories.
 *
 * Agent registration is handled dynamically via ChatParticipantManager
 * (createChatParticipant). This class only manages file-level
 * operations (scanning, watching, tree view data).
 */
export class AgentLoader {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private fileWatchers: vscode.Disposable[] = [];
  private _staticFiles: Set<string> = new Set();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('Custom Agent Loader');
  }

  /** The set of agent file paths that belong to static directories */
  get staticFiles(): Set<string> {
    return this._staticFiles;
  }

  /**
   * Initial load: scan all configured directories.
   */
  load(): AgentDefinition[] {
    const directories = this.getAgentDirectories();
    const staticDirs = this.getStaticDirectoryNames();
    const slotsDir = path.join(this.context.extensionPath, 'slots');

    // Auto-rename slot agents whose name conflicts with user agents
    const renamed = resolveSlotConflicts(directories, slotsDir);
    if (renamed.size > 0) {
      this.log(`Name conflict resolved: ${[...renamed].join(', ')}`);
    }

    const result = scanAgentDirectories(directories, staticDirs);
    this._staticFiles = result.staticFiles;

    this.log(`Scanned ${directories.length} directories, found ${result.agents.length} agents`);

    for (const agent of result.agents) {
      this.log(`  → ${agent.name}: ${agent.description}`);
    }

    // Set up file watchers for auto-reload
    this.fileWatchers = watchAgentDirectories(directories, () => {
      this.log('Agent file change detected, reloading...');
      this.reload();
    });

    this.context.subscriptions.push(...this.fileWatchers);

    return result.agents;
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
   * 1. static-slots/ (static, declared in package.json)
   * 2. slots/ (dynamic, toggle-able)
   * 3. agents/ (user-created, dynamic, toggle-able)
   * 4. User-configured additional directories
   */
  getAgentDirectories(): string[] {
    const dirs: string[] = [];

    // Static slots directory
    const staticSlotsDir = path.join(this.context.extensionPath, 'static-slots');
    dirs.push(staticSlotsDir);

    // Dynamic slots directory
    const slotsDir = path.join(this.context.extensionPath, 'slots');
    dirs.push(slotsDir);

    // User agents directory
    const agentsDir = path.join(this.context.extensionPath, 'agents');
    dirs.push(agentsDir);

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

  /**
   * Get the list of static directory names (relative to extension root).
   */
  getStaticDirectoryNames(): string[] {
    const config = vscode.workspace.getConfiguration('customAgentLoader');
    return config.get<string[]>('staticDirectories') || ['static-slots'];
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
