import * as vscode from 'vscode';
import { AgentLoader } from './agentLoader';
import { registerCommands } from './commands';
import { AgentTreeProvider } from './agentTreeProvider';
import { setAgentDisabled } from './agentFileParser';

let agentLoader: AgentLoader | undefined;
let treeProvider: AgentTreeProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Custom Agent Loader] Activating...');

  agentLoader = new AgentLoader(context);
  const agents = agentLoader.load();

  // Status bar — shows version + last loaded time for local dev feedback
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const pkg = require(context.asAbsolutePath('./package.json'));
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  statusBar.text = `$(copilot) Agent v${pkg.version} · ${time}`;
  statusBar.tooltip = `Custom Agent Loader v${pkg.version}\nLoaded at ${now.toLocaleString()}\n${agents.length} dynamic agent(s) · 10 static slots`;
  statusBar.command = 'customAgentLoader.refresh';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Tree view
  treeProvider = new AgentTreeProvider(context.extensionPath);
  const treeView = vscode.window.createTreeView('customAgentLoader.agentsView', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  // Handle checkbox toggle → update frontmatter + reload + refresh tree
  treeView.onDidChangeCheckboxState((evt) => {
    for (const [item, state] of evt.items) {
      if (item.kind !== 'file') continue;
      const disabled = state === vscode.TreeItemCheckboxState.Unchecked;
      setAgentDisabled(item.agent.filePath, disabled);
      agentLoader?.reload();
      treeProvider?.refresh();
    }
  });

  const commandDisposables = registerCommands(context, agentLoader, treeProvider);

  context.subscriptions.push(agentLoader);
  context.subscriptions.push(treeView);
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
