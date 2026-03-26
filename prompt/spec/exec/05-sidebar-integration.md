# 实施文档 5：侧边栏集成

## 一、目标

在侧边栏 ProjectsPanel 中展示批量项目及其任务会话。

## 二、修改文件

| 文件 | 变更 |
|------|------|
| `domains/project/components/ProjectsPanel.tsx` | 集成批量项目组件 |
| `domains/project/components/Sidebar.tsx` | 注入批量项目数据 |
| `shared/store/batch-tasks-atoms.ts` | 添加批量项目 atoms |

## 三、新增文件

| 文件 | 用途 |
|------|------|
| `domains/batch-tasks/components/BatchProjectGroup.tsx` | 侧边栏批量项目组 |

## 四、BatchProjectGroup.tsx

### 4.1 组件结构

```tsx
interface BatchProjectGroupProps {
  project: BatchProject;
  sessions: BatchSession[];  // 该项目的任务会话
  isExpanded: boolean;
  activeSessionPath?: string;
  onToggle: (projectId: string) => void;
  onSelectSession: (sessionPath: string) => void;
  onNewSession?: (taskId: string) => void;
}

function BatchProjectGroup({
  project,
  sessions,
  isExpanded,
  activeSessionPath,
  onToggle,
  onSelectSession,
}: BatchProjectGroupProps) {
  return (
    <div className="mb-1">
      {/* 项目行 */}
      <button
        type="button"
        onClick={() => onToggle(project.id)}
        className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left hover:bg-accent/50"
      >
        {/* 批量项目标识 Badge */}
        <BatchProjectBadge />
        
        <span className="icon-[mdi--folder-outline] h-4 w-4 shrink-0 text-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {project.name}
        </span>
        
        {/* 会话数量 */}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {sessions.length}
        </span>
      </button>
      
      {/* 任务会话列表 */}
      {isExpanded && (
        <div className="mt-px space-y-px">
          {sessions.map((session) => (
            <BatchSessionRow
              key={session.taskId}
              session={session}
              isActive={activeSessionPath === session.path}
              onSelect={() => onSelectSession(session.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 4.2 BatchProjectBadge

使用 Badge 组件作为批量项目标识，提高视觉观感：
```tsx
function BatchProjectBadge(): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
      批量
    </span>
  );
}
```

### 4.3 BatchSessionRow

```tsx
function BatchSessionRow({
  session,
  isActive,
  onSelect,
}: {
  session: BatchSession;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-left transition-colors duration-100",
        isActive ? "bg-accent dark:bg-accent/70" : "hover:bg-accent/50"
      )}
    >
      <span className="icon-[mdi--chat-outline] h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {session.name || session.firstMessage || session.taskId}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {relativeTime(session.modifiedAt)}
      </span>
    </button>
  );
}
```

## 五、ProjectsPanel.tsx 变更

### 5.1 数据注入

```tsx
// 从 atoms 获取批量项目和会话
const batchProjects = useAtomValue(batchProjectsAtom);
const batchSessionsMap = useAtomValue(batchSessionsMapAtom);

// 过滤出有 running 或 completed 状态会话的项目
const visibleBatchProjects = batchProjects.filter(project =>
  project.tasks.some(task =>
    task.status === "running" || task.status === "completed"
  )
);
```

### 5.2 渲染逻辑

```tsx
<>
  {/* 普通项目 */}
  {projects.map((project) => (
    <ProjectGroup
      key={project.cwd}
      project={project}
      sessions={sessionsMap.get(project.cwd) ?? []}
      isExpanded={expandedProjects.has(project.cwd)}
      activeSessionPath={activeSession?.sessionPath ?? ""}
      onToggle={toggleProject}
      onNewSession={(cwd) => void onOpenSession(cwd)}
      onSelectSession={(cwd, path) => void onOpenSession(cwd, path)}
      onRenameSession={handleRenameSession}
    />
  ))}
  
  {/* 批量项目 */}
  {visibleBatchProjects.map((project) => (
    <BatchProjectGroup
      key={project.id}
      project={project}
      sessions={getProjectSessions(project)}
      isExpanded={expandedBatchProjects.has(project.id)}
      activeSessionPath={activeSession?.sessionPath ?? ""}
      onToggle={toggleBatchProject}
      onSelectSession={(sessionPath) => handleOpenBatchSession(sessionPath)}
    />
  ))}
</>
```

## 六、Sidebar.tsx 变更

无需变更，保持现有结构。ProjectsPanel 内部处理批量项目的展示。

## 七、注意事项

- 批量项目使用 Badge 标识，不使用简单文字前缀
- 只显示 `running` 和 `completed` 状态的任务会话
- 会话点击后调用 `openSession` 打开会话
