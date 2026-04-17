# 数据库规则

> ORM：GORM v2（`gorm.io/gorm` + `gorm.io/driver/postgres`）。DB 对象存放在 `internal/database/database.go` 的全局变量 `database.DB`。

---

## 连接初始化

入口：`packages/api/internal/database/database.go`

```go
db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
    Logger:                                   gormlogger.Default.LogMode(logLevel),
    DisableForeignKeyConstraintWhenMigrating: true,
})
// ...
sqlDB.SetMaxIdleConns(10)
sqlDB.SetMaxOpenConns(100)
```

约定：
- `release` 模式 GORM 日志降级为 `Warn`，开发使用 `Info`
- **关闭数据库外键**（`DisableForeignKeyConstraintWhenMigrating: true`）——关联完整性由业务层保证，不依赖 FK
- 连接池：max idle 10、max open 100；新增配置不要随意改这两个值

## Model 约定

所有业务模型嵌入 `model.Base`（`packages/api/internal/model/base.go`）：

```go
type Base struct {
    ID        uint           `json:"id" gorm:"primaryKey"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
}
```

- 主键统一 `uint`（AutoIncrement），外键字段用 `uint`，可空外键用 `*uint`
- 软删除：保留 `DeletedAt`，默认查询会自动过滤
- 字段 tag 真实示例（`internal/model/user.go`）：
  ```go
  Username string  `json:"username" gorm:"type:varchar(50);uniqueIndex;not null"`
  Email    *string `json:"email" gorm:"type:varchar(100);uniqueIndex"`
  Password string  `json:"-"      gorm:"type:varchar(100)"`
  IsActive bool    `json:"is_active" gorm:"default:true"`
  ```
- 敏感字段（如 `Password`）**必须** 用 `json:"-"` 屏蔽

## 迁移（Migrations）

**不使用**外部迁移工具（无 `migrations/` 目录），统一通过 GORM `AutoMigrate` 管理，入口：`internal/database/migrate.go`。

- 新增 model 后，必须在 `Migrate()` 的对应切片里登记：
  - `common` 切片：两种部署模式都会迁移
  - `config.C.IsEnterpriseMode()` 分支：企业模式独有（如 `Department`、`WorkflowTemplate`）
  - `config.C.IsPersonalMode()` 分支：个人模式独有（如 `Team`、`UserCredit`、`GatewayRequestLog`）
- 触发方式：`make migrate`，等价 `go run cmd/server/main.go -migrate`
- 种子数据放 `internal/database/seed.go`，由 `main.go` 在启动时调用；种子要**幂等**（先判存在再创建）

## 查询模式

### 直接查找

```go
var user model.User
if err := s.db.First(&user, id).Error; err != nil {
    return nil, errcode.ErrUserNotFound
}
```

### 动态条件 + 分页（真实示例 `UserService.ListPaginated`）

```go
query := s.db.Model(&model.User{})
if q.Search != "" {
    like := "%" + q.Search + "%"
    query = query.Where("username LIKE ? OR nickname LIKE ?", like, like)
}
var total int64
query.Count(&total)
offset := (q.Page - 1) * q.PageSize
query.Order("id DESC").Offset(offset).Limit(q.PageSize).Find(&users)
```

- 分页默认 `PageSize=10`，上限 `100`，超出自动夹紧
- 列表查询习惯 `Order("id DESC")`

### 关联查询

- 使用 `Preload("Department")` 预加载关联；不要用 N+1 循环再查
- 子查询：`Where("id IN (?)", s.db.Model(&X{}).Select("user_id").Where(...))`

### 更新

- **部分更新**使用 map：`s.db.Model(&user).Updates(map[string]any{"nickname": "..."})`
- 避免用结构体更新（零值会被忽略，容易漏字段）
- 更新单列用 `.Update("password", hashed)`

### 删除

- 优先软删除（model 带 `DeletedAt` 自动启用）：`s.db.Delete(&model.User{}, id)`
- 检查 `result.RowsAffected == 0` 判断是否真的删掉了一行
- 级联清理关联表要显式删除（项目不依赖 FK CASCADE）：

```go
s.db.Where("user_id = ?", id).Delete(&model.UserDepartment{})
result := s.db.Delete(&model.User{}, id)
```

## 事务

GORM v2 官方写法：

```go
err := s.db.Transaction(func(tx *gorm.DB) error {
    if err := tx.Create(&a).Error; err != nil {
        return err
    }
    if err := tx.Create(&b).Error; err != nil {
        return err
    }
    return nil
})
```

- 跨多张表的写操作必须走事务，函数返回 error 会自动回滚
- 事务闭包里**只使用 `tx`**，不要继续用外层 `s.db`

## Redis / 缓存

- 统一实例 `store.RDB`（`packages/api/pkg/store/redis.go`），通过 `store.InitRedis(config.C.Redis)` 初始化
- `ctx` 必须传递，`rdb.Get(ctx, key)` 等；短生命周期用 `context.WithTimeout`
- Pub/Sub 用于 SSE 广播，见 `internal/sse/pubsub.go`

## ✅ 推荐

- 所有数据访问错误统一包成 `errcode.ErrXxx.WithMsg("…")`
- 新字段同时补好 `json`、`gorm` tag，类型写明 `varchar(N)` / `text`
- 超过 3 个条件的列表查询抽 `XxxListQuery` 结构体传参

## ❌ 禁止

- 原生 `sql.DB` 或 `database/sql` 并行使用
- 在 handler 里直接 `database.DB.Where(...)`，必须走 service
- 使用 GORM 的结构体更新来做“部分更新”（零值陷阱）
- 依赖数据库外键约束做业务校验

## 常见错误

- 新增 model 忘记在 `migrate.go` 注册，本地启动不报错但生产表结构缺失
- 个人/企业模式独有表放到了 `common` 切片，导致另一种模式也在创建
- 事务闭包里混用 `tx` 和 `s.db`，回滚不一致
- 更新接口忘记用 map，把可选字段置空导致数据被清零
