# 部署操作手册：接入 Cloudflare 与市场产物 CDN

从当前状态（api 裸暴露 8080、admin 明文占 80、s3 暴露 9100）迁移到 nginx 统一入口 + 三个子域走 Cloudflare。

方案背景见 [cdn-object-storage.md](./cdn-object-storage.md)，本文只讲**按顺序做什么**。

---

## 开始前必读：为什么不能一步到位

`packages/desktop-app/.env.production` 当前是：

```
VETTA_SERVER_URL=http://120.26.174.239:8080/api/v1
```

这个地址在构建期被 vite `define` 写进二进制。**已发布的客户端只会访问它**，不会读任何远程配置。

所以：

> **8080 端口必须保留到存量客户端升级完毕。**
> 一旦提前关闭，未升级的客户端不仅用不了，连自动更新接口都够不着，
> 用户只能手动重新下载安装包。

自动更新链路本身走 API，所以只要 8080 还开着，存量客户端就能收到新版本、升级成指向域名的版本，实现自我迁移。整个迁移按阶段推进，**阶段 5 可能要等几周**。

---

## 阶段 1：Cloudflare 配置（不影响线上，可随时做）

这一阶段全部在 CF 后台，不碰服务器，线上服务不受影响。

### 1.1 DNS 记录

Cloudflare → vettawork.app → DNS → Records，新增三条（`@` 和 `www` 保持不动）：

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `api` | `120.26.174.239` | Proxied（橙云） |
| A | `admin` | `120.26.174.239` | Proxied（橙云） |
| A | `cdn` | `120.26.174.239` | Proxied（橙云） |

验证（DNS 生效后，此时还没配 nginx，返回什么错误码都行，能解析到 CF 即可）：

```bash
dig +short api.vettawork.app
# 期望：返回 CF 的 IP（104.x / 172.6x 段），不是 120.26.174.239
# 返回源站 IP 说明橙云没开
```

### 1.2 加密模式

SSL/TLS → Overview → 加密模式选 **Full (strict)**。

先别急着切，等阶段 2 装好源站证书再切也行。如果现在就切且源站还没证书，`api/admin/cdn` 三个子域会 5xx——但它们本来就还没启用，官网走的是自己的配置，不受影响。

### 1.3 源站证书

SSL/TLS → Origin Server → **Create Certificate**：

- Private key type：RSA (2048)
- Hostnames：`vettawork.app`、`*.vettawork.app`
- Validity：15 years

生成后页面会显示 **Origin Certificate** 和 **Private Key** 两段文本，**Private Key 只显示这一次**，务必当场存好。

### 1.4 Cache Rules

Caching → Cache Rules，建两条。

**规则 A：产物缓存**

- Rule name：`cdn-artifacts`
- If：`Hostname` `equals` `cdn.vettawork.app`
- Then：
  - Cache eligibility：**Eligible for cache**
  - Edge TTL：Override origin，**1 day**
  - Cache Key → Query String → **Ignore specific query string parameters**，逐个填入：
    ```
    X-Amz-Signature
    X-Amz-Date
    X-Amz-Credential
    X-Amz-Expires
    X-Amz-SignedHeaders
    X-Amz-Algorithm
    ```

> 这一步不做，CDN 等于没接。预签名 URL 每次签出来都不同，按完整 URL 做缓存键会导致命中率恒为 0。

**规则 B：API 不进缓存**

- Rule name：`api-bypass`
- If：`Hostname` `equals` `api.vettawork.app`
- Then：Cache eligibility → **Bypass cache**

API 响应带用户态，绝不能进共享缓存。

### 1.5 Cloudflare Access 保护 admin

Zero Trust → Access → Applications → **Add an application** → Self-hosted：

- Application name：`Vetta Admin`
- Application domain：`admin.vettawork.app`
- Identity providers：保留默认的 **One-time PIN**（邮箱验证码）
- Policies → Add a policy：
  - Policy name：`admin-only`
  - Action：**Allow**
  - Include：`Emails` → 填你自己的邮箱（多人则逐个加）
- Session duration：按需，24h 合理

配好后未通过认证的请求在 CF 边缘就被拦掉，到不了 VPS。

---

## 阶段 2：服务器配置（有短暂停机）

预计中断 1–2 分钟（admin 从 80 迁到 nginx 那一刻）。API 的 8080 全程不中断。

### 2.1 拉取新配置

```bash
cd <部署目录>          # 放 docker-compose.yml 的地方
git -C <仓库目录> pull  # 或手动同步 deploy/ 下的变更
```

需要同步过来的新文件：

```
deploy/nginx/templates/vetta.conf.template
deploy/nginx/cloudflare-ips.conf
```

### 2.2 放置证书

```bash
mkdir -p certs
vim certs/origin.pem   # 粘贴 1.3 的 Origin Certificate
vim certs/origin.key   # 粘贴 1.3 的 Private Key
chmod 600 certs/origin.key
```

### 2.3 更新 .env

```bash
vim .env
```

新增三行：

```
API_DOMAIN=api.vettawork.app
ADMIN_DOMAIN=admin.vettawork.app
CDN_DOMAIN=cdn.vettawork.app
```

### 2.4 更新 config.api.yaml

```bash
vim config.api.yaml
```

s3 段改成：

```yaml
s3:
  endpoint: "http://s3:9000"                    # 内网，上传/删除用
  public_endpoint: "https://cdn.vettawork.app"  # 签名用，必须与 CDN_DOMAIN 一致
  presign_expire: "30m"
  access_key: "<不变>"
  secret_key: "<不变>"
  region: ""
  bucket: "skills"
  use_ssl: false
```

> `public_endpoint` 与 `CDN_DOMAIN`、nginx 的 `server_name` 三者必须字符级一致。
> S3 签名把 host 计入，差一个字符签名就校验不过。

### 2.5 对照 docker-compose.yml

把仓库里 `docker-compose.example.yml` 的这几处变更同步到你的 `docker-compose.yml`：

- **新增** `nginx` 服务（占 80/443）
- **admin**：删掉 `ports: ["80:80"]`
- **s3**：`ports` 改为 `["127.0.0.1:9101:9001"]`，删掉 `9100:9000`
- **api**：`ports: ["8080:8080"]` **保留不动**（过渡期）

### 2.6 启动

```bash
docker compose up -d nginx        # 拉 nginx 镜像并启动
docker compose up -d              # 应用 admin/s3 的端口变更
docker compose ps                 # 确认全部 running
docker compose logs --tail=50 nginx
```

nginx 启动失败最常见的两个原因：证书路径不对，或 80 端口还被旧 admin 占着（`docker compose up -d` 会先停旧容器，正常不会撞）。

### 2.7 切换加密模式

若阶段 1.2 还没切，现在去 CF 后台把加密模式改成 **Full (strict)**。

---

## 阶段 3：验证

逐条跑，全绿再进下一阶段。

```bash
# 1. 三个子域 HTTPS 可达
curl -sI https://api.vettawork.app/api/v1/ | head -1
curl -sI https://cdn.vettawork.app/         | head -1
# admin 应被 CF Access 拦到登录页（302 到 cloudflareaccess.com）
curl -sI https://admin.vettawork.app/       | head -3

# 2. 按 IP 直连被 444 断开
curl -skI https://120.26.174.239/
# 期望：curl: (52) Empty reply from server

# 3. 旧客户端通道仍然活着（关键！）
curl -s http://120.26.174.239:8080/api/v1/ -o /dev/null -w '%{http_code}\n'

# 4. 登录拿 token，然后测市场
TOKEN=<你的 token>

# 5. 插件下载返回 302 到 cdn 域
curl -sI -H "Authorization: Bearer $TOKEN" \
  https://api.vettawork.app/api/v1/plugins/<id>/download | head -3
# 期望：HTTP/2 302 + Location: https://cdn.vettawork.app/...X-Amz-Signature=...

# 6. 跟随重定向能下到完整文件
curl -sL -H "Authorization: Bearer $TOKEN" \
  https://api.vettawork.app/api/v1/plugins/<id>/download -o /tmp/p.zip
ls -l /tmp/p.zip && unzip -t /tmp/p.zip | tail -1

# 7. 摘要与市场列表一致（新上传的条目才有；存量为空是正常的）
shasum -a 256 /tmp/p.zip
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.vettawork.app/api/v1/plugins/market \
  | jq -r '.data[] | select(.plugin_id=="<id>") | .sha256'

# 8. CDN 缓存命中（同一个预签名 URL 连打两次）
URL='<第 5 步 Location 的完整 URL>'
curl -sI "$URL" | grep -i cf-cache-status   # 第一次 MISS
curl -sI "$URL" | grep -i cf-cache-status   # 第二次应为 HIT
```

第 8 步如果第二次仍是 MISS，回去检查 Cache Rule 的 **Ignore specific query string parameters** 是否六个参数都填了。

**桌面客户端实测**：打开现有客户端（走旧的 8080），进能力页安装一个技能和一个插件，确认能装上。旧客户端没有 sha256 校验逻辑，会忽略该字段；下载时的 302 由 `fetch` 默认跟随，无需改动。

---

## 阶段 4：客户端切到域名

### 4.1 改配置

```bash
vim packages/desktop-app/.env.production
```

```
VETTA_SERVER_URL=https://api.vettawork.app/api/v1
VETTA_SITE_URL=https://www.vettawork.app
```

`.env.example` 一并更新，`.env.development` 按需（本地开发若连生产，同步改）。

### 4.2 发版

按常规流程构建、上传安装包、在 admin 里发布新版本。

### 4.3 验证新客户端

装一个新版本客户端，确认：

- 能登录（走 `https://api.vettawork.app`）
- 能装技能/插件
- **故意破坏校验**：在 admin 里改一下某个插件的 sha256（或直接替换 S3 对象但不重传），确认客户端安装时报「内容摘要与服务端不一致」并中止。验证完记得改回来。

---

## 阶段 5：关闭旧通道（数周后）

**前置条件**：确认存量客户端基本升级完毕。判断依据——观察 8080 端口的访问日志，活跃请求降到可忽略：

```bash
docker compose logs api --since 24h | grep -c "8080"
# 或在 nginx/API 日志里对比两个入口的请求量
```

保守做法是等两个自动更新周期。

### 5.1 关闭 8080

```yaml
# docker-compose.yml，api 服务
  api:
    ...
    # ports:              ← 整段删掉
    #   - "8080:8080"
```

```bash
docker compose up -d api
```

### 5.2 收尾验证

```bash
# 8080 应该不通
curl -s --max-time 5 http://120.26.174.239:8080/api/v1/ -o /dev/null -w '%{http_code}\n'
# 期望：连接失败

# 域名仍正常
curl -sI https://api.vettawork.app/api/v1/ | head -1

# XFF 伪造应无效（限流按真实 IP）
curl -s -H "X-Forwarded-For: 1.2.3.4" https://api.vettawork.app/api/v1/... 
# 服务端日志里的 client_ip 应是你的真实 IP，不是 1.2.3.4
```

至此源站 IP 完全藏在 CF 后面。

### 5.3 建议顺手做的

- **VPS 防火墙只放行 CF 回源网段**（80/443），彻底杜绝绕过 CF 直连源站。网段见 `deploy/nginx/cloudflare-ips.conf`。
- **换源站 IP**：源站 IP 已经在旧客户端里公开过很久，攻击者可能已记录。有条件的话换一个 IP，配合上一条防火墙规则，DDoS 防护才真正生效。

---

## 回滚

阶段 2 出问题时：

```bash
# 恢复旧 compose（admin 占 80，s3 开 9100）
git checkout docker-compose.yml    # 或手动改回
docker compose up -d --remove-orphans
docker compose stop nginx
```

`config.api.yaml` 的 `public_endpoint` 改回空串即可回到 API 代理下载，客户端无感（下载接口路径和语义不变，只是不再发 302）。

阶段 4 之后回滚要连客户端一起回退，成本高得多——所以阶段 3 的验证要认真跑完。

---

## 各阶段影响面速查

| 阶段 | 线上影响 | 可回滚性 |
|---|---|---|
| 1 CF 配置 | 无 | 随时删记录 |
| 2 服务器 | admin 中断 1–2 分钟；API 不中断 | 改回 compose 即可 |
| 3 验证 | 无 | — |
| 4 客户端发版 | 无（新老并存） | 需回退客户端版本 |
| 5 关 8080 | 未升级的存量客户端**永久失联** | 重开端口可恢复 |
