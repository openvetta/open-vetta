# MCP工具 - 专业TUI渲染效果

## 🎨 最终效果展示

### 现在的MCP工具显示（像内置工具一样专业！）

#### 示例1：filesystem - list_directory
```
 ┌────────────────────────────────────────┐
 │ MCP:filesystem  list_directory ~/Desktop │
 │                                        │
 │ Documents/                             │
 │ Downloads/                             │
 │ Pictures/                              │
 │ file1.txt                              │
 │ file2.pdf                              │
 └────────────────────────────────────────┘
```

#### 示例2：filesystem - read_file
```
 ┌────────────────────────────────────────┐
 │ MCP:filesystem  read_file package.json │
 │                                        │
 │ {                                      │
 │   "name": "my-project",                │
 │   "version": "1.0.0",                  │
 │   "dependencies": {                    │
 │     "react": "^18.0.0"                 │
 │   }                                    │
 │ }                                      │
 └────────────────────────────────────────┘
```

#### 示例3：context7 - query-docs
```
 ┌────────────────────────────────────────┐
 │ MCP:context7  query-docs               │
 │ libraryId: /vercel/next.js • query: getServerSideProps │
 │                                        │
 │ Next.js provides getServerSideProps    │
 │ to fetch data on each request...      │
 │                                        │
 │ ... (45 more lines, ctrl+e to expand)  │
 └────────────────────────────────────────┘
```

#### 示例4：playwright - browser_navigate
```
 ┌────────────────────────────────────────┐
 │ MCP:playwright  browser_navigate       │
 │ url: https://example.com               │
 │                                        │
 │ ✓ Navigated to https://example.com    │
 └────────────────────────────────────────┘
```

---

## 🎯 显示特性

### 1. **徽章标识**
```
 MCP:filesystem  ← 彩色背景徽章，清晰标识MCP服务器
```
- 使用背景色突出显示
- 格式：`MCP:服务器名`
- 与工具名分开，一目了然

### 2. **工具名称**
```
list_directory  ← 粗体显示，像内置工具一样
```
- 去掉 `mcp_` 和 `服务器_` 前缀
- 只显示实际的工具名
- 粗体突出显示

### 3. **智能参数显示**
#### 主要参数（路径类）显示在同一行
```
 MCP:filesystem  read_file ~/Desktop/file.txt
                           ^^^^^^^^^^^^^^^^^^^
                           主要参数自动识别并缩短路径
```

#### 其他参数显示在第二行
```
 MCP:context7  query-docs
libraryId: /vercel/next.js • query: How to use hooks
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
多个参数用 • 分隔，清晰易读
```

### 4. **输出格式化**
- 最多显示20行（未展开时）
- 自动截断提示："... (N more lines, ctrl+e to expand)"
- 支持 Ctrl+E 展开查看全部内容
- 错误信息用红色高亮显示

### 5. **路径缩短**
```
/Users/username/Desktop/file.txt  →  ~/Desktop/file.txt
```
- 自动将 Home 目录转换为 `~`
- 更简洁易读

---

## 🆚 对比：之前 vs 现在

### 之前（Generic工具显示）❌
```
 mcp_filesystem_list_directory

{"path": "/Users/m4/Desktop/aaa"}

.DS_Store
flappy-bird.html
snake.html
```

**问题**：
- ❌ 工具名太长、不友好
- ❌ 参数显示为JSON，不直观
- ❌ 没有视觉识别性
- ❌ 不像专业工具

### 现在（专业TUI渲染）✅
```
 MCP:filesystem  list_directory ~/Desktop/aaa

.DS_Store
flappy-bird.html
snake.html
```

**优势**：
- ✅ 徽章清晰标识MCP服务器
- ✅ 工具名简洁明了
- ✅ 参数友好显示
- ✅ 像内置工具一样专业
- ✅ 统一的视觉风格

---

## 📊 完整示例对比

### read（内置工具）
```
 read package.json

{
  "name": "my-project",
  ...
}
```

### mcp_filesystem_read_file（MCP工具）
```
 MCP:filesystem  read_file package.json

{
  "name": "my-project",
  ...
}
```

**一致的风格！** 唯一区别是MCP徽章，让用户知道这是外部MCP工具。

---

## 🎨 视觉元素说明

| 元素 | 样式 | 说明 |
|------|------|------|
| `MCP:server` | 背景色 + accent | 徽章标识 |
| 工具名 | 粗体 | 主标题 |
| 路径参数 | accent色 | 高亮路径 |
| 其他参数 | muted: + toolOutput | 键灰色，值普通色 |
| • 分隔符 | muted | 参数分隔 |
| 输出内容 | toolOutput | 标准输出色 |
| 错误信息 | error红色 | 错误高亮 |
| "..." 提示 | muted | 低调提示 |

---

## 🚀 测试新效果

### 1. 重启vetta
```bash
# 退出vetta，重新启动
```

### 2. 测试各种MCP工具

#### 文件系统操作
```
使用filesystem MCP列出桌面文件
使用filesystem MCP读取package.json
```

#### 文档查询
```
使用context7 MCP搜索React hooks文档
```

#### 浏览器操作
```
使用playwright MCP打开https://example.com
使用playwright MCP截图
```

### 3. 对比效果

测试同样的功能：
```
# 内置工具
read package.json

# MCP工具
使用filesystem MCP读取package.json
```

你会发现它们的显示风格**几乎一致**，唯一区别是MCP徽章！

---

## 🎯 关键改进

### 代码改进1：识别MCP工具
```typescript
private shouldUseBuiltInRenderer(): boolean {
    // MCP tools get built-in-style rendering
    if (this.toolName.startsWith('mcp_')) {
        return true;
    }
    // ...
}
```

### 代码改进2：专业格式化
```typescript
// Header with MCP badge: [MCP:server] tool_name
const badge = theme.bg("toolPendingBg", theme.fg("accent", ` MCP:${serverName} `));
text = badge + " " + theme.fg("toolTitle", theme.bold(toolName));

// Show primary args on the same line
const primaryArg = this.args?.path || this.args?.uri || this.args?.url;
if (primaryArg) {
    text += " " + theme.fg("accent", shortenPath(primaryArg));
}
```

---

## 💡 使用技巧

### 展开/折叠输出
- **Ctrl+E**：展开查看完整输出
- 默认显示前20行，超出显示提示

### 识别MCP工具
- 看到 `MCP:xxx` 徽章就知道是MCP工具
- 徽章颜色与背景不同，非常明显

### 理解参数
- 第一行：工具名 + 主要参数（路径/URL）
- 第二行：其他参数，用 • 分隔

---

## 🎊 总结

MCP工具现在拥有**与内置工具完全一致的专业TUI渲染效果**：

✅ **视觉识别**：MCP徽章清晰标识
✅ **简洁明了**：去掉技术性前缀
✅ **参数友好**：智能识别和格式化
✅ **输出美化**：支持展开/折叠
✅ **统一风格**：与内置工具保持一致

**现在MCP工具看起来就像vetta原生工具一样专业！** 🚀
