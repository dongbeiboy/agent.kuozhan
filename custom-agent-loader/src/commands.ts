import * as vscode from 'vscode';
import * as path from 'path';
import { AgentLoader } from './agentLoader';
import { createAgentFile, scanAgentDirectories, AgentDefinition } from './agentFileParser';

/**
 * Register all VS Code commands for the Custom Agent Loader extension.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  agentLoader: AgentLoader,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // --- Refresh ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.refresh', () => {
      const agents = agentLoader.reload();
      vscode.window.showInformationMessage(
        `Custom Agent Loader: Reloaded ${agents.length} agent(s).`,
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
        agentLoader.reload();
      }
    }),
  );

  // --- List All Agents ---
  disposables.push(
    vscode.commands.registerCommand('customAgentLoader.listAgents', () => {
      const directories = agentLoader.getAgentDirectories();
      const agents = scanAgentDirectories(directories);

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

  return disposables;
}
