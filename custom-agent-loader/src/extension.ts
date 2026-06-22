import * as vscode from 'vscode';
import { AgentLoader } from './agentLoader';
import { registerCommands } from './commands';

let agentLoader: AgentLoader | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Custom Agent Loader] Activating...');

  agentLoader = new AgentLoader(context);
  const agents = agentLoader.load();

  const commandDisposables = registerCommands(context, agentLoader);

  context.subscriptions.push(agentLoader);
  context.subscriptions.push(...commandDisposables);

  // Show initial status
  const outputChannel = vscode.window.createOutputChannel('Custom Agent Loader');
  outputChannel.appendLine(
    `Custom Agent Loader activated. Loaded ${agents.length} agent(s) from agents/ directory.`,
  );
  outputChannel.appendLine(
    `Additionally, 10 static slots (agent-01 ~ agent-10) are available via slots/ directory.`,
  );
  outputChannel.appendLine('');
  outputChannel.appendLine('Commands:');
  outputChannel.appendLine('  Custom Agent: Refresh Agent List');
  outputChannel.appendLine('  Custom Agent: Open Agents Folder');
  outputChannel.appendLine('  Custom Agent: Create New Agent');
  outputChannel.appendLine('  Custom Agent: List All Agents');
  outputChannel.appendLine('');

  if (agents.length === 0) {
    outputChannel.appendLine(
      'No agents found in agents/ directory yet. ' +
        'Use "Custom Agent: Create New Agent" to create one.',
    );
  }

  console.log(`[Custom Agent Loader] Activated with ${agents.length} agent(s).`);
}

export function deactivate(): void {
  if (agentLoader) {
    agentLoader.dispose();
    agentLoader = undefined;
  }
  console.log('[Custom Agent Loader] Deactivated.');
}
