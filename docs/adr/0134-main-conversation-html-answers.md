# 主会话内的离线 HTML 回答

## 状态

Accepted

## 背景

复杂解释、报告与对比需要在聊天正文直接阅读。HTML 文件预览位于活动面板，不能代替主会话中的回答。
参考 [answer-me-with-html](https://github.com/QingYunA/answer-me-with-html/tree/4afe054b1a7f99b43c316c1951b113ae7c775f4e)
是带离线模板与 CLI 的 Skill，不是可直接装入 React 的渲染库。

## 决策

- 复用真实消息链：MessageList → RendererMarkdownScope → AssistantMessage → TextBlockView →
  RendererMarkdownContent → MarkdownContent。HTML 回答由 Markdown 的代码块扩展在消息正文原地呈现；
  没有文件写入、文件路径、活动面板打开或宽度修改。仅有 message.text 的恢复兜底也复用 TextBlockView。
- `html-preview` 是显式可视化回答合同。回复正文完成流式输出且 Markdown 围栏确实闭合后，显示一次预览。
  普通 `html` 代码保持源码优先，可由用户手动预览；普通回答不强制转换成 HTML。
- 历史记录仍保存原始 Markdown。源码、复制、增高是消息内控件，查看源码时保留一个隐藏 iframe 的原生状态；
  替换内容、重新生成或卸载时不会继承旧的预览选择。超过 512K 个 UTF-16 代码单元的围栏保留源码，不自动解析预览。
- 共享 HtmlPreviewView 只展示离线文档。通过 inert template ownerDocument 解析并按白名单重建 HTML/SVG，
  去除脚本、事件、导航 URL、刷新、嵌套帧、表单提交及文件选择。CSP 在 head 首位，iframe 空 sandbox、
  no-referrer，不能得到同源、Electron preload、Node、IPC 或宿主文件能力。
- 支持 CSS、内联 SVG、内嵌栅格图像、details 与 CSS 原生控件。禁止作者 JavaScript、外部资源、跳转与提交。
  仅有 CSP 无法可靠阻止任意脚本导航自身 iframe，因此不增加 allow-scripts。没有 postMessage/resize 权限协议。
- HTML 文件预览复用相同的安全边界并显示限制提示；这是有意收紧旧行为，而非本功能的展示入口。
  文档自己的配色由作者 CSS 决定，不强制跟随聊天宿主主题。
- 内置 answer-me-with-html Skill 移植固定上游版本的 MIT 模板、CSS 和布局资源，保留完整 LICENSE/NOTICE。
  技能要求直接在主回复输出闭合 html-preview 围栏，不以写文件和侧栏预览替代；用户要求保存文件时才另行保存。
  不集成上游 CLI、DSL 编译器、JavaScript 运行时或网络依赖。

## 备选方案与影响

直接启用 raw HTML 会污染宿主 DOM 与样式，拒绝；只去掉同源但保留任意脚本仍存在自身导航风险，拒绝。
独立 WebContents 执行应用需要另行设计网络和导航权限，本次不扩大范围。

之前只展示独立卡片的截图不能证明实际主会话接线。本次验收必须经过真实 AssistantMessage 的文本块和
text-only 恢复路径，并在右侧活动面板关闭时查看完整生产 App/路由中的合成对话。
测试可在外部 IPC/Provider 边界使用离线夹具，但不得声称调用过真实模型或验证过模型质量。
