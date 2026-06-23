import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentDefinition, parseAgentFile } from './agentFileParser';

// ---- Node types ----

export interface AgentGroupNode {
  kind: 'group';
  label: string;
  dirName: string;
}

export interface AgentFileNode {
  kind: 'file';
  agent: AgentDefinition;
}

export type AgentNode = AgentGroupNode | AgentFileNode;

// ---- Tree data provider ----

export class AgentTreeProvider implements vscode.TreeDataProvider<AgentNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private extensionPath: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AgentNode): vscode.TreeItem {
    if (element.kind === 'group') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'agent-group';
      item.iconPath = new vscode.ThemeIcon('folder');
      return item;
    }

    const item = new vscode.TreeItem(element.agent.name, vscode.TreeItemCollapsibleState.None);
    item.description = element.agent.description;
    item.contextValue = 'agent-slot';
    item.tooltip = `${element.agent.name}\n${element.agent.description}`;
    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(element.agent.filePath)],
    };
    item.iconPath = new vscode.ThemeIcon('copilot');
    item.checkboxState = element.agent.disabled
      ? vscode.TreeItemCheckboxState.Unchecked
      : vscode.TreeItemCheckboxState.Checked;

    return item;
  }

  getChildren(element?: AgentNode): AgentNode[] {
    if (!element) {
      return [
        { kind: 'group', label: 'Static Slots', dirName: 'slots' },
      ];
    }

    if (element.kind === 'group') {
      const dir = path.join(this.extensionPath, element.dirName);
      return this.scanDirectory(dir);
    }

    return [];
  }

  getParent(element: AgentNode): AgentNode | undefined {
    if (element.kind === 'file') {
      return { kind: 'group', label: 'Static Slots', dirName: 'slots' };
    }
    return undefined;
  }

  private scanDirectory(dir: string): AgentFileNode[] {
    if (!fs.existsSync(dir)) {
      return [];
    }

    try {
      const entries = fs.readdirSync(dir);
      return entries
        .filter((e) => e.endsWith('.agent.md'))
        .map((file) => {
          const filePath = path.join(dir, file);
          const agent = parseAgentFile(filePath);
          if (!agent) {
            return null;
          }
          return { kind: 'file', agent };
        })
        .filter((n): n is AgentFileNode => n !== null);
    } catch {
      return [];
    }
  }
}
