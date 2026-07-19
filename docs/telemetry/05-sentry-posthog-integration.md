# 5. Sentry 与 PostHog 的协作

## 5.1 主责系统

Sentry 回答：

- 哪里发生错误；
- 调用栈和源码位置是什么；
- 哪个 release 引入回归；
- 影响多少用户；
- 性能瓶颈在哪里；
- Issue 由谁处理、是否解决。

PostHog 回答：

- 哪些用户和产品流程受到影响；
- 错误前后用户做了什么；
- 哪个功能、漏斗、群组或实验受影响；
- 用户是否成功完成目标；
- 修复或 Feature Flag 是否改善指标。

PostHog 官方也将两者区分为“事件和用户”与“错误和代码”。参考 [PostHog 与 Sentry 对比](https://posthog.com/blog/posthog-vs-sentry)。

## 5.2 实时关联

### Sentry 中附加 PostHog 上下文

对有关联 Renderer 的错误附加：

```text
tags:
  app_session_id
  error_correlation_id
  feature
  operation

context:
  posthog_session_id
  posthog_replay_url
```

posthog_replay_url 不作为 tag，避免高基数和长度问题。Replay URL 只能由 PostHog adapter 构造，业务代码不拼接供应商 URL。

### PostHog 中附加 Sentry 引用

desktop.error.experienced 包含：

```text
error_correlation_id
sentry_event_id
app_session_id
feature
operation
user_impact
app_release
```

它是产品 marker，不使用 $exception，也不触发 PostHog Error Tracking。

## 5.3 哪些错误进入 PostHog

发送 marker：

- 当前用户操作明确失败；
- 页面或窗口崩溃；
- Agent run 异常终止；
- 登录、更新、项目打开等关键流程被阻断；
- 功能降级且用户可感知。

不发送 marker：

- 自动恢复的内部重试；
- 已知网络瞬时错误；
- 开发环境断言；
- 后台维护任务错误且不影响当前用户；
- SDK 自身错误；
- 被采样丢弃的低价值 warning。

这样 PostHog 的 error marker 表示产品影响，而不是复制 Sentry 的全部噪声。

## 5.4 PostHog Sentry Source

PostHog 可以把 Sentry organization 作为数据源，同步：

- projects；
- releases；
- environments；
- issues；
- project events；
- issue events；
- users；
- grouping hashes；
- issue tags。

参考 [PostHog Sentry Source](https://posthog.com/docs/cdp/sources/sentry)。

用途：

- 在 PostHog Warehouse 中连接产品事件与 Sentry Issue；
- 分析某 release 的错误与激活/完成率变化；
- 分析某用户群组受哪些 Issue 影响；
- 建立产品健康报表。

Sentry Source 是异步分析通道，不替代实时 marker。它也不负责在 PostHog 创建第二套错误告警。

## 5.5 避免重复数据

必须同时满足：

- PostHog exception autocapture 关闭；
- 不调用 posthog.captureException；
- 不发送 $exception；
- Sentry Replay 关闭；
- Sentry 不记录产品事件；
- 同一产品事实只由 Main 或 Renderer 一侧发送；
- React/window/Sentry 自动 handler 做去重；
- PostHog marker 与 Sentry Source 表使用不同语义，不合并成同一指标。

禁止的数据路径：

```text
Sentry error
  -> PostHog $exception
  -> desktop.error.experienced
  -> Sentry Source issue_event
```

正确的数据路径：

```text
Sentry error                # 技术事实
PostHog product marker      # 用户影响事实
Sentry Source warehouse     # 离线关联视图
```

## 5.6 SDK 共存

两套 SDK 会同时接触浏览器错误、console、网络和 source map，因此要明确关闭重叠 integration，并固定经过验证的版本。

验证重点：

- Sentry source map debug ID 未被 PostHog bundle 处理破坏；
- React 错误只进入一次 Sentry；
- PostHog 不注册异常自动采集；
- console 没有双重 patch；
- fetch/XHR instrumentation 不产生重复 Span 或暴露 body；
- 应用启动时间、内存和安装包体积在预算内；
- SDK 初始化顺序不依赖竞态。

Sentry 官方 source map troubleshooting 曾记录特定旧版 posthog-js 的兼容问题，因此升级依赖时必须运行真实 production bundle 验证，不能只做 TypeScript 检查。参考 [Sentry source map troubleshooting](https://docs.sentry.io/platforms/javascript/guides/hono/sourcemaps/troubleshooting_js)。

## 5.7 身份一致性

身份更新必须由一个 TelemetryIdentityCoordinator 编排：

```text
login
  -> derive anonymousUserId/accountTelemetryId
  -> Sentry.setUser
  -> PostHog.identify

logout
  -> Sentry.setUser(null)
  -> PostHog.reset
  -> restore anonymous identity
```

不能由各业务页面分别调用 identify/setUser。账号切换、匿名到登录的合并规则需要明确测试，避免把两位用户的 Replay 和错误归到同一身份。

## 5.8 运维工作流

推荐日常流程：

1. Sentry 告警或 Issue 发现工程问题。
2. 在 Sentry 查看 release、堆栈、breadcrumbs 和 PostHog replay link。
3. 在 PostHog Replay 查看经过遮罩的用户行为。
4. 在 PostHog 分析受影响群组、漏斗和 Feature Flag。
5. 修复后由 Sentry 验证错误回归是否消失。
6. 由 PostHog 验证完成率、留存或目标指标是否恢复。

Issue 的状态、负责人和关闭动作始终只在 Sentry 完成。
