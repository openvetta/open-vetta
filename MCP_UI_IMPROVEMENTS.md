# MCP TUI显示改进

## 🎨 改进内容

### 之前的显示 ❌
```
 mcp_filesystem_list_directory

path: /Users/you/Desktop/aaa

.DS_Store
flappy-bird.html
snake.html
```

**问题**：
- 工具名称太长，不友好
- 无法一眼看出是MCP工具
- 不知道来自哪个服务器

### 现在的显示 ✅
```
 🔌 filesystem › list_directory
path: /Users/you/Desktop/aaa

.DS_Store
flappy-bird.html
snake.html
```

**改进**：
- ✅ 🔌 图标标识这是MCP工具
- ✅ **filesystem** 清楚显示服务器名称
- ✅ **›** 分隔符连接服务器和工具名
- ✅ **list_directory** 简洁的工具名
- ✅ 参数以友好格式显示

## 🎯 显示格式

### MCP工具标题格式
```
🔌 [服务器名] › [工具名]
```

### 完整示例

#### 1. filesystem服务器
```
 🔌 filesystem › list_directory
path: /Users/you/Desktop

Documents/
Downloads/
Pictures/
```

```
 🔌 filesystem › read_file
path: package.json

{
  "name": "my-project",
  ...
}
```

#### 2. context7服务器
```
 🔌 context7 › query-docs
libraryId: /vercel/next.js, query: How to use getServerSideProps

Next.js provides getServerSideProps to fetch data on each request...
```

#### 3. playwright服务器
```
 🔌 playwright › browser_navigate
url: https://example.com

✓ Navigated to https://example.com
```

#### 4. 其他MCP服务器
```
 🔌 zai-mcp-server › analyze_image
image_source: /path/to/image.png, prompt: Describe this image

This image shows...
```

## 🔧 技术细节

### 工具名称解析
```typescript
// MCP工具名称格式: mcp_<servername>_<toolname>
const mcpMatch = this.toolName.match(/^mcp_([^_]+)_(.+)$/);
if (mcpMatch) {
    const serverName = mcpMatch[1];  // "filesystem"
    const toolName = mcpMatch[2];     // "list_directory"
    // ...
}
```

### 参数显示优化
- 字符串参数超过50字符会被截断
- 显示格式：`key: value, key: value`
- 使用 `theme.fg("accent")` 突出显示值

### 输出显示
- 非展开状态：最多显示20行
- 展开状态（Ctrl+E）：显示全部内容
- 超出行数显示："... (N more lines, ctrl+e to expand)"

## 🧪 测试效果

### 测试1：文件系统操作
```
使用filesystem MCP列出桌面文件
```

**预期显示**：
```
 🔌 filesystem › list_directory
path: /Users/you/Desktop

file1.txt
file2.pdf
folder1/
```

### 测试2：文档查询
```
使用context7 MCP查询React文档
```

**预期显示**：
```
 🔌 context7 › query-docs
libraryId: /facebook/react, query: useState hook

The useState hook allows you to add state to function components...
```

### 测试3：浏览器操作
```
使用playwright MCP打开example.com
```

**预期显示**：
```
 🔌 playwright › browser_navigate
url: https://example.com

✓ Page loaded successfully
```

## 🎨 颜色方案

| 元素 | 颜色 | 说明 |
|------|------|------|
| 🔌 图标 | accent | 突出显示MCP标识 |
| 服务器名 | toolTitle (bold) | 粗体强调服务器 |
| › 分隔符 | muted | 低调的分隔符 |
| 工具名 | toolTitle | 与服务器相同样式 |
| 参数名 | default | 普通文本 |
| 参数值 | accent | 突出显示值 |
| 输出内容 | toolOutput | 工具输出颜色 |
| "..." 提示 | muted | 低调的提示文字 |

## 📊 对比总结

### 改进前
```
mcp_filesystem_list_directory
{"path": "/Users/you/Desktop"}

file1.txt
file2.pdf
```

### 改进后
```
🔌 filesystem › list_directory
path: /Users/you/Desktop

file1.txt
file2.pdf
```

**优势**：
1. **更清晰**：一眼就能看出是MCP工具
2. **更友好**：不再显示冗长的技术名称
3. **更专业**：统一的显示格式
4. **更易读**：参数格式优化，长参数自动截断

## 🚀 下一步

现在请重启vetta并测试MCP工具，你应该能看到全新的友好显示格式！

```bash
# 测试命令
使用filesystem MCP列出当前目录文件
使用context7 MCP搜索React文档
使用playwright MCP打开网页
```
