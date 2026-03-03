# MCP修复总结

## 🐛 根本原因

**时序问题**：MCP服务器是异步初始化的，但runtime构建是同步执行的。

### 问题代码（修复前）
```typescript
// Initialize MCP servers asynchronously (non-blocking)
this._mcpManager.initialize().catch((error) => {
    console.error("[MCP] Failed to initialize:", error.message);
});

// ...

// 立即执行，此时MCP还没初始化完成！
this._buildRuntime({
    activeToolNames: this._initialActiveToolNames,
    includeAllExtensionTools: true,
});
```

**结果**：`_buildRuntime()` 执行时，`mcpManager.getTools()` 返回空数组，所以MCP工具从未被添加到AI的工具列表中。

## ✅ 修复方案

等待MCP初始化完成后，**自动重新构建runtime**以包含MCP工具：

```typescript
// Initialize MCP servers asynchronously, then rebuild runtime
this._mcpManager.initialize()
    .then(() => {
        // Rebuild runtime after MCP initialization to include MCP tools
        this._buildRuntime({
            activeToolNames: this._initialActiveToolNames ?? this.getActiveToolNames(),
            includeAllExtensionTools: true,
        });
    })
    .catch((error) => {
        console.error("[MCP] Failed to initialize:", error.message);
    });

// Build runtime initially (will be rebuilt after MCP initialization if MCP is enabled)
this._buildRuntime({
    activeToolNames: this._initialActiveToolNames,
    includeAllExtensionTools: true,
});
```

## 📝 修复的文件

1. **agent-session.ts**
   - 修改构造函数，在MCP初始化完成后重建runtime
   - 修改 `_rebuildSystemPrompt()` 以包含MCP工具信息

2. **system-prompt.ts**
   - 添加 `McpToolInfo` 接口
   - 在 `BuildSystemPromptOptions` 中添加 `mcpTools` 参数
   - 在生成的System Prompt中添加MCP工具列表和使用指南
   - 支持标准prompt和自定义prompt

3. **interactive-mode.ts**
   - 在 `/mcp:reload`、`/mcp:enable`、`/mcp:disable` 后调用 `session.reload()`
   - 添加 `/debug:prompt` 命令用于调试

## 🧪 测试步骤

### 1. 重启vetta
**必须重启**以加载新编译的代码。

### 2. 等待MCP初始化（约3-5秒）
启动后稍等片刻，让MCP服务器完成初始化。

### 3. 检查MCP状态
```
/mcp
```

你应该看到：
- 所有服务器状态为 "ready"
- 每个服务器的工具列表

### 4. 验证工具已加载
```
/debug:prompt
```

检查：
- ✅ MCP Tools Count > 0
- ✅ System Prompt contains MCP section: true
- ✅ 在工具列表中看到所有MCP工具

### 5. 测试MCP工具使用

**测试1：明确指定MCP**
```
使用filesystem MCP列出当前目录的文件
```

**预期结果**：
```
 mcp_filesystem_list_directory

[文件列表...]
```

**测试2：直接使用工具名**
```
使用mcp_filesystem_read_file读取package.json
```

**预期结果**：
```
 mcp_filesystem_read_file

[文件内容...]
```

### 6. 其他MCP服务器测试

```
使用context7 MCP搜索React文档
```

```
使用playwright MCP打开https://example.com并截图
```

## 🎯 成功标志

1. **工具可见性**：AI不再说"工具不在可用列表中"
2. **正确调用**：看到 `mcp_xxx_yyy` 格式的工具调用
3. **功能正常**：MCP工具返回正确的结果

## 🔧 如果还有问题

### 问题1：MCP工具仍然不可用
**解决**：
```
/mcp:reload
```

### 问题2：某个MCP服务器没启动
**检查**：
```
/mcp
```
查看错误信息，可能是：
- 配置错误
- 依赖未安装（如 `npx -y @modelcontextprotocol/server-filesystem`）
- 环境变量未设置

### 问题3：AI仍然不使用MCP工具
**尝试更明确的指示**：
```
请必须使用mcp_filesystem_list_directory工具，不要使用bash ls
```

## 📊 技术细节

### MCP工具命名规则
- 格式：`mcp_<服务器名>_<工具名>`
- 示例：
  - `mcp_filesystem_list_directory`
  - `mcp_context7_query-docs`
  - `mcp_playwright_browser_navigate`

### System Prompt增强内容
```
**IMPORTANT - MCP Tool Usage:**
- When the user explicitly mentions "use [server-name] MCP" or "using [tool-name]",
  you MUST use the corresponding MCP tool
- MCP tools are prefixed with "mcp_[servername]_"
- MCP tools may provide specialized functionality not available in built-in tools
- Example: If user says "use filesystem MCP to list files",
  use mcp_filesystem_list_directory instead of bash ls
```

## 🎉 预期效果

修复后，当用户说：
```
使用filesystem MCP查看当前目录文件
```

AI的思考过程应该是：
```
用户明确要求使用filesystem MCP，
我应该使用 mcp_filesystem_list_directory 工具
```

而不是：
```
我只有 read, bash, edit, write 工具，
所以使用 bash ls
```
