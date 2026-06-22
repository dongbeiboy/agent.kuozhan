# Custom Agent Loader

A VS Code extension that lets you create and manage custom `.agent.md` files as chat agents usable by `runSubagent`.

## How it works

### Plan B: Static Slots (primary, verified)

The extension registers 10 static agent slots (`agent-01` ~ `agent-10`) in `package.json`. Each slot points to a file in the `slots/` directory. Edit the `.agent.md` file, reload VS Code, and your custom agent is live.

```
slots/
├── agent-01.agent.md  ← edit this
├── agent-02.agent.md  ← edit this
...
└── agent-10.agent.md  ← edit this
```

After editing, run **Developer: Reload Window** to apply changes.

### Plan A: Dynamic Registration (experimental)

The extension also scans the `agents/` directory for `.agent.md` files and attempts to register them via `vscode.chat.createChatParticipant`. This is experimental — it's unclear whether dynamically registered participants are visible to `runSubagent`.

## Usage

### Commands

| Command | Description |
|---|---|
| `Custom Agent: Refresh Agent List` | Re-scan agent directories |
| `Custom Agent: Open Agents Folder` | Open the `agents/` directory |
| `Custom Agent: Create New Agent` | Interactive wizard to create a new `.agent.md` |
| `Custom Agent: List All Agents` | Quick pick list to browse/edit agents |

### Agent file format

```yaml
---
name: my-agent
description: A helpful agent that does X
tools: [read_file, grep_search]
---
You are my-agent, a specialized assistant for...
```

### Invoking from runSubagent

```typescript
// In your .agent.md or .instructions.md:
runSubagent("agent-01", {
  prompt: "Do something...",
  description: "Task description"
});
```

## Building

```bash
npm install
npm run compile
npm run package   # generates .vsix
```
