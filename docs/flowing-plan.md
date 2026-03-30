# 流转功能 — 四阶段实施计划

## Context

流转功能用于同一组织内用户之间传递项目文件，支持链式接力（A→B→C），共享同一 flowingId。历程为树状结构（支持分支和拒绝记录）。当前项目无实时推送基础设施，需从零搭建 SSE + Redis Pub/Sub。

详细功能文档：`docs/flowing.md`

## 关键设计决策

- **ID 类型**：沿用 `uint` 自增 ID（与现有 model.Base 一致），不用 UUID
- **组织验证**：当前系统用 Department，"同组织"定义为"共享至少一个 department"
- **SSE 位置**：在 renderer 进程中直接建立 SSE 连接（浏览器原生 EventSource，最简单）
- **S3 存储**：复用现有 bucket，用 `flowing/` key 前缀区分

---

## Phase 1: SSE + Redis Pub/Sub 基础设施

### API 端

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 新建 SSE 连接管理器（Manager + Client + channel 管理） | 新建 `packages/api/internal/sse/manager.go` |
| 2 | 新建 Redis Pub/Sub 桥接（订阅 `sse:user:<uid>` 频道，转发到 Manager） | 新建 `packages/api/internal/sse/pubsub.go` |
| 3 | 新建 SSE Handler（`GET /api/v1/events/stream`，SSE 响应头 + heartbeat 30s） | 新建 `packages/api/internal/handler/sse.go` |
| 4 | 注册 SSE 路由（Auth 中间件，无需 RBAC） | 修改 `packages/api/internal/router/router.go` |
| 5 | 启动集成（创建 Manager，启动 Subscriber goroutine，传入 router） | 修改 `packages/api/cmd/server/main.go` |

关键接口：
```go
// sse/manager.go
type EventEnvelope struct { Type string; Payload interface{}; Timestamp int64 }
type Manager struct { clients map[uint]map[*Client]struct{} }
func (m *Manager) Register(userID uint) *Client
func (m *Manager) Unregister(client *Client)
func (m *Manager) Send(userID uint, event EventEnvelope)

// sse/pubsub.go
func PublishToUser(ctx, rdb, userID, event) error
func (m *Manager) StartSubscriber(ctx, rdb)
```

### Desktop 端

| 步骤 | 操作 | 文件 |
|------|------|------|
| 6 | 新建 SSE 连接管理（renderer 进程，原生 EventSource，指数退避重连） | 新建 `packages/desktop-app/src/renderer/shared/lib/sse-client.ts` |
| 7 | 新建 SSE 状态 atoms + useSSE hook | 新建 `packages/desktop-app/src/renderer/shared/store/sse-atoms.ts` |
| 8 | 新建事件监听 hook | 新建 `packages/desktop-app/src/renderer/shared/hooks/useSSEEvent.ts` |
| 9 | 登录后自动连接 SSE，登出时断开 | 修改认证流程相关组件 |

### 验证

```bash
# 1. curl 验证 SSE 连接和 heartbeat
curl -N -H "Authorization: Bearer <token>" http://localhost:8080/api/v1/events/stream

# 2. Redis CLI 验证事件推送
redis-cli PUBLISH "sse:user:1" '{"type":"test","payload":{"msg":"hello"},"timestamp":123}'

# 3. Desktop 登录后 DevTools Console 查看 SSE 事件
```

---

## Phase 2: 流转核心后端

**前置依赖**：Phase 1（SSE 事件推送）

### 数据模型

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 新建 Flowing + FlowingTransfer 模型 | 新建 `packages/api/internal/model/flowing.go` |
| 2 | 添加到 AutoMigrate | 修改 `packages/api/internal/database/migrate.go` |
| 3 | 新建请求 DTO | 新建 `packages/api/internal/dto/flowing.go` |
| 4 | 新建响应 VO + 转换函数 | 新建 `packages/api/internal/vo/flowing.go` |

模型结构：
```
Flowing: id, project_name, org_id, created_by, created_at
FlowingTransfer: id, flowing_id, sender_id, receiver_id, parent_transfer_id,
                 message, status(pending/accepted/rejected), file_storage_key,
                 file_list(jsonb), created_at, responded_at
```

### 业务逻辑

| 步骤 | 操作 | 文件 |
|------|------|------|
| 5 | 新建 FlowingService（Send/ListPending/Respond/Download/History） | 新建 `packages/api/internal/service/flowing.go` |
| 6 | 新建 FlowingHandler（HTTP 入口） | 新建 `packages/api/internal/handler/flowing.go` |
| 7 | 注册流转路由 | 修改 `packages/api/internal/router/router.go` |
| 8 | 添加流转相关错误码 | 修改 `packages/api/pkg/errcode/errcode.go` |
| 9 | 添加同组织成员查询接口 `GET /api/v1/users/colleagues` | 修改 `handler/user.go` + `service/user.go` |

API 端点：
```
POST   /api/v1/flowing/send                    — multipart/form-data 上传
GET    /api/v1/flowing/pending                  — 待处理列表
GET    /api/v1/flowing/pending/count            — 待处理数量(badge)
POST   /api/v1/flowing/transfer/:id/respond     — 接受/拒绝
GET    /api/v1/flowing/transfer/:id/download    — 下载文件
GET    /api/v1/flowing/:id/history              — 树状历程
```

核心逻辑参考：`packages/api/internal/service/skill.go`（S3 上传/解压模式）

### 验证

用 curl/Postman 逐个测试端点，Redis MONITOR 验证 SSE 事件发布。

---

## Phase 3: 流转 Desktop 客户端

**前置依赖**：Phase 1（SSE 客户端）、Phase 2（API 端点）

### API 层 + 状态

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 扩展 API 客户端（flowing 相关函数） | 修改 `src/renderer/shared/lib/api.ts` |
| 2 | 新建 flowing atoms（pending 列表、count、面板状态、上传进度） | 新建 `src/renderer/shared/store/flowing-atoms.ts` |

### 发送流程

| 步骤 | 操作 | 文件 |
|------|------|------|
| 3 | 连接现有「内容流转」按钮 → 打开发送对话框 | 修改 `src/renderer/domains/chat/components/ChatView.tsx` |
| 4 | 新建发送对话框（文件多选 + 用户多选 + 消息输入） | 新建 `src/renderer/domains/flowing/components/FlowingSendDialog.tsx` |
| 5 | 新建文件打包/解压 IPC（zip 处理 + meta.json 读写） | 新建 `src/main/ipc/flowing.ts`，修改 `preload/api.ts` + `preload/index.ts` |
| 6 | 新建发送 hook（打包→上传→通知） | 新建 `src/renderer/domains/flowing/hooks/useFlowingSend.ts` |

notice.md 处理：在 packFiles 中，如有 message 则生成 notice.md（含发送方信息+时间），同名冲突加序号。

### 接收流程

| 步骤 | 操作 | 文件 |
|------|------|------|
| 7 | Sidebar 添加流转通知 badge | 修改 `src/renderer/domains/project/components/Sidebar.tsx` |
| 8 | 新建流转通知面板（待处理列表 + 接受/拒绝按钮） | 新建 `src/renderer/domains/flowing/components/FlowingPanel.tsx` |
| 9 | 新建接收 hook（accept: 下载→确定项目→解压→写 meta.json；reject: 调 API） | 新建 `src/renderer/domains/flowing/hooks/useFlowingReceive.ts` |
| 10 | 新建 SSE 事件处理（incoming→更新列表；accepted/rejected→toast） | 新建 `src/renderer/domains/flowing/hooks/useFlowingSSE.ts` |
| 11 | 登录后初始化（拉取 pending count + 列表，挂载 SSE 监听） | 修改 App 初始化流程 |
| 12 | 流转项目特殊渲染（读 meta.json，显示标识图标） | 修改 `src/renderer/domains/project/components/ProjectGroup.tsx` |

接收项目创建规则：
1. 遍历本地项目查找匹配 flowingId → 合并
2. 无匹配但同名 → 加序号 `_1`、`_2`
3. 写 `.vetta/meta.json`：`{type: "flowing", flowingId: <id>}`
4. 添加到 desktop-config.json

### 验证

双用户登录测试：发送→接收→接受/拒绝→链式流转→合并→同名冲突。

---

## Phase 4: Admin 后台 + 打磨

**前置依赖**：Phase 2（数据）、Phase 3（基本功能）

### Admin API

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 新建 Admin Handler（List/Detail/History/TransferList） | 新建 `packages/api/internal/handler/flowing_admin.go` |
| 2 | Service 添加分页查询方法 | 修改 `packages/api/internal/service/flowing.go` |
| 3 | 注册 admin 路由（RequirePlatform("admin") + RBAC） | 修改 `packages/api/internal/router/router.go` |

### Admin 前端

| 步骤 | 操作 | 文件 |
|------|------|------|
| 4 | 扩展 Admin API 客户端 | 修改 `packages/admin/src/lib/api.ts` |
| 5 | 新建流转列表页（DataTable + 筛选） | 新建 `packages/admin/src/features/flowing/` |
| 6 | 新建历程树组件（参考 department-tree.tsx 递归模式） | 新建 `flowing/components/flowing-history-tree.tsx` |
| 7 | 新建路由页面 | 新建 `packages/admin/src/routes/_authenticated/flowing/index.tsx` |
| 8 | 添加侧边栏导航项 | 修改 admin sidebar 配置 |

### 打磨

| 步骤 | 操作 |
|------|------|
| 9 | 大文件流式打包/上传，调整 Gin multipart 内存限制 |
| 10 | S3 清理机制（拒绝/过期文件） |
| 11 | 错误处理（断网重试、并发幂等、解压回滚） |
| 12 | UI 打磨（进度条、空状态、toast、快捷键） |

---

## 阶段间依赖总览

```
Phase 1 (SSE 基础设施)
   ↓
Phase 2 (后端核心) ←── 依赖 Phase 1 的 PublishToUser
   ↓
Phase 3 (客户端)  ←── 依赖 Phase 1 的 SSE 客户端 + Phase 2 的 API
   ↓
Phase 4 (Admin + 打磨) ←── 依赖 Phase 2 的数据模型 + Phase 3 的基本功能
```

## 注意事项

- Gin 默认 multipart 32MB 限制，Phase 2 需调整
- 现有 S3 client 的 Upload 方法参考：`packages/api/pkg/s3/client.go`
- 历程树查询用 PostgreSQL CTE 或应用层递归构建
- 文件打包参考：`packages/api/internal/service/skill.go` 的 zip/tar.gz 处理
- Admin 元数据可见但文件内容不可下载（除非审计权限）
