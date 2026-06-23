[English Version](./README-en.md)

# Custom Agent Loader

一个 VS Code 扩展，让你可以创建和管理自定义 `.agent.md` 文件，作为 `runSubagent` 可调用的聊天代理。

## 工作原理

### 方案 B：静态插槽（主要方案，已验证）

该扩展在 `package.json` 中注册了 11 个静态代理插槽（`agent-01` ~ `agent-10` + `batch-worker`）。每个插槽指向 `slots/` 目录下的一个文件。编辑 `.agent.md` 文件，重载 VS Code 窗口，你的自定义代理即可生效。

```
slots/
├── agent-01.agent.md  ← 编辑此文件
├── agent-02.agent.md  ← 编辑此文件
...
├── agent-10.agent.md  ← 编辑此文件
└── batch-worker.agent.md  ← 批量处理专用代理
```

编辑后，执行 **Developer: Reload Window** 即可应用更改。

### 方案 A：动态注册（实验性）

扩展还会扫描 `agents/` 目录下的 `.agent.md` 文件，并尝试通过 `vscode.chat.createChatParticipant` 注册它们。此方案为实验性——目前尚不确定动态注册的参与者能否被 `runSubagent` 识别。

**可通过设置开关控制：**

```json
"customAgentLoader.enableDynamicRegistration": true  // 启用（默认）
"customAgentLoader.enableDynamicRegistration": false // 关闭，仅使用静态插槽
```

### Tree View 侧边栏

扩展在活动栏添加了 **Custom Agents** 视图，可以直观地浏览、刷新、创建和删除代理。

### 额外扫描目录

可通过设置添加额外的代理扫描目录：

```json
"customAgentLoader.agentDirectories": [
  "/path/to/your/agents"
]
```

## 使用方法

### 命令

| 命令 | 描述 |
|---|---|
| 命令 | 描述 |
|---|---|
| `Custom Agent: Refresh Agent List` | 重新扫描代理目录 |
| `Custom Agent: Open Agents Folder` | 打开 `agents/` 目录 |
| `Custom Agent: Create New Agent` | 交互式向导，创建新的 `.agent.md` |
| `Custom Agent: List All Agents` | 快速选择列表，浏览/编辑代理 |
| `Custom Agent: Delete Agent` | 删除选中的代理文件 |

### Agent 文件格式

```yaml
---
name: my-agent
description: 一个有用的代理，负责执行 X 任务
tools: [read_file, grep_search]
---
你是 my-agent，一个专注于……
```

### 从 runSubagent 调用

```typescript
// 在你的 .agent.md 或 .instructions.md 中：
runSubagent("agent-01", {
  prompt: "执行某个任务……",
  description: "任务描述"
});
```

## 构建

```bash
npm install
npm run compile      # 编译（含版本号自增）
npm run compile:ts   # 仅 TypeScript 编译
npm run package      # 生成 .vsix
npm run package:dev  # 生成开发版 .vsix（版本号自动添加 -dev 后缀）
```
