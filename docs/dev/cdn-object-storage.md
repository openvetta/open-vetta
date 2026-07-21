# 市场产物分发：对象存储公网化与 CDN 接入

面向运维的部署方案。代码侧改动已完成（预签名直连 + sha256 校验），本文只讲需要在服务器上做的配置。

## 现状

- 元数据（技能/插件/MCP/版本条目）在 PostgreSQL。
- 产物（技能归档、插件 zip、安装包）在 RustFS（S3 兼容），默认只监听内网 `:9100`。
- 图标是例外：技能与 MCP 图标存在数据库 bytea，经 `/api/v1/skill-icons/:id`、`/api/v1/mcp-servers/:id/icon` 出图。本轮未动。

配置 `s3.public_endpoint` 之前，所有产物由 API 进程代理转发；配置之后，下载接口改发 302，客户端直连对象存储。

## 需要做的两件事

### 1. 让对象存储公网可达

两种方式，二选一。

**方式 A：独立域名（推荐）** —— 给 RustFS 挂一个自己的域名，例如 `cdn.example.com`，TLS 由 nginx 或 CDN 终止。

```yaml
# config.yaml
s3:
  endpoint: "http://rustfs:9000"          # API 进程内网直连，用于上传/删除
  public_endpoint: "https://cdn.example.com"  # 签名用，客户端直连
  presign_expire: "30m"
```

**方式 B：API 同域反代** —— 不想加域名时，在 API 同域下反代一个路径到 RustFS：

```nginx
location /s3/ {
    proxy_pass http://rustfs:9000/;
    proxy_set_header Host $host;
    # 安装包可能上百 MB，别缓冲到磁盘再转发
    proxy_buffering off;
    client_max_body_size 0;
}
```

```yaml
s3:
  public_endpoint: "https://api.example.com/s3"
```

流量仍过 nginx，但不再经 Go 进程的内存，技能下载也不再现打包。

两种方式都要求：**签名 host 必须与客户端实际访问的 host 完全一致**，否则签名校验失败（S3 签名把 host 计入）。这就是 `public_endpoint` 与 `endpoint` 分开的原因。

留空 `public_endpoint` 会自动回落到 API 代理下载，可以先不配、验证其他改动无误后再打开。

### 2. CDN 缓存策略

按路径分两类，缓存策略完全不同。

| 路径 | 内容 | 缓存 |
|---|---|---|
| `/api/v1/skills/market`、`/plugins/market`、`/mcp-servers/market` | 市场列表 JSON | 可缓存，TTL 1–5 分钟；**必须按 `Authorization` 分桶或直接禁用共享缓存**（接口在 `middleware.Auth()` 之后） |
| `/api/v1/skill-icons/:id`、`/mcp-servers/:id/icon` | 图标 | 强缓存，TTL 1 天以上；内容变了 id 不变，改图标需手动刷 CDN |
| `cdn.example.com/*`（对象存储） | 产物 | 预签名 URL 带签名参数；**回源缓存键必须剔除签名参数**（`X-Amz-Signature`、`X-Amz-Date`、`X-Amz-Credential` 等），否则每次签名不同，缓存永不命中 |
| `/api/v1/releases/latest` | 版本检查 | 不缓存或 TTL ≤1 分钟，否则发版后客户端收不到 |

产物那条是接入 CDN 的关键：预签名 URL 每次生成都不一样，如果按完整 URL 做缓存键，CDN 等于没开。多数 CDN 支持「忽略指定查询参数」，把 `X-Amz-*` 全部忽略即可——对象本身按 key 唯一，且技能/插件的 key 含版本号或按内容覆盖，不会串味。

`presign_expire` 默认 30 分钟。调长能提高缓存友好度，但也延长了 URL 被转发后仍可用的窗口，30m 是个合理起点。

## 验证

配置完成后逐条确认：

```bash
# 1. 下载接口返回 302 而不是 200 + 文件体
curl -sI -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/plugins/<id>/download | head -3
# 期望：HTTP/1.1 302，Location: https://cdn.example.com/...X-Amz-Signature=...

# 2. 跟随重定向能真的下到东西
curl -sL -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/plugins/<id>/download -o /tmp/p.zip && ls -l /tmp/p.zip

# 3. 摘要与市场列表一致
shasum -a 256 /tmp/p.zip
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/v1/plugins/market | jq -r '.data[] | select(.plugin_id=="<id>") | .sha256'
```

第 2 步要注意：跨 origin 重定向时 `Authorization` 头会被 fetch/curl 剥离，这是预期行为（避免把 API token 泄漏给对象存储），访问授权由 URL 里的签名承担。

## 存量数据

- **技能**：归档对象只在上传时生成，存量技能 `archive_key` 为空，下载自动回落到旧的现打包路径，功能正常但不走直连。重新上传一次即可补上归档与摘要。
- **插件 / 安装包**：`sha256` 为空，客户端跳过校验。重新上传补齐。
- 不需要数据迁移脚本，新列由 GORM AutoMigrate 自动添加。
