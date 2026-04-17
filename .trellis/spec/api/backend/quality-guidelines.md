# 代码质量规则

> 本项目无 `golangci-lint` 配置文件，统一用 `go build ./...` + `go vet ./...`（见 `Makefile::check`）作为最低门槛，AI 写完代码后**必须**运行通过。

---

## 必跑命令

```bash
make check   # go build ./... && go vet ./... —— 修完代码必跑
make fmt     # gofmt -w -s .              —— 提交前
make test    # go test ./...              —— 有测试时本地自测
```

> 仓库根约定：改代码后跑 `bun run check`（Go 子包等价 `make check`）。测试不在 check 流程里。
> 永远不要在 AI 会话里跑 `make dev` / `make run`；编译用 `make check`。

## 命名

- 导出标识符用大驼峰，非导出小驼峰
- 文件名单数、小写、用 `_` 分隔（本项目以一个域一个文件为主，少用下划线）
- Handler/Service 结构体固定后缀 `XxxHandler` / `XxxService`
- 构造函数 `NewXxx`，参数顺序：`db, redis, s3, enforcer, ...`
- 请求体/响应体固定后缀：`XxxReq`（`internal/dto`）/ `XxxVO`（`internal/vo`）
- 错误变量 `ErrXxx`，定义在 `pkg/errcode/errcode.go`

## 包边界 & 依赖方向

允许的依赖方向：

```
cmd/  →  internal/router
internal/router  →  internal/handler, internal/service, internal/middleware, pkg/*
internal/handler →  internal/service, internal/dto, internal/vo, internal/middleware, pkg/*
internal/service →  internal/model, pkg/*
internal/model   →  (纯结构体，仅 gorm tag)
pkg/*            →  彼此独立；尽量不依赖 internal
```

禁止：
- `internal/model` 反向 import `service` / `handler`
- `pkg/*` 依赖 `internal`（`pkg/logger` 依赖 `internal/config` 是历史例外，新代码不再扩展此类反向依赖）
- `handler` 直接 import `database.DB` 或 `store.RDB`（必须注入到 service 结构体）

## 依赖注入

统一在 `internal/router/router.go` 组装：

```go
userSvc := service.NewUserService(database.DB)
h := handler.NewUserHandler(userSvc)
```

- 依赖通过**构造函数**传入结构体字段，而不是 package-level 单例（`database.DB`、`store.RDB` 是基础设施层允许的单例；service/handler 不要再造单例）
- service 之间相互依赖时（如 `ChatService` 被 `FlowingService` 内嵌），在构造函数里显式实例化：
  ```go
  func NewFlowingService(db *gorm.DB, s3 *s3pkg.Client, rdb *redis.Client) *FlowingService {
      return &FlowingService{db: db, s3: s3, rdb: rdb, chat: NewChatService(db, s3, rdb)}
  }
  ```

## 错误与响应

- 统一 `errcode.BusinessError` + `response.OK/Fail` 封装，详见 [error-handling.md](./error-handling.md)
- Handler 里 **不要直接** `c.JSON(...)` / `c.AbortWithStatus(...)`；用 `ok/okMsg/fail/failBiz`

## 参数校验

- 用 Gin `binding` tag + `go-playground/validator`
- 必填 + 长度 + 格式写全：`binding:"required,min=6,max=72"`、`binding:"omitempty,email"`
- 翻译层：`pkg/validator/validator.go`，新增字段中文名请追加到 `fieldNames` map

## Gin 上下文

- 从 context 取值用 `middleware.GetUserID(c)`、`c.GetString("request_id")`、`c.GetString("username")`；不要直接 `c.Keys["user_id"]`
- 写响应前不要多次 `c.JSON`；`response.Fail` / `FailBiz` 已 `c.Abort`

## 禁止模式

- ❌ `database.DB.Raw(...)` 拼接 SQL（除非是 `CURRENT_DATE` 这类无参查询）
- ❌ `any` 泛滥：map 类型如 `map[string]any` 仅限 GORM `Updates` 的部分更新场景
- ❌ `panic("...")` 携带字符串；要 panic 也 panic `*errcode.BusinessError`
- ❌ 无限制的 `context.Background()`——Redis/外部调用需带 timeout：`context.WithTimeout(ctx, 5*time.Second)`
- ❌ 在 goroutine 里不 `recover()`（后台协程必须捕获 panic 记录日志）
- ❌ 写死部署模式分支在 service 内部——模式差异优先在 `router.go` 注册层面区分，必要时用 `config.C.IsPersonalMode()`

## 测试

- 目前无强制测试覆盖率要求
- 新增**公共包**（`pkg/*`）和**纯函数/算法**鼓励写表驱动测试：`func TestXxx(t *testing.T) { cases := []struct{...}{...}; for _, c := range cases { ... } }`
- 测试文件与被测代码同包，后缀 `_test.go`
- 运行：`make test` 或 `go test ./internal/xxx/...`

## Code Review 检查清单

- [ ] `make check` 通过，无 `go vet` 警告
- [ ] 新增路由已在 `router.Setup` 调用 `registerXxxRoutes`，并确认模式分支正确
- [ ] 新增 model 已在 `database/migrate.go` 登记到 common / enterprise / personal 对应切片
- [ ] 新增错误码在 `errcode.go` 对应分组末尾，5 位码唯一且递增
- [ ] DTO 有 `binding` tag；VO 提供 `FromXxx` 且屏蔽敏感字段
- [ ] Service 返回值是 `(*Model, error)` / `(VO, error)`，error 是 `*BusinessError`
- [ ] Handler 不直接访问 `database.DB` / `store.RDB`
- [ ] 日志使用 `logger.L`，敏感字段未打印
- [ ] 事务闭包内仅用 `tx`，未混用外层 db

## 常见错误

- 结构体更新（非 map）导致字段被零值覆盖
- 新增表未加入 migrate 切片
- `fail(c, err)` 后忘记 `return`
- context 未设 timeout，Redis 阻塞拖慢整个请求
- 在公共包写业务逻辑，应放回 `internal/service`
