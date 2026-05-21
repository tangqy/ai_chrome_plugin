# Wujie AI GUI 功能规划

## 现状分析

### 已有的功能
- ✅ Tauri GUI 应用框架（`apps/gui/`）
- ✅ Bridge 服务启动/停止功能（Rust 后端）
- ✅ 前端使用 React + Ant Design
- ✅ ServicePanel 组件显示服务状态

### 需要新增的功能
1. **GUI 启动** - 完善现有功能，提供更友好的界面
2. **AI Agent/对话面板** - 后续阶段，支持与 Agent 对话
3. **Git 仓库管理** - 仓库选择、提交记录搜索、分支管理

---

## 架构设计

### 技术栈选择
- **GUI 框架**: Tauri 2 + React 18 + Ant Design 6
- **Git 操作**: Rust 端通过 `git2` crate 执行 Git 命令
- **路由**: React Router v6
- **状态管理**: React Context + useReducer（轻量级）

### 目录结构规划
```
apps/gui/
├── src/
│   ├── components/          # 公共组件
│   │   ├── Layout.tsx
│   │   └── Navigation.tsx
│   ├── pages/              # 页面组件
│   │   ├── ServicePanel.tsx    # 服务控制（现有）
│   │   ├── GitPanel.tsx        # Git 管理
│   │   └── AgentPanel.tsx      # AI Agent 对话
│   ├── hooks/              # 自定义 Hooks
│   │   └── useGit.ts
│   ├── contexts/           # React Context
│   │   └── AppContext.tsx
│   └── types/              # TypeScript 类型定义
│       └── index.ts
└── src-tauri/
    └── src/
        ├── commands/      # Tauri 命令
        │   ├── service.rs # 现有服务管理
        │   └── git.rs    # Git 操作命令
        └── lib.rs
```

---

## Phase 1: GUI 基础框架完善

### 1.1 完善 Tauri 配置
- **文件**: `apps/gui/src-tauri/tauri.conf.json`
- **内容**:
  - 添加窗口菜单配置
  - 配置系统托盘（可选）
  - 添加开发者工具（dev 环境）
  - 配置安全策略（CSP）

### 1.2 添加路由系统
- **安装依赖**: `react-router-dom`
- **文件**: `src/App.tsx`
- **功能**:
  - 添加侧边导航栏
  - 配置路由：/service, /git, /agent
  - 添加布局组件 Layout

### 1.3 创建布局组件
- **文件**: `src/components/Layout.tsx`, `src/components/Navigation.tsx`
- **功能**:
  - 侧边导航菜单
  - 顶部标题栏
  - 统一的页面容器

---

## Phase 2: Git 管理功能

### 2.1 Rust 端：Git 命令封装

#### 2.1.1 添加依赖
- **文件**: `apps/gui/src-tauri/Cargo.toml`
- **新增依赖**:
  ```toml
  git2 = "0.19"           # Git 操作库
  tauri-plugin-dialog = "2"  # 文件选择对话框
  tauri-plugin-fs = "2"     # 文件系统访问
  ```

#### 2.1.2 Git 命令实现
- **文件**: `apps/gui/src-tauri/src/commands/git.rs`
- **功能**:
  ```rust
  // 仓库操作
  open_repository(path: String) -> RepositoryInfo
  get_current_branch(repo_path: String) -> BranchInfo
  list_branches(repo_path: String) -> Vec<BranchInfo>
  switch_branch(repo_path: String, branch_name: String) -> Result<()>
  
  // 提交历史
  get_commit_history(repo_path: String, page: u32, per_page: u32) -> Vec<CommitInfo>
  search_commits(repo_path: String, query: String) -> Vec<CommitInfo>
  get_commit_detail(repo_path: String, commit_hash: String) -> CommitDetail
  
  // 提交信息结构体
  struct RepositoryInfo { path, name, branch }
  struct BranchInfo { name, is_current, is_remote }
  struct CommitInfo { hash, short_hash, message, author, timestamp }
  struct CommitDetail { full_hash, message, author, timestamp, files_changed }
  ```

### 2.2 前端：Git 面板实现

#### 2.2.1 创建 Git 面板
- **文件**: `src/pages/GitPanel.tsx`
- **功能区域**:
  1. **仓库选择区**
     - 显示当前选中的仓库路径
     - "选择仓库" 按钮（触发文件选择对话框）
     - 仓库信息卡片（名称、当前分支、提交数）
  
  2. **分支管理区**
     - 当前分支显示
     - 分支列表（下拉选择）
     - 切换分支按钮
     - 创建分支按钮（可选）
  
  3. **提交历史区**
     - 搜索框（搜索提交信息）
     - 提交列表（虚拟滚动支持）
     - 分页控件
     - 提交详情弹窗

#### 2.2.2 Git Hooks
- **文件**: `src/hooks/useGit.ts`
- **功能**:
  - `openRepository(path)` - 打开仓库
  - `getBranches()` - 获取分支列表
  - `switchBranch(branch)` - 切换分支
  - `getCommits(page, search?)` - 获取提交历史
  - `searchCommits(query)` - 搜索提交

#### 2.2.3 Git Context
- **文件**: `src/contexts/GitContext.tsx`
- **状态**:
  ```typescript
  interface GitState {
    repository: RepositoryInfo | null;
    branches: BranchInfo[];
    currentBranch: BranchInfo | null;
    commits: CommitInfo[];
    loading: boolean;
  }
  ```

---

## Phase 3: AI Agent 功能（后续阶段）

### 3.1 Agent 对话面板设计
- **文件**: `src/pages/AgentPanel.tsx`
- **UI 组件**:
  - 对话消息列表
  - 输入框（支持多行）
  - 发送按钮
  - 上下文选择器（当前 Git 仓库）

### 3.2 Agent 功能规划（初步）
- 与 Bridge 集成，通过 WebSocket 通信
- 支持自然语言查询 Git 仓库状态
- 代码审查和解释功能
- 任务分解和执行

> **注意**: Agent 详细功能将在 Phase 3 中具体规划

---

## 实现步骤

### 第一步：完善 GUI 基础框架
1. ✅ 添加 `react-router-dom` 依赖
2. ✅ 创建 Layout 和 Navigation 组件
3. ✅ 配置路由系统
4. ✅ 更新 App.tsx

### 第二步：添加 Git 功能
1. ✅ 更新 Cargo.toml 添加 git2 依赖
2. ✅ 实现 Git 命令（Rust 端）
3. ✅ 创建 Git 面板组件
4. ✅ 实现 Git hooks 和 context
5. ✅ 测试 Git 基本功能

### 第三步：完善 Git 管理功能
1. ✅ 添加提交历史搜索
2. ✅ 实现分支切换
3. ✅ 添加提交详情查看
4. ✅ 优化 UI 和用户体验

### 第四步：Agent 功能（后续）
1. ⏳ 设计 Agent 对话接口
2. ⏳ 实现基础对话功能
3. ⏳ 集成 Bridge 通信
4. ⏳ 添加上下文感知（Git 仓库）

---

## 配置和依赖

### Rust 依赖
```toml
# apps/gui/src-tauri/Cargo.toml
[dependencies]
git2 = "0.19"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

### Node 依赖
```bash
# apps/gui/package.json
pnpm add react-router-dom
```

### Tauri 配置更新
```json
// apps/gui/src-tauri/tauri.conf.json
{
  "app": {
    "windows": [{
      "title": "Wujie AI",
      "width": 1000,
      "height": 700,
      "minWidth": 800,
      "minHeight": 600
    }]
  },
  "plugins": {
    "dialog": {},
    "fs": {
      "scope": ["**"]
    }
  }
}
```

---

## 测试计划

### 功能测试
1. **服务管理**: 启动/停止 Bridge 服务
2. **Git 仓库选择**: 通过对话框选择本地仓库
3. **分支管理**: 查看分支列表、切换分支
4. **提交历史**: 查看历史、搜索提交、分页加载
5. **提交详情**: 查看单个提交的详细信息

### 边界情况
1. 无效的 Git 仓库路径
2. Git 命令执行失败（权限、网络等）
3. 大仓库性能（虚拟滚动）
4. 网络断开（Agent 功能）

---

## 文件清单

### 需要创建的文件
- `src/components/Layout.tsx`
- `src/components/Navigation.tsx`
- `src/pages/GitPanel.tsx`
- `src/pages/AgentPanel.tsx`（后续）
- `src/hooks/useGit.ts`
- `src/contexts/GitContext.tsx`
- `src/types/index.ts`
- `src-tauri/src/commands/git.rs`

### 需要修改的文件
- `apps/gui/package.json` - 添加依赖
- `apps/gui/src-tauri/Cargo.toml` - 添加 Rust 依赖
- `apps/gui/src-tauri/tauri.conf.json` - 完善配置
- `apps/gui/src-tauri/src/commands/mod.rs` - 注册 git 模块
- `apps/gui/src-tauri/src/lib.rs` - 注册新命令
- `apps/gui/src/App.tsx` - 添加路由
- `apps/gui/src/main.tsx` - 可选更新

---

## 风险和注意事项

### 技术风险
1. **git2 复杂性**: Git 操作需要处理各种边界情况
2. **性能**: 大仓库的提交历史可能很多，需要虚拟滚动
3. **安全**: 文件系统访问需要谨慎配置权限

### 建议
1. 先实现基础功能，再逐步完善高级特性
2. 使用虚拟列表处理大量提交记录
3. 添加错误处理和用户反馈
4. 考虑添加 Git 仓库的缓存机制

---

## 优先级排序

1. **P0**: 完善 GUI 框架和导航（基础）
2. **P0**: Git 仓库选择和基本信息显示
3. **P0**: 分支管理功能
4. **P1**: 提交历史查看和搜索
5. **P2**: 提交详情查看
6. **P3**: Agent 对话功能（后续）
