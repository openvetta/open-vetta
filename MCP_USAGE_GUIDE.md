# MCP工具使用指南

## ✅ 已完成的修复

1. **System Prompt增强**：添加了明确的MCP工具使用指南
2. **重新加载机制**：`/mcp:reload`、`/mcp:enable`、`/mcp:disable` 命令会自动重建runtime
3. **调试命令**：`/debug:prompt` 可以查看System Prompt和MCP工具状态

## 🧪 测试步骤

### 1. 重启vetta
如果vetta正在运行，请重启以加载新编译的代码。

### 2. 检查MCP状态
```
/mcp
```

你应该看到所有MCP服务器的状态。确保你想要的服务器状态为"ready"。

### 3. 查看调试信息
```
/debug:prompt
```

检查输出中的：
- ✅ MCP Tools Count > 0
- ✅ System Prompt contains MCP section: true
- ✅ System Prompt contains MCP tools: true

### 4. 查看具体的MCP工具名称

从 `/mcp` 命令的输出中，找到具体的工具名称。例如：
- `mcp_filesystem_read_file`
- `mcp_filesystem_list_directory`
- `mcp_filesystem_write_file`
- `mcp_context7_resolve-library-id`
- `mcp_context7_query-docs`
- 等等

### 5. 测试MCP工具使用

现在System Prompt已经包含了明确的指示：

> **IMPORTANT - MCP Tool Usage:**
> - When the user explicitly mentions "use [server-name] MCP" or "using [tool-name]", you MUST use the corresponding MCP tool
> - MCP tools are prefixed with "mcp_[servername]_"
> - Example: If user says "use filesystem MCP to list files", use mcp_filesystem_list_directory instead of bash ls

#### 方法1：明确指定MCP服务器名称

```
使用filesystem MCP查看当前目录的文件
```

AI现在应该会使用 `mcp_filesystem_list_directory` 而不是 `bash ls`

#### 方法2：明确指定完整的工具名称

```
使用mcp_filesystem_list_directory查看当前目录
```

#### 方法3：使用其他MCP工具

```
使用context7 MCP搜索React Hooks的文档
```

```
使用playwright MCP打开https://example.com
```

## 📝 各MCP服务器的常用工具

### filesystem
- `mcp_filesystem_list_directory` - 列出目录内容
- `mcp_filesystem_read_file` - 读取文件
- `mcp_filesystem_write_file` - 写入文件
- `mcp_filesystem_create_directory` - 创建目录
- `mcp_filesystem_search_files` - 搜索文件

### context7
- `mcp_context7_resolve-library-id` - 解析库ID
- `mcp_context7_query-docs` - 查询文档

### playwright
- `mcp_playwright_browser_navigate` - 导航到URL
- `mcp_playwright_browser_click` - 点击元素
- `mcp_playwright_browser_screenshot` - 截图
- 等等

### zai-mcp-server
根据具体的工具列表使用相应的工具

## 🔍 如果仍然不工作

### 1. 确认System Prompt已更新
运行 `/debug:prompt` 并检查输出中是否包含：
```
**IMPORTANT - MCP Tool Usage:**
- When the user explicitly mentions "use [server-name] MCP"...
```

### 2. 尝试更明确的提示
不要说：
```
查看文件 ❌
```

而是说：
```
使用filesystem MCP的list_directory工具查看当前目录的文件 ✅
```

或者直接指定工具名：
```
使用mcp_filesystem_list_directory工具列出当前目录 ✅
```

### 3. 检查工具是否真的可用
在 `/mcp` 输出中确认：
- Server状态是"ready"
- Tools列表不为空

### 4. 重新加载MCP配置
```
/mcp:reload
```

然后重新测试。

## 💡 提示技巧

为了让AI更容易理解你想使用MCP工具：

1. **明确提到MCP**：
   ```
   使用filesystem MCP...
   使用context7 MCP...
   ```

2. **提到工具名称**：
   ```
   使用list_directory工具...
   使用mcp_filesystem_list_directory...
   ```

3. **说明为什么要用MCP**：
   ```
   使用filesystem MCP而不是bash来列出文件
   ```

## 🎯 验证成功的标志

当AI正确使用MCP工具时，你会看到：
- 工具调用显示为 `mcp_[servername]_[toolname]`
- 而不是 `bash` 或其他内置工具
- 工具结果来自MCP服务器

例如：
```
 mcp_filesystem_list_directory

[列出的文件...]
```

而不是：
```
 $ ls -la

[列出的文件...]
```
