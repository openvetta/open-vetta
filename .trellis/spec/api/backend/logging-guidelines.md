# 日志规则

> 日志库：`github.com/sirupsen/logrus`，文件轮转：`gopkg.in/natefinch/lumberjack.v2`。全局实例：`logger.L`（`packages/api/pkg/logger/logger.go`）。

---

## 全局实例

```go
import "vetta-api/pkg/logger"

logger.L.Info("starting server...")
logger.L.Infof("server listening on %s", addr)
logger.L.Errorf("failed to purge: %v", err)
logger.L.WithField("user_id", uid).Warn("quota exceeded")
```

- **只用 `logger.L`**，禁止自行 `logrus.New()` 或 `log.Printf`（`config.go` 加载前的几行除外）
- 初始化在 `main.go` 中：`logger.Init(config.C.Log)`；必须在 `database.Init` 之前

## 配置

见 `internal/config/config.go` 的 `LogConfig`：

```yaml
log:
  level: info          # debug / info / warn / error
  format: text         # text(开发彩色) / json(生产结构化)
  file: logs/app.log   # 为空则仅输出到 stdout
  max_size: 100        # MB
  max_backups: 3
  max_age: 7           # 天
  compress: true
```

开发环境用 `text` + `ForceColors`，生产推荐 `json` 便于采集。

## 级别与使用场景

| 级别 | 使用场景 | 例子 |
|------|----------|------|
| `Debug` | 调试细节，默认不开 | SQL、分支标记 |
| `Info` | 正常业务事件 | 启动、连接成功、定时任务结果 |
| `Warn` | 可恢复的异常 / 4xx | 业务错误被 Recovery 捕获；S3 bucket 检查失败 |
| `Error` | 需要人工关注的失败 / 5xx | panic 堆栈、清理任务失败 |
| `Fatal` | 启动期不可恢复 | DB 连不上、迁移失败——进程退出 |

实际调用：
- 启动期（`main.go`）：连接失败用 `logger.L.Fatalf(...)`，让进程直接挂掉，k8s/主管进程会拉起
- 运行期：**严禁 `Fatal`**，用 `Error` 并返回业务错误
- 请求中间件（`middleware/logger.go`）根据 HTTP 状态自动选级别：
  ```go
  if status >= 500 { entry.Error(...) }
  else if status >= 400 { entry.Warn(...) }
  else { entry.Info(...) }
  ```

## 结构化字段

使用 `WithField` / `WithFields`，标准字段：

| 字段 | 来源 | 必填 |
|------|------|------|
| `method` | `c.Request.Method` | HTTP 日志必填 |
| `path` | `c.Request.URL.Path` | HTTP 日志必填 |
| `status` | `c.Writer.Status()` | HTTP 日志必填 |
| `latency_ms` | `time.Since(start).Milliseconds()` | HTTP 日志必填 |
| `client_ip` | `c.ClientIP()` | HTTP 日志必填 |
| `request_id` | `c.Get("request_id")` | 必填 |
| `user_id` | `middleware.GetUserID(c)` | 带认证的业务日志推荐 |
| `errors` | `c.Errors.String()` | 存在 `c.Error(err)` 时自动带 |

示例：`internal/middleware/logger.go`
```go
entry := logger.L.WithFields(logrus.Fields{
    "method":     method,
    "path":       path,
    "status":     status,
    "latency_ms": latency.Milliseconds(),
    "client_ip":  c.ClientIP(),
})
if requestID, exists := c.Get("request_id"); exists {
    entry = entry.WithField("request_id", requestID)
}
```

## Request ID

- 中间件：`internal/middleware/request_id.go`
- 优先读取 `X-Request-ID` 头，否则生成 16 字节 hex
- 同时写入响应头 `X-Request-ID` 和 `c.Set("request_id", id)`
- 业务日志要关联请求时：`logger.L.WithField("request_id", c.GetString("request_id")).Info(...)`

## Panic / 错误日志

`middleware/recovery.go`：
- 捕获到 `*errcode.BusinessError` → `Warn` 记录（正常业务错误）
- 捕获其他 panic → `Error` 并附 `debug.Stack()`

```go
logger.L.WithFields(logrus.Fields{
    "method": c.Request.Method,
    "path":   c.Request.URL.Path,
    "error":  fmt.Sprintf("%v", recovered),
    "stack":  string(debug.Stack()),
}).Error("panic recovered")
```

## 定时任务 / 后台 goroutine

参考 `cmd/server/main.go::startChatRetentionCron`：

```go
deleted, err := chatSvc.PurgeExpired()
if err != nil {
    logger.L.Errorf("chat retention purge failed: %v", err)
} else if deleted > 0 {
    logger.L.Infof("chat retention purge: deleted %d messages", deleted)
}
```

- 任务名放在消息开头，成败都记 1 条
- 零工作量（`deleted == 0`）可以不记，避免噪声

## ✅ 推荐

- 一次业务事件记 1 条 `Info`，字段放在 `WithFields`
- 需要 grep 的标签放字段里，不要 `fmt.Sprintf` 进 message
- 后台协程里捕获 `recover()` 自己记 `Error`，不要依赖 gin Recovery

## ❌ 禁止

- 打印密码、token、短信验证码、JWT secret、API Key、S3 密钥等敏感数据
- 生产环境打开 `Debug` 级别
- 使用标准库 `log.Println` / `fmt.Println` 做日志（`config.Load` 之前的启动日志除外）
- 循环里 `logger.L.Info` 刷屏（批量操作记汇总，不记单条）

## 常见错误

- 在 handler 里 `fmt.Println(err)` 调试忘删，导致日志混乱
- `logger.L` 未初始化就被调用——必须保证 `main.go` 先跑 `logger.Init`
- 长耗时任务没在结束时记 1 条汇总，现场只能看到启动日志
