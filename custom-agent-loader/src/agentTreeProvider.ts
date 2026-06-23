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
  /** Whether the agent is in a static directory (cannot be disabled) */
  isStatic: boolean;
}

export type AgentNode = AgentGroupNode | AgentFileNode;

// ---- Tree data provider ----

export class AgentTreeProvider implements vscode.TreeDataProvider<AgentNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private extensionPath: string,
    private staticFiles: Set<string>,
  ) {}

  /** Update the set of static file paths (called after reload) */
  setStaticFiles(files: Set<string>): void {
    this.staticFiles = files;
  }

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
    item.contextValue = element.isStatic ? 'agent-static' : 'agent-slot';
    item.tooltip = element.isStatic
      ? `${element.agent.name} (static, cannot be disabled)\n${element.agent.description}`
      : `${element.agent.name}\n${element.agent.description}`;
    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(element.agent.filePath)],
    };
    item.iconPath = element.isStatic
      ? new vscode.ThemeIcon('lock')
      : new vscode.ThemeIcon('copilot');

    // Static agents don't get checkboxes
    if (!element.isStatic) {
      item.checkboxState = element.agent.disabled
        ? vscode.TreeItemCheckboxState.Unchecked
        : vscode.TreeItemCheckboxState.Checked;
    }

    return item;
  }

  getChildren(element?: AgentNode): AgentNode[] {
    if (!element) {
      const groups: AgentNode[] = [];

      const staticSlotsDir = path.join(this.extensionPath, 'static-slots');
      if (fs.existsSync(staticSlotsDir)) {
        groups.push({ kind: 'group', label: 'Static Slots', dirName: 'static-slots' });
      }

      const slotsDir = path.join(this.extensionPath, 'slots');
      if (fs.existsSync(slotsDir)) {
        groups.push({ kind: 'group', label: 'Dynamic Slots', dirName: 'slots' });
      }

      const agentsDir = path.join(this.extensionPath, 'agents');
      if (fs.existsSync(agentsDir)) {
        groups.push({ kind: 'group', label: 'Custom Agents', dirName: 'agents' });
      }

      return groups;
    }

    if (element.kind === 'group') {
      const dir = path.join(this.extensionPath, element.dirName);
      return this.scanDirectory(dir);
    }

    return [];
  }

  getParent(element: AgentNode): AgentNode | undefined {
    if (element.kind === 'file') {
      const parentDir = path.dirname(element.agent.filePath);
      const dirName = path.basename(parentDir);
      const label =
        dirName === 'static-slots' ? 'Static Slots' :
        dirName === 'slots' ? 'Dynamic Slots' :
        'Custom Agents';
      return { kind: 'group', label, dirName };
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
          return {
            kind: 'file',
            agent,
            isStatic: this.staticFiles.has(filePath),
          };
        })
        .filter((n): n is AgentFileNode => n !== null);
    } catch {
      return [];
    }
  }
}
