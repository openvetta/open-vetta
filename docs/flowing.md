# 流转

## 概述

流转功能用于在同一组织内的用户之间传递工作内容。用户 A 可以将本地项目中的指定文件发送给用户 B，实现工作内容的接力、转发与传递。

流转不限制链式传递：B 处理完后可以继续流转给 C，形成多节点的工作接力链。

## 核心概念

### flowingId

每个流转链路共享同一个 `flowingId`。当 A 发起流转时生成，后续 B→C、C→D 等环节复用同一个 ID。用于：
- 关联整条流转链路的所有节点
- 接收方判断是否与本地已有项目属于同一流转链路（合并 vs 新建）

### 流转历程（Flow History）

服务端维护每个 `flowingId` 的完整历程树。历程是树状结构（非线性），因为同一节点可以流转给多个目标用户，产生分支。

每个历程节点记录：
- 发送方、接收方
- 流转时间
- 本次流转的文件列表
- 接收状态（`pending` / `accepted` / `rejected`）

示例：
```
A ──→ B (accepted)
│      └──→ D (accepted)
└──→ C (rejected)
```

## 用户交互流程

### 发送方

1. 在客户端对话页面右上角点击「流转」按钮
2. 从当前项目侧边栏选择要流转的文件/目录（支持多选）
3. 选择目标用户（支持多选，限同一组织内）
4. 填写附加消息（可选）
5. 确认发送

### 接收方

1. 侧边栏右上角出现流转通知 badge
2. 点击 badge 查看流转详情（发送方、文件列表、附加消息）
3. 选择「接受」或「拒绝」
   - **接受**：自动创建/合并项目，文件写入本地
   - **拒绝**：发送方收到拒绝通知，历程中记录拒绝状态

## 文件处理

### 传输

- 文件上传至 S3 暂存，接收方接受后下载到本地
- 目录结构保持原样传输（打包后上传）
- 无文件大小限制

### 附加消息

用户填写的附加消息转换为 `notice.md` 文件，放入流转文件根目录。内容包含：
- 发送方信息（用户名等）
- 发送时间
- 用户填写的消息正文

如果流转文件中已存在 `notice.md`，则自动命名为 `notice_1.md`、`notice_2.md`，依此类推。

### 接收方项目创建规则

1. 检查本地是否存在相同 `flowingId` 的项目：
   - **存在**：将流转文件合并到该项目中
   - **不存在**：创建新项目，项目名与发送方项目同名
2. 新项目名与本地已有项目冲突时（不同 `flowingId`），自动加序号：`项目名_1`、`项目名_2`
3. 项目 `.vetta/meta.json` 中设置：
   ```json
   {
     "type": "flowing",
     "flowingId": "<flowing-id>"
   }
   ```
4. 流转项目在侧边栏做特殊渲染标识（本质上与普通项目无异，仅视觉区分）

## 实时通知

### 方案：SSE + Redis Pub/Sub

当前项目无实时推送基础设施，需新增 SSE 端点。

- 客户端登录后建立 SSE 长连接
- 服务端收到流转请求后，通过 Redis Pub/Sub 广播事件到目标用户的 SSE 连接
- 事件类型：
  - `flowing:incoming` — 收到新的流转请求
  - `flowing:accepted` — 对方已接受流转
  - `flowing:rejected` — 对方已拒绝流转

### 离线用户

- 流转记录持久化在服务端（状态为 `pending`）
- 用户上线后拉取未读流转列表
- SSE 连接建立时补发离线期间的事件

## 数据模型

### flowing（流转主记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 流转链路唯一 ID，即 flowingId |
| project_name | string | 源项目名称 |
| org_id | UUID | 所属组织 |
| created_by | UUID | 流转链路发起人 |
| created_at | timestamp | 创建时间 |

### flowing_transfer（流转传输记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 传输记录 ID |
| flowing_id | UUID | 关联的 flowingId |
| sender_id | UUID | 发送方用户 ID |
| receiver_id | UUID | 接收方用户 ID |
| parent_transfer_id | UUID \| null | 上游传输记录 ID（用于构建历程树） |
| message | text \| null | 附加消息原文 |
| status | enum | `pending` / `accepted` / `rejected` |
| file_storage_key | string | S3 存储路径（打包文件） |
| file_list | jsonb | 本次流转的文件/目录列表 |
| created_at | timestamp | 发送时间 |
| responded_at | timestamp \| null | 接收方响应时间 |

## API 设计

### 发送流转

```
POST /api/v1/flowing/send
```

```json
{
  "project_name": "my-project",
  "flowing_id": "<existing-flowing-id 或 null（首次发起时由服务端生成）>",
  "receiver_ids": ["user-id-1", "user-id-2"],
  "message": "处理完前端部分了，后端逻辑你来接手",
  "file_list": ["src/api/handler.go", "docs/"]
}
```

文件通过 `multipart/form-data` 上传，打包为压缩文件。

### 获取未读流转列表

```
GET /api/v1/flowing/pending
```

### 响应流转

```
POST /api/v1/flowing/transfer/:transfer_id/respond
```

```json
{
  "action": "accept" | "reject"
}
```

### 下载流转文件

```
GET /api/v1/flowing/transfer/:transfer_id/download
```

返回 S3 预签名 URL 或直接流式下载。

### 查看流转历程

```
GET /api/v1/flowing/:flowing_id/history
```

返回树状历程结构。

### SSE 事件流

```
GET /api/v1/events/stream
```

通用 SSE 端点，推送包括流转在内的实时事件。

## Admin 后台

流转管理页面展示：
- 流转列表：支持按组织、时间范围、用户筛选
- 每条记录显示：发起人、接收人、时间、文件列表、状态
- 点击 `flowingId` 可查看完整历程树（包括分支和拒绝记录）
- Admin 可查看元数据（谁转给谁、文件名），但不可下载文件内容（除非具备审计权限）

## 过期与清理

- 待定：未领取的流转暂不设自动过期策略
- S3 文件在接收方下载完成后可考虑延迟清理（保留一定时间供重新下载）
- 拒绝的流转，S3 文件可在一定期限后清理
