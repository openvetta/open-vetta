# 在 macOS 上首次启动 Vetta（内测版）

> 当前的 Vetta 内测版**未通过 Apple 公证**。这意味着 macOS Gatekeeper 在你首次双击 `Vetta.app` 时会弹出"无法验证开发者"对话框。这是预期行为，不是故障。
>
> 公证将在产品进入正式发布阶段后启用。在那之前请按以下任一方式放行。

## 方式一：终端一行命令（推荐）

在终端粘贴下面这行命令，输入 macOS 密码即可：

```bash
sudo xattr -rd com.apple.quarantine /Applications/Vetta.app
```

执行完毕后双击 `Vetta.app` 即可正常启动，**且**无需重复操作；除非你重新下载安装。

## 方式二：从「系统设置 → 隐私与安全性」放行

适用于不愿用终端的用户。**注意：macOS 15 (Sequoia) 之后步骤变多，没有右键「仍要打开」按钮**。

### macOS 14 (Sonoma) 及更早

1. 双击 `Vetta.app`，系统弹出 "无法验证开发者" 对话框，点 **取消**（不要点 "移到废纸篓"）。
2. 在 Finder 中**右键** `Vetta.app` → **打开**。
3. 弹出的二次确认对话框中点 **打开**。
4. 完成。下次双击不再拦截。

### macOS 15 (Sequoia) 及更新

1. 双击 `Vetta.app` → 系统弹出 "Apple 无法验证此 App 不包含恶意软件" → 点 **完成**。
2. 打开 **系统设置 → 隐私与安全性**。
3. 滚动到底部 "安全性" 区域，可以看到 `已阻止使用 "Vetta.app"`。
4. 点 **仍要打开**。
5. 输入 macOS 密码 / Touch ID。
6. 回到 Finder，再次双击 `Vetta.app`。
7. 弹出第二次确认 → 点 **打开**。

整个过程大约 8 步操作。这是 Apple 的保护机制，公证启用后会消失。

## 卸载 / 清理

- 拖 `Vetta.app` 到废纸篓。
- 如需彻底清理用户数据：删除 `~/.vetta/` 目录（包含项目列表、IM 凭据、agent 会话等所有本地状态）。

## 反馈

如果你完成放行后仍无法启动，请在我们的 issue tracker 中附上以下信息：

- macOS 版本（`sw_vers`）
- CPU 架构（Apple silicon / Intel）
- Console.app 中 `Vetta` 相关的最近 5 行日志
