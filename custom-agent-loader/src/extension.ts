import * as vscode from 'vscode';
import { AgentLoader } from './agentLoader';
import { registerCommands } from './commands';
import { AgentTreeProvider } from './agentTreeProvider';
import { ChatParticipantManager } from './chatParticipantManager';
import { setAgentDisabled } from './agentFileParser';

let agentLoader: AgentLoader | undefined;
let treeProvider: AgentTreeProvider | undefined;
let participantManager: ChatParticipantManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Custom Agent Loader] Activating...');

  participantManager = new ChatParticipantManager();
  agentLoader = new AgentLoader(context);
  const agents = agentLoader.load();

  // Pass static files to participant manager
  participantManager.setStaticFiles(agentLoader.staticFiles);

  // Dynamically register all agents as ChatParticipants
  participantManager.reconcile(agents, context.extensionUri);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const pkg = require(context.asAbsolutePath('./package.json'));
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const activeCount = participantManager.size;
  statusBar.text = `$(hubot) Agent v${pkg.version} · ${activeCount} active · ${time}`;
  statusBar.tooltip = `Custom Agent Loader v${pkg.version}\nLoaded at ${now.toLocaleString()}\n${activeCount} registered participant(s)`;
  statusBar.command = 'customAgentLoader.refresh';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Tree view
  treeProvider = new AgentTreeProvider(context.extensionPath, agentLoader.staticFiles);
  const treeView = vscode.window.createTreeView('customAgentLoader.agentsView', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  // Checkbox toggle — skip static agents
  treeView.onDidChangeCheckboxState((evt) => {
    for (const [item, state] of evt.items) {
      if (item.kind !== 'file') continue;
      if (participantManager?.isStaticFile(item.agent.filePath)) {
        vscode.window.showInformationMessage(
          `"${item.agent.name}" is a static agent and cannot be disabled.`,
        );
        treeProvider?.refresh();
        continue;
      }
      const disabled = state === vscode.TreeItemCheckboxState.Unchecked;
      setAgentDisabled(item.agent.filePath, disabled);
      const agents2 = agentLoader?.reload() || [];
      participantManager?.setStaticFiles(agentLoader?.staticFiles || new Set());
      treeProvider?.setStaticFiles(agentLoader?.staticFiles || new Set());
      participantManager?.reconcile(agents2, context.extensionUri);
      treeProvider?.refresh();
    }
  });

  const commandDisposables = registerCommands(context, agentLoader, treeProvider, participantManager);

  context.subscriptions.push(agentLoader);
  context.subscriptions.push(participantManager);
  context.subscriptions.push(treeView);
  context.subscriptions.push(...commandDisposables);

  // Show initial status
  const outputChannel = vscode.window.createOutputChannel('Custom Agent Loader');
  outputChannel.appendLine('Custom Agent Loader activated.');
  outputChannel.appendLine(`${activeCount} dynamically registered participant(s) (static-slots/ + slots/ + agents/).`);
  outputChannel.appendLine('');
  outputChannel.appendLine('Commands:');
  outputChannel.appendLine('  Custom Agent: Refresh Agent List');
  outputChannel.appendLine('  Custom Agent: Open Agents Folder');
  outputChannel.appendLine('  Custom Agent: Create New Agent');
  outputChannel.appendLine('  Custom Agent: List All Agents');
  outputChannel.appendLine('');

  console.log(`[Custom Agent Loader] Activated with ${activeCount} participant(s).`);
}

export function deactivate(): void {
  if (participantManager) {
    participantManager.disposeAll();
    participantManager = undefined;
  }
  if (agentLoader) {
    agentLoader.dispose();
    agentLoader = undefined;
  }
  console.log('[Custom Agent Loader] Deactivated.');
}
