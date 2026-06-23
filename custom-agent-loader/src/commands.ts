import * as vscode from 'vscode';
import * as path from 'path';
import { AgentLoader } from './agentLoader';
import { createAgentFile, scanAgentDirectories, setAgentDisabled, collectAgentNames, AgentDefinition } from './agentFileParser';
import { AgentTreeProvider, AgentFileNode } from './agentTreeProvider';
import { ChatParticipantManager } from './chatParticipantManager';

/**
 * Register all VS Code commands for the Custom Agent Loader extension.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  agentLoader: AgentLoader,
  treeProvider?: AgentTreeProvider,
  participantManager?: ChatParticipantManager,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // --- Refresh ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.refresh', () => {
      const agents = agentLoader.reload();
      participantManager?.setStaticFiles(agentLoader.staticFiles);
      treeProvider?.setStaticFiles(agentLoader.staticFiles);
      participantManager?.reconcile(agents, context.extensionUri);
      treeProvider?.refresh();
      vscode.window.showInformationMessage(
        `Custom Agent Loader: Reloaded ${agents.length} agent(s), ${participantManager?.size ?? 0} active.`,
      );
    }),
  );

  // --- Open Agents Folder ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.openAgentsFolder', () => {
      const agentsDir = path.join(context.extensionPath, 'agents');
      vscode.env.openExternal(vscode.Uri.file(agentsDir));
    }),
  );

  // --- Create New Agent ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.createNewAgent', async () => {
      // Collect existing agent names for conflict check
      const agentDirs = agentLoader.getAgentDirectories();
      const existingNames = collectAgentNames(agentDirs);

      const name = await vscode.window.showInputBox({
        prompt: 'Agent name (used as filename and display name)',
        placeHolder: 'my-agent',
        validateInput: (value) => {
          if (!value.trim()) {
            return 'Name cannot be empty';
          }
          if (/[<>:"/\\|?*]/.test(value)) {
            return 'Name contains invalid characters';
          }
          if (existingNames.has(value.trim())) {
            return `Name "${value.trim()}" already exists in agents/ or slots/`;
          }
          return null;
        },
      });

      if (!name) {
        return;
      }

      const description = await vscode.window.showInputBox({
        prompt: 'Agent description (shown in agent picker)',
        placeHolder: 'A custom agent that helps with...',
      });

      if (description === undefined) {
        return; // user cancelled
      }

      const bodyTemplate = await vscode.window.showInputBox({
        prompt: 'Agent instructions / system prompt (optional)',
        placeHolder: 'You are a helpful assistant specialized in...',
      });

      if (bodyTemplate === undefined) {
        return;
      }

      const agentsDir = path.join(context.extensionPath, 'agents');
      const filePath = createAgentFile(
        agentsDir,
        name,
        description || name,
        bodyTemplate,
      );

      // Open the new file in editor
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      // Ask user whether to reload agents
      const reload = await vscode.window.showInformationMessage(
        `Agent "${name}" created. Reload agents now?`,
        'Reload',
        'Later',
      );

      if (reload === 'Reload') {
        const agents2 = agentLoader.reload();
        participantManager?.setStaticFiles(agentLoader.staticFiles);
        treeProvider?.setStaticFiles(agentLoader.staticFiles);
        participantManager?.reconcile(agents2, context.extensionUri);
      }
      treeProvider?.refresh();
    }),
  );

  // --- List All Agents ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.listAgents', () => {
      const directories = agentLoader.getAgentDirectories();
      const staticDirs = agentLoader.getStaticDirectoryNames();
      const result = scanAgentDirectories(directories, staticDirs);
      const agents = result.agents;

      if (agents.length === 0) {
        vscode.window.showInformationMessage(
          'No custom agents found. Use "Custom Agent: Create New Agent" to create one.',
        );
        return;
      }

      const items = agents.map((agent) => {
        const fileName = path.basename(agent.filePath);
        return {
          label: agent.name,
          description: agent.description,
          detail: fileName,
          agent,
        };
      });

      const quickPick = vscode.window.createQuickPick();
      quickPick.items = items;
      quickPick.title = 'Custom Agents';
      quickPick.placeholder = 'Select an agent to edit';
      quickPick.canSelectMany = false;

      quickPick.onDidAccept(async () => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          const agent = (selected as any).agent as AgentDefinition;
          const doc = await vscode.workspace.openTextDocument(agent.filePath);
          await vscode.window.showTextDocument(doc);
        }
        quickPick.hide();
      });

      quickPick.show();
    }),
  );

  // --- Disable Agent ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.disableAgent', async (node: AgentFileNode) => {
      if (!node || node.kind !== 'file') {
        return;
      }

      // Static agents cannot be disabled
      if (participantManager?.isStaticFile(node.agent.filePath)) {
        vscode.window.showInformationMessage(
          `"${node.agent.name}" is a static agent and cannot be disabled.`,
        );
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Disable agent "${node.agent.name}"?\nYou can re-enable it via checkbox.`,
        { modal: true },
        'Disable',
      );

      if (confirm !== 'Disable') {
        return;
      }

      try {
        setAgentDisabled(node.agent.filePath, true);
        const agents2 = agentLoader.reload();
        participantManager?.setStaticFiles(agentLoader.staticFiles);
        treeProvider?.setStaticFiles(agentLoader.staticFiles);
        participantManager?.reconcile(agents2, context.extensionUri);
        treeProvider?.refresh();
        vscode.window.showInformationMessage(`Agent "${node.agent.name}" disabled.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to disable agent: ${err}`);
      }
    }),
  );

  return disposables;
}
