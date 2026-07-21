# 部署入口与市场产物 CDN 接入

面向运维。代码与 `deploy/` 配置已就绪，本文讲需要在 Cloudflare 后台和服务器上做的事。

## 拓扑

只有 nginx 占 80/443，三个子域全部挂 Cloudflare 橙云：

| 子域 | 后端 | 说明 |
|---|---|---|
| `api.vettawork.app` | `api:8080` | 业务 API |
| `admin.vettawork.app` | `admin:80` | 管理后台，另加 Cloudflare Access |
| `cdn.vettawork.app` | `s3:9000` | 对象存储，市场产物预签名直连 |

`api` / `admin` / `s3` 都不再对公网暴露端口。按 IP 直连或拿未知 Host 试探的请求，会命中 nginx 的 `default_server` 被 444 断开。

官网仍占 `@` 与 `www`，不受影响。

## 市场产物直连的原理

配置 `s3.public_endpoint` 之前，产物由 API 进程代理转发（技能下载还会把整包读进内存再打 tar.gz）。配置之后，下载接口改发 302 到预签名 URL，客户端直连对象存储。

`endpoint` 与 `public_endpoint` 必须分开：前者是 API 进程内网直连的地址（上传、删除用），后者是客户端实际访问的公网地址（签名用）。**S3 签名把 host 计入**，用内网地址签出来的 URL 换个 host 访问会签名不匹配。三处域名必须完全一致：`.env` 的 `CDN_DOMAIN`、`config.api.yaml` 的 `s3.public_endpoint`、nginx 的 `server_name`。

`public_endpoint` 留空则自动回落到 API 代理下载，可以先不配、验证其他改动无误后再打开。

**范围**：只有技能/场景（tar.gz）和插件（zip）走直连，体积在 KB 到几 MB。应用安装包 `GET /releases/:version/download` 始终走 API 代理，不受 `public_endpoint` 影响——体积远大于市场产物，走通用 CDN 有合规与成本问题，后续单独做托管。

图标也不在范围内：技能与 MCP 图标存在数据库 bytea，经 `/api/v1/skill-icons/:id`、`/api/v1/mcp-servers/:id/icon` 出图，未迁到对象存储。

## Cloudflare 配置

### 1. DNS

三条 A 记录指向 VPS IP，全部橙云（Proxied）：

```
api    A  <VPS_IP>  Proxied
admin  A  <VPS_IP>  Proxied
cdn    A  <VPS_IP>  Proxied
```

### 2. 源站证书

SSL/TLS → Origin Server → Create Certificate，主机名填 `vettawork.app` 和 `*.vettawork.app`。生成的证书与私钥放到服务器：

```
deploy/certs/origin.pem
deploy/certs/origin.key
```

SSL/TLS 加密模式设 **Full (strict)**。该证书只被 Cloudflare 信任、有效期 15 年，正适合源站与 CF 之间这一段。

### 3. Cache Rule（不做这步等于白接 CDN）

Caching → Cache Rules，新建规则匹配 `Hostname eq cdn.vettawork.app`：

- Cache eligibility：**Eligible for cache**
- Cache Key → Query String → **Ignore specific parameters**，填入：
  `X-Amz-Signature`、`X-Amz-Date`、`X-Amz-Credential`、`X-Amz-Expires`、`X-Amz-SignedHeaders`、`X-Amz-Algorithm`
- Edge TTL：1 天

预签名 URL 每次签出来都不同，不剔掉这些参数缓存命中率就是 0。剔掉后按对象 key 缓存——技能 key 含版本号、插件 key 按内容覆盖，不会串味。

再加一条规则匹配 `Hostname eq api.vettawork.app`，设 **Bypass cache**：API 响应带用户态，绝不能进共享缓存。

### 4. Cloudflare Access 保护 admin

Zero Trust → Access → Applications → Add an application → Self-hosted：

- Application domain：`admin.vettawork.app`
- Policy：Action = Allow，Include = Emails → 填你自己的邮箱（或 Emails ending in 你的域名）
- 登录方式用默认的 One-time PIN（邮箱验证码）即可，也可接 Google

配好之后，未通过认证的请求**在 CF 边缘就被拦掉，根本到不了 VPS**，扫描器连登录页都看不到。加上 admin 自身的 JWT 登录，是两层独立认证。

### 5. 签名有效期与边缘缓存的关系

`presign_expire` 是 30 分钟，但边缘缓存 1 天。签名过期后，**已缓存的对象在边缘仍可能被直接返回**——CF 不校验签名，只有回源时源站才校验。

对技能/插件这类公开市场内容不构成问题（本来人人可下）。若某天要放非公开产物，需把那部分路径的 Cache Rule 设为 Bypass。

## 服务器侧

`deploy/` 里已经配好，只需填变量：

```bash
cp .env.example .env && vim .env                      # 三个 *_DOMAIN
cp config.api.example.yaml config.api.yaml && vim config.api.yaml  # s3.public_endpoint
# 放好 certs/origin.pem 与 certs/origin.key
docker compose up -d api admin nginx
```

nginx 配置是 `deploy/nginx/templates/vetta.conf.template`（官方镜像的 envsubst 模板，启动时注入域名）。几个不能删的细节：

- **真实 IP 还原**（`deploy/nginx/cloudflare-ips.conf`）：CF 后面 `$remote_addr` 是边缘节点 IP。API 用 `ClientIP()` 做限流（`internal/middleware/ratelimit.go`），不还原的话全站用户被当成同一个 IP，限流直接误伤所有人。
- **XFF 用覆盖而非追加**：`proxy_set_header X-Forwarded-For $remote_addr`。gin 的 `ClientIP()` 默认取 XFF 最左，若用 `proxy_add_x_forwarded_for` 追加，客户端伪造的值会留在最左侧，限流就被绕过了。这也是 `api` 不再暴露 8080 的原因——直连就能随便伪造。
- **SSE 与网关不能缓冲**：`/api/v1/events/stream`（实时通知）和 `/gateway/`（LLM 流式代理）单独关掉 `proxy_buffering`，否则事件被 nginx 攒着不下发。
- **`client_max_body_size 2g`**：技能/插件/安装包经 admin 上传，nginx 默认 1m 会直接截断。

## 验证

```bash
# 1. 下载接口返回 302 而不是 200 + 文件体
curl -sI -H "Authorization: Bearer $TOKEN" \
  https://api.vettawork.app/api/v1/plugins/<id>/download | head -3
# 期望：HTTP/2 302，Location: https://cdn.vettawork.app/...X-Amz-Signature=...

# 2. 跟随重定向能真的下到东西
curl -sL -H "Authorization: Bearer $TOKEN" \
  https://api.vettawork.app/api/v1/plugins/<id>/download -o /tmp/p.zip && ls -l /tmp/p.zip

# 3. 摘要与市场列表一致
shasum -a 256 /tmp/p.zip
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.vettawork.app/api/v1/plugins/market | jq -r '.data[] | select(.plugin_id=="<id>") | .sha256'

# 4. 缓存是否生效（同一个预签名 URL 连打两次，第二次应为 HIT）
curl -sI "<上一步拿到的完整预签名 URL>" | grep -i cf-cache-status

# 5. 按 IP 直连应被 444 断开（curl 报 empty reply / connection reset）
curl -skI https://<VPS_IP>/

# 6. 限流按真实 IP 生效：换个网络再打同一接口，配额应独立
```

第 2 步注意：跨 origin 重定向时 `Authorization` 头会被 fetch/curl 剥离，这是预期行为（避免把 API token 泄漏给对象存储），访问授权由 URL 里的签名承担。

## 存量数据

- **技能**：归档对象只在上传时生成，存量技能 `archive_key` 为空，下载自动回落到旧的现打包路径，功能正常但不走直连。重新上传一次即可补上归档与摘要。
- **插件**：`sha256` 为空，客户端跳过校验。重新上传补齐。
- 不需要迁移脚本，新列由 GORM AutoMigrate 自动添加。
