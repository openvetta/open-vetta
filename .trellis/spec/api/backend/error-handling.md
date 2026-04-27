# 错误处理

> 本项目采用**业务错误**（`*errcode.BusinessError`）+ **统一响应函数**（`pkg/response`）+ **Gin Recovery 兜底**三段式。

---

## 核心类型：`BusinessError`

定义：`packages/api/pkg/errcode/errcode.go`

```go
type BusinessError struct {
    HTTPStatus int    `json:"-"`
    Code       int    `json:"code"`
    Message    string `json:"message"`
}

func (e *BusinessError) Error() string { return e.Message }
func (e *BusinessError) WithMsg(msg string) *BusinessError { /* 返回新实例 */ }
func (e *BusinessError) WithMsgf(format string, args ...any) *BusinessError
```

- 构造：`errcode.New(httpStatus, code, message)`
- **`WithMsg` / `WithMsgf` 不会修改原错误**，返回新实例；因此 `errcode.ErrUserNotFound.WithMsg("…")` 总是安全的
- 业务错误码是 **5 位整数**，约定前两位对应 HTTP 状态，后三位是细分码。例：
  - `40100` 未授权，`40101` Token 过期，`40102` Token 无效
  - `40900` 资源冲突，`40901` 用户已存在，`40902` 工作流已绑定
  - `50000` 服务内部错误

## 预定义错误

已按域拆分声明（保持同一文件，追加新域请遵守分组注释 `// --- 通用错误 ---` 等）：

- **通用**：`ErrInternal` / `ErrBadRequest` / `ErrNotFound` / `ErrConflict` / `ErrValidation`
- **认证**：`ErrUnauthorized` / `ErrTokenExpired` / `ErrTokenInvalid` / `ErrTokenMissing`
- **权限**：`ErrForbidden` / `ErrPasswordWrong`
- **用户 / 流转 / 工作流 / 团队 / 网关 / OAuth**：各自分组

新增业务错误时：
1. 在对应分组末尾追加 `ErrXxx = New(http.StatusXxx, <5位码>, "中文消息")`
2. 5 位码在整个文件**唯一**，不要复用；新错误码递增即可

## Service 层

`service` 层内部错误必须返回 `*errcode.BusinessError`；GORM/其他错误需要**包装**：

```go
// ✅ 推荐
if err := s.db.First(&user, id).Error; err != nil {
    return nil, errcode.ErrUserNotFound
}

// ✅ 动态消息
if err := s.db.Model(&user).Updates(updates).Error; err != nil {
    return nil, errcode.ErrInternal.WithMsg("更新用户失败")
}

// ❌ 禁止：把 gorm 原始 error 直接抛给上层
return nil, err
```

## Handler 层

统一用 `handler/base.go` 的小 helper：

```go
func (h *UserHandler) Me(c *gin.Context) {
    userID := middleware.GetUserID(c)
    user, err := h.svc.GetByID(userID)
    if err != nil {
        fail(c, err)
        return
    }
    ok(c, vo.FromUser(user))
}
```

- `ok(c, data)` / `okMsg(c, "…")` 返回 `{code:0, message:"success", data}`
- `fail(c, err)` 自动 `errors.As` 到 `*BusinessError`；是业务错误就用它自带的 `HTTPStatus/Code/Message`，否则 500 + 原始 message
- `failBiz(c, biz)` 用于手动构造单次错误，无须 wrap err

## 响应格式

见 `packages/api/pkg/response/response.go`：

```go
type Response struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
    Data    any    `json:"data,omitempty"`
}
```

- 成功：`code=0, message="success"`
- 失败：`code=<业务码>, message="<中文>"`, HTTP 状态由 `BusinessError.HTTPStatus` 决定
- `Fail/FailBiz` 会额外执行 `c.Error(err)` 供中间件 `middleware/logger.go` 记录

## 参数校验错误

- DTO 用 `binding:"required,min=6,max=72"` 等 tag
- `handler.bind(c, &req)` 失败时自动 `failBiz(c, errcode.ErrValidation.WithMsg(validator.TranslateError(err)))`
- `pkg/validator/validator.go` 把常见 tag 的错误消息翻译为中文：`required / email / min / max`

## Panic 兜底

`internal/middleware/recovery.go` 使用 `gin.CustomRecovery`：

```go
return gin.CustomRecovery(func(c *gin.Context, recovered any) {
    if biz, ok := recovered.(*errcode.BusinessError); ok {
        logger.L.Warn(biz.Message)
        response.FailBiz(c, biz)
        return
    }
    logger.L.WithFields(logrus.Fields{
        "stack": string(debug.Stack()),
    }).Error("panic recovered")
    response.FailBiz(c, errcode.ErrInternal)
})
```

- Service 层**允许** `panic(errcode.ErrXxx)` 直接跳出，会被 Recovery 还原为正常响应，但请优先 `return err`
- 其他 panic 会打印完整堆栈并统一返回 `ErrInternal`

## ✅ 推荐

- 在 service 返回错误前，用 `errcode.ErrXxx.WithMsgf("订单 %d 已关闭", id)` 提供上下文
- handler 只调 `fail(c, err)`，不要自己组装 JSON
- 新错误必须中文 message（面向前端展示）

## ❌ 禁止

- handler 返回 `c.JSON(500, gin.H{...})` 绕过统一封装
- 在 service / handler 内 `panic("...")` 传 string（Recovery 会识别为普通 panic）
- 在 `fail()` 之后继续写 `c.JSON(...)`——`response.Fail` 已经 `c.Abort()`
- 把错误信息直接拼接原始 GORM error（可能泄露 SQL），应映射到业务错误

## 常见错误

- 写了新的 `errcode.ErrXxx` 但忘了在 `Error()` 分组注释之下，后续维护时码段冲突
- `WithMsg` 用法误以为会修改原 var，其实返回新对象，旧的 `ErrXxx.Message` 不变
- handler 中 `err != nil` 后忘 `return`，导致同时写两次响应
