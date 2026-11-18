# 桌面端性能优化：布局占位一次到位，面板独立滑动

适用于开关停靠面板、抽屉或侧栏时，尺寸动画反复挤压聊天列表、编辑器、终端等相邻区域，造成可见卡顿的场景。Vetta 的右侧活动面板和左侧边栏都采用这个做法。

## 什么时候用

| 场景 | 判断和做法 |
| --- | --- |
| 点击展开或收起停靠面板 | 如果录帧显示 `width`、`height` 或 `grid-template-rows` 的过渡导致相邻内容逐帧重排，且相邻内容可以瞬间切到最终尺寸，就让占位一次到位，单独滑动面板。 |
| 拖动分隔线 | 尺寸需要跟随指针。保留实时调整，检查每帧是否有重复更新或测量，必要时合并同一帧的工作。 |
| 消息、附件或待办条局部展开 | 测量是否波及虚拟列表、是否造成掉帧或滚动跳位。交互流畅时保留原有动画。 |
| 录帧显示耗时集中在绘制、图片解码、脚本或首次挂载 | 按实际热点处理。`transform` 和 `opacity` 通常更适合合成，但遮罩、模糊和大面积图层仍可能有绘制或合成成本。 |

这个做法的取舍是相邻区域会在点击时立即换行或调整列数。如果交互要求内容跟随面板连续变形，就需要保留尺寸变化并优化每一帧的工作。

## 怎么排查和实施

1. **先建立基线。** 固定同一窗口尺寸、内容和操作，重复录制展开与收起。用 Chromium DevTools 的 Performance 面板对比帧耗时、主线程 `Layout`、绘制和脚本开销。确认是哪一层的尺寸在变，以及相邻区域的 `ResizeObserver`、虚拟列表或终端是否跟着反复测量。涂鸦背景等设置可以作为对照变量，每次只改一个条件。
2. **分开占位和视觉表面。** 外层参与正常布局，开关时直接切到目标宽高，尺寸属性不做过渡。内层用绝对定位脱离普通文档流，保持展开时的尺寸，只过渡 `transform` 和 `opacity`。拖动把手继续走实时尺寸更新，拖动期间关闭开关动画。检查层叠顺序、裁剪和窗口边缘，窄窗口如果已有独立抽屉路径就沿用其布局。
3. **处理交互状态与内容挂载。** 收起后让视觉表面退出指针和键盘交互，并检查关闭时焦点回到合理位置。支持 `prefers-reduced-motion`。如果录帧还显示重内容首次挂载抢占动画帧，可以先显示面板外壳，再挂载重内容。等待过渡结束时只认当前表面及目标属性的事件，并处理初始已打开、无动画、快速开关和事件未送达的情况。
4. **用同一组操作复测。** 对比尺寸变化或观察者回调次数、长帧和帧耗时。确认打开和关闭后的尺寸、滚动锚点、焦点、点击区域和拖动行为。聊天场景分别测贴底和翻看历史。回调减少只能证明布局联动变少，帧耗时和实际操作才能说明流畅度是否改善。

需要启动或附着真实 Desktop 时，按仓库的 UI 验证流程执行，并取得当前任务的明确授权。[Desktop UI 验证](../dev/README.md)

## 项目内参考

- **右侧活动面板。** `ActivityPanelDesktop` 在打开或关闭时直接设置占位宽度，`ActivityPanelSurface` 负责滑动和透明度，`ActivityPanelView` 把拖动把手放在视觉表面内，并在窄窗口走独立 Sheet。[ActivityPanel.tsx](../../packages/theme-ui/src/activity/ActivityPanel.tsx) · [ActivityPanelView.tsx](../../apps/desktop/src/renderer/domains/activity-panel/components/activity-panel/ActivityPanelView.tsx)
- **活动面板的重内容挂载。** `useDockedContentReady` 只响应视觉表面自身的 `transform` 过渡结束事件，并提供超时兜底。[useDockedContentReady.ts](../../apps/desktop/src/renderer/domains/activity-panel/hooks/useDockedContentReady.ts) · [ActivityPanelView.resize.test.tsx](../../apps/desktop/src/renderer/domains/activity-panel/components/activity-panel/ActivityPanelView.resize.test.tsx)
- **左侧边栏。** `SidebarDock` 同样让外层宽度一次切换，内层独立滑动，并保留已挂载的子树，避免重复挂载拖慢开关。[SidebarDock.tsx](../../packages/theme-ui/src/layout/SidebarDock.tsx)
- **受影响的相邻区域。** `MessageFeedView` 使用 Virtuoso 渲染消息列表，可以从这里追踪面板尺寸变化如何传到虚拟列表。[MessageFeedView.tsx](../../packages/theme-ui/src/chat/MessageFeedView.tsx)

## 给 Agent 的任务示例

> 参考 @docs/performance/layout-animation.md。打开「面板名称」时「相邻区域」会卡顿。复现步骤是「填写操作步骤」。请先确认瓶颈是否为动画期间反复布局或重测量，符合适用条件再改。用同一操作对比改动前后的测量和帧耗时，并说明滚动、焦点和拖动行为如何验证。没有实测数据时，请区分源码推断和已验证结果。
