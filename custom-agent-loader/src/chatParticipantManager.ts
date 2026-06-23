import * as vscode from 'vscode';
import { AgentDefinition, parseAgentFile } from './agentFileParser';

interface ParticipantEntry {
  participant: vscode.ChatParticipant;
  agent: AgentDefinition;
}

/**
 * Manages dynamic registration/disposal of VS Code ChatParticipants.
 *
 * Dynamic agents (slots/, agents/) can be toggled on/off via checkbox.
 * Static agents (static-slots/) are forced always-on and cannot be disabled.
 *
 * All agents are registered via `vscode.chat.createChatParticipant()`.
 * Static agents are additionally declared in package.json chatAgents
 * for runSubagent compatibility.
 */
export class ChatParticipantManager {
  private entries = new Map<string, ParticipantEntry>();
  private staticFiles = new Set<string>();

  /**
   * Update the set of static agent file paths (cannot be disabled).
   */
  setStaticFiles(files: Set<string>): void {
    this.staticFiles = files;
  }

  /**
   * Check whether a file path belongs to a static directory.
   */
  isStaticFile(filePath: string): boolean {
    return this.staticFiles.has(filePath);
  }

  /**
   * Register a single agent as a ChatParticipant.
   */
  register(agent: AgentDefinition, extensionUri: vscode.Uri): void {
    if (this.entries.has(agent.name)) {
      const existing = this.entries.get(agent.name)!.agent;
      console.warn(
        `[Custom Agent Loader] Agent "${agent.name}" skipped — name already registered by "${existing.filePath}". ` +
        `The existing agent takes priority.`
      );
      return;
    }

    const id = `cal-${agent.name}`;
    const handler = this.createHandler(agent.filePath);
    const participant = vscode.chat.createChatParticipant(id, handler);

    participant.iconPath = vscode.Uri.joinPath(extensionUri, 'images', 'agent.svg');

    this.entries.set(agent.name, { participant, agent });
  }

  /**
   * Unregister (dispose) a single agent by name.
   */
  unregister(name: string): void {
    const entry = this.entries.get(name);
    if (!entry) {
      return;
    }
    entry.participant.dispose();
    this.entries.delete(name);
  }

  /**
   * Reconcile the current participant set with the desired agent list.
   * - Static agents are always registered (ignoring disabled state)
   * - Dynamic agents respect the disabled field
   * - Disposes removed or disabled dynamic agents
   * - Creates participants for new agents
   */
  reconcile(agents: AgentDefinition[], extensionUri: vscode.Uri): void {
    const desired = new Map<string, AgentDefinition>();
    for (const a of agents) {
      if (!a.disabled || this.staticFiles.has(a.filePath)) {
        desired.set(a.name, a);
      }
    }

    // Dispose removed or disabled (never dispose static agents)
    for (const [name, entry] of this.entries) {
      if (!desired.has(name) && !this.staticFiles.has(entry.agent.filePath)) {
        entry.participant.dispose();
        this.entries.delete(name);
      }
    }

    // Register new enabled agents
    for (const [name, agent] of desired) {
      if (!this.entries.has(name)) {
        this.register(agent, extensionUri);
      }
    }
  }

  /**
   * Dispose all currently registered participants.
   * Implements vscode.Disposable for use with context.subscriptions.
   */
  dispose(): void {
    this.disposeAll();
  }

  /**
   * Dispose all currently registered participants.
   */
  disposeAll(): void {
    for (const [, entry] of this.entries) {
      entry.participant.dispose();
    }
    this.entries.clear();
  }

  /**
   * Get the count of currently registered participants.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Get the names of all currently registered participants.
   */
  get registeredNames(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Create a ChatRequestHandler that reads the .agent.md body
   * and forwards the request to the LLM.
   */
  private createHandler(filePath: string): vscode.ChatRequestHandler {
    return async (
      request: vscode.ChatRequest,
      _context: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken,
    ) => {
      const agent = parseAgentFile(filePath);
      if (!agent) {
        stream.markdown('Error: Could not read agent file.');
        return;
      }

      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(agent.body),
        vscode.LanguageModelChatMessage.User(request.prompt),
      ];

      try {
        const response = await request.model.sendRequest(messages, {}, token);
        for await (const fragment of response.text) {
          stream.markdown(fragment);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stream.markdown(`**Error**: ${msg}`);
      }
    };
  }
}
