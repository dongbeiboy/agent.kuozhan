import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentDefinition, scanAgentDirectories, watchAgentDirectories } from './agentFileParser';

/**
 * Manages the lifecycle of custom agents:
 * - Scan configured directories for .agent.md files
 * - Dynamically register as chat participants (plan A)
 * - Track registry state
 */
export class AgentLoader {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private registeredParticipants: vscode.Disposable[] = [];
  private fileWatchers: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('Custom Agent Loader');
  }

  /**
   * Initial load: scan and register all agents.
   */
  load(): AgentDefinition[] {
    const directories = this.getAgentDirectories();
    const agents = scanAgentDirectories(directories);

    this.log(`Scanned ${directories.length} directories, found ${agents.length} agents`);

    for (const agent of agents) {
      this.log(`  → ${agent.name}: ${agent.description}`);
    }

    // Plan A: dynamic registration
    if (this.isDynamicRegistrationEnabled()) {
      this.registerDynamicParticipants(agents);
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
   * Reload all agents: dispose old participants, re-scan, re-register.
   */
  reload(): AgentDefinition[] {
    this.unregisterAll();
    return this.load();
  }

  /**
   * Dispose all registered participants.
   */
  unregisterAll(): void {
    for (const d of this.registeredParticipants) {
      d.dispose();
    }
    this.registeredParticipants = [];
  }

  /**
   * Get the agent directories to scan:
   * 1. Extension's own agents/ directory
   * 2. User-configured additional directories
   */
  getAgentDirectories(): string[] {
    const dirs: string[] = [];

    // Built-in agents/ directory
    const builtinDir = path.join(this.context.extensionPath, 'agents');
    dirs.push(builtinDir);

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

  isDynamicRegistrationEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('customAgentLoader');
    return config.get<boolean>('enableDynamicRegistration') !== false;
  }

  /**
   * Plan A: Register agents as dynamic chat participants via
   * vscode.chat.createChatParticipant (if API is available).
   *
   * NOTE: This is experimental. It's unclear whether dynamically
   * registered participants are visible to runSubagent.
   */
  private registerDynamicParticipants(agents: AgentDefinition[]): void {
    if (typeof (vscode.chat as any)?.createChatParticipant !== 'function') {
      this.log('vscode.chat.createChatParticipant not available — skipping dynamic registration');
      return;
    }

    for (const agent of agents) {
      try {
        const participant = (vscode.chat as any).createChatParticipant(
          agent.name,
          async (
            request: vscode.ChatRequest,
            chatCtx: vscode.ChatContext,
            stream: vscode.ChatResponseStream,
            token: vscode.CancellationToken,
          ) => {
            // The body of the .agent.md serves as the system prompt.
            // The actual LLM call is handled by VS Code / Copilot when this
            // participant is invoked through the chat UI or runSubagent.
            stream.markdown(agent.body);
          },
        );

        participant.description = agent.description;
        participant.iconPath = new vscode.ThemeIcon('copilot');

        this.registeredParticipants.push(participant);
        this.log(`Dynamically registered participant: ${agent.name}`);
      } catch (err) {
        this.log(`Failed to register participant ${agent.name}: ${err}`);
      }
    }
  }

  dispose(): void {
    this.unregisterAll();
    for (const w of this.fileWatchers) {
      w.dispose();
    }
    this.outputChannel.dispose();
  }

  log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
