# 后端开发规则（packages/api）

> `packages/api` 是基于 Gin + GORM + PostgreSQL + Redis 的业务后端，模块名 `vetta-api`，Go 1.25。本目录下的文档描述本仓库的**实际约定**（非理想写法），供 AI agent 和新同事直接参照。

---

## 技术栈

- **Web 框架**：`github.com/gin-gonic/gin`
- **ORM**：`gorm.io/gorm` + `gorm.io/driver/postgres`
- **缓存 / Pub-Sub**：`github.com/redis/go-redis/v9`
- **配置**：`github.com/spf13/viper`（支持 YAML + `VETTA_` 前缀环境变量）
- **日志**：`github.com/sirupsen/logrus` + `lumberjack.v2`（文件轮转）
- **鉴权**：`github.com/golang-jwt/jwt/v5` + `github.com/casbin/casbin/v3`（RBAC）
- **参数校验**：`github.com/go-playground/validator/v10`（通过 Gin `binding` tag）
- **对象存储**：`aws-sdk-go-v2/service/s3`（封装在 `pkg/s3`）

## 入口与启动流程

- 入口文件：`packages/api/cmd/server/main.go`
- 启动顺序：`config.Load()` → `logger.Init` → `database.Init` → `store.InitRedis` → （可选 `-migrate` 退出）→ `rbac.InitEnforcer` → `database.Seed` → 初始化 `s3.Client` → `sse.Manager` → `router.Setup` → `r.Run`
- 部署模式由 `config.C.DeployMode` 控制：`enterprise`（默认）/ `personal`，两种模式路由注册与表结构都有差异。

## 常用命令（Makefile）

| 命令 | 说明 |
|------|------|
| `make run` | `go run cmd/server/main.go` 启动服务 |
| `make dev` | 使用 `air` 热重载 |
| `make build` | 编译到 `bin/vetta-api` |
| `make migrate` | 仅执行 `AutoMigrate` 后退出 |
| `make check` | `go build ./... && go vet ./...`（AI 改完代码后必须跑） |
| `make fmt` | `gofmt -w -s .` |

> 仓库根 `AGENTS.md` 规定：改代码后必须跑 `bun run check`（go 子包等价命令是 `make check`）；测试不在 check 流程里。

---

## 规则索引

| 文档 | 内容 | 状态 |
|------|------|------|
| [Directory Structure](./directory-structure.md) | `cmd/`、`internal/`、`pkg/` 分层与命名 | Done |
| [Database Guidelines](./database-guidelines.md) | GORM 用法、迁移、事务、连接池 | Done |
| [Error Handling](./error-handling.md) | `BusinessError`、统一响应、panic 兜底 | Done |
| [Logging Guidelines](./logging-guidelines.md) | logrus 全局实例、字段、request-id | Done |
| [Quality Guidelines](./quality-guidelines.md) | 命名、依赖注入、禁止模式、`go vet` | Done |

---

## 语言

所有后端规则文档使用**中文**。代码、路径、命令保持英文。
