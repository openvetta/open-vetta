# 目录结构

> 描述 `packages/api` 的实际目录组织方式与分层约定。

---

## 总体布局

```
packages/api
├── cmd/server/main.go         # 唯一进程入口
├── config.example.yaml        # 配置模板（拷贝为 config.yaml 或走 VETTA_* 环境变量）
├── Makefile                   # run/build/check/migrate 等命令
├── go.mod / go.sum
├── logs/                      # 运行期日志（lumberjack 轮转，默认忽略入库）
├── internal/                  # 仅供 vetta-api 自身使用的业务代码
│   ├── config/                # viper 配置加载 + 全局 config.C
│   ├── database/              # GORM 初始化、AutoMigrate、Seed
│   ├── dto/                   # 请求体结构（binding tag 校验）
│   ├── vo/                    # 响应体结构 + From<Model> 转换函数
│   ├── model/                 # GORM 持久化模型（含 Base 公共字段）
│   ├── repository/            # 预留：目前项目普遍直接在 service 内用 gorm
│   ├── service/               # 业务逻辑层，返回 *errcode.BusinessError
│   ├── handler/               # HTTP handler：参数绑定 + 调 service + 返回 VO
│   ├── router/                # 路由注册、按模式分支 enterprise / personal
│   ├── middleware/            # Auth / RBAC / Recovery / Logger / RequestID / CORS
│   └── sse/                   # SSE Manager + Redis Pub/Sub 广播
└── pkg/                       # 可被外部引用的通用包
    ├── errcode/               # BusinessError 与预定义错误码
    ├── response/              # 统一 JSON 响应 helper
    ├── validator/             # validator 错误信息中文化
    ├── logger/                # 全局 logrus.Logger 实例 logger.L
    ├── jwt/                   # JWT 签发与解析
    ├── rbac/                  # Casbin enforcer 初始化
    ├── store/                 # Redis 客户端 store.RDB
    └── s3/                    # S3 Client 封装
```

## 分层约定

调用方向必须是：`router → handler → service → model/db`，严禁反向依赖。

1. **handler**：只做 HTTP 相关的事
   - 用 `bind(c, &req)` 绑定 DTO（见 `internal/handler/base.go`）
   - 从 `middleware.GetUserID(c)` 取当前用户
   - 调用 `service`，拿到 model 后用 `vo.FromXxx` 转换
   - 用 `ok/okMsg/fail/failBiz` 返回
2. **service**：业务逻辑 + 事务 + 数据访问
   - 结构体聚合依赖：`db *gorm.DB`、`rdb *redis.Client`、`s3 *s3pkg.Client` 等
   - 构造函数命名 `NewXxxService(...)`，在 `router.Setup` 中组装
   - 返回错误统一包成 `*errcode.BusinessError`（`errcode.ErrXxx.WithMsg("…")`）
3. **model**：GORM 结构体，所有业务表嵌入 `model.Base`（`ID/CreatedAt/UpdatedAt/DeletedAt`）
4. **dto / vo**：结构体专属文件；`vo` 必须提供 `FromXxx(m *model.Xxx)` 转换函数，避免把持久化字段直接返回给前端（如 `User.Password` 用 `json:"-"` 屏蔽）

## 命名规则

- 包名：全小写、单数、无下划线。例如 `handler`、`service`、`errcode`
- 子包：当同一类能力扩展到多个模块时才拆子目录，例如 `internal/service/org/`、`internal/service/team/`、`internal/service/provider/`
- 文件名：按业务域而非类型拆分，一个域一个文件：`user.go / flowing.go / chat.go / workflow.go`
- handler 结构体：`XxxHandler` + `NewXxxHandler`；service 同理 `XxxService` + `NewXxxService`
- 路由注册函数：`registerXxxRoutes(api *gin.RouterGroup, ...)`，全部集中在 `internal/router/router.go`
- DTO：`XxxReq`；VO：`XxxVO`；分页 VO 用泛型 `vo.PaginatedVO[T]`

## 模式（enterprise / personal）代码分支

- 入口路由根据 `config.C.IsEnterpriseMode()` / `IsPersonalMode()` 决定注册哪些路由
- 数据迁移 `database.Migrate()` 按模式追加表
- `debug` 模式下数据库名会被自动追加 `_personal` / `_corp` 后缀，避免两种模式数据混杂（见 `internal/config/config.go` Load 尾部）

## ✅ 推荐

- 新增业务域：同步新增 `internal/dto/<domain>.go`、`internal/vo/<domain>.go`、`internal/model/<domain>.go`、`internal/service/<domain>.go`、`internal/handler/<domain>.go`，并在 `router.go` 增加 `registerXxxRoutes`
- 公用基础设施放 `pkg/`，仅业务逻辑用得到的放 `internal/`

## ❌ 禁止

- 在 `pkg/` 内 `import "vetta-api/internal/..."` 形成反向依赖（`pkg/logger` 目前 import 了 `internal/config`，这是唯一例外，新代码不要再扩展）
- 在 handler 里直接操作 `database.DB`，绕过 service 层
- 把 `model.User` / `model.*` 直接写进响应体，必须经 `vo.From<Model>` 过一遍

## 常见错误

- 新增路由忘记在 `router.go` 的 `Setup` 里调用 `registerXxxRoutes`
- 创建子目录后忘记改包名（`internal/service/org` 的包名是 `org`，不是 `service`），在 router 里要用 `orgsvc "vetta-api/internal/service/org"` 这类别名区分
- 新增 model 后忘记加入 `database/migrate.go` 的 `AutoMigrate` 列表；注意企业/个人表各有独立切片
