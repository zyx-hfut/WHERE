# Changelog

本文件记录 WHERE 每个可回溯版本的新增功能、修改和修复。

## [0.6.0-agent-read] - 2026-09-08

### Added

- 增加本地只读智能体检索：按物品名称、位置和备注查询。
- 支持“电子设备”等简单模糊类别查询。
- 智能体界面显示理解请求、检索本地数据、整理结果三个步骤。
- 增加智能体能力文档 `knowledge/agent-capabilities.md`。
- 增加 LLM 预设的名称、Base URL、模型字段保存和加载入口。
- 明确 API Key 暂不写入本地数据库，后续接入系统安全存储。
- 智能体只读查询不会调用物品写入接口。
- 增加名称、位置、备注检索测试。

### Verified

- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.5.0-account] - 2026-09-08

### Added

- 增加本地账号数据库，支持注册、登录、退出和切换账号。
- 使用 Argon2id 哈希保护密码和恢复密钥，数据库不保存明文凭据。
- 注册时生成一次性恢复密钥，可用于本地重置密码。
- 每个账号拥有独立的 SQLite 数据库和附件目录。
- 首个账号注册时自动迁移旧版无账号数据，并保留 legacy backup。
- 浏览器 fallback 使用独立账号数据空间，且不再以明文保存密码。
- 增加认证页面、恢复密钥提示和账户设置退出入口。

### Verified

- `npm run typecheck`
- `npm run build`
- `cargo fmt`
- `cargo check`
- `cargo test`

## [0.4.0-history-media] - 2026-09-08

### Added

- 增加 `item_attachments` SQLite 表和唯一物品图片关系。
- 图片保存到应用数据目录的 `attachments` 文件夹，数据库只记录安全的文件名和元数据。
- 支持图片上传、替换、读取、移除，以及删除物品时清理关联文件。
- 图片大小限制为 10MB，仅接受 `image/*` 类型。
- 图片变更写入物品历史记录。
- 浏览器预览使用 Data URL fallback，桌面端使用 Tauri 文件存储。
- 增加图片附件数据库测试。

### Verified

- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`（4 项数据库测试）

## [0.3.0-items] - 2026-09-08

### Added

- 接入 Rust + rusqlite + SQLite 本地数据库。
- 启用外键、WAL、事务和基础索引。
- 初始化“放在”“存有”列表。
- 实现列表创建、删除和物品数量统计。
- 实现物品新增、编辑、删除、备注和列表移动。
- 每次物品写操作自动记录历史快照。
- 前端通过统一 storage adapter 调用 Tauri commands；浏览器预览使用 localStorage fallback。
- 增加物品编辑、列表创建、历史查看和错误提示界面。

### Verified

- `npm run typecheck`
- `npm run build`
- `cargo fmt`
- `cargo check`

## [0.2.0-shell] - 2026-09-07

### Added

- 建立 React + TypeScript + Vite 前端应用壳。
- 添加 `@tauri-apps/cli` 开发依赖，支持执行 `npm run tauri:dev` 和 `npm run tauri:build`。
- 建立“物品位置 / 智能体 / 我的”三页导航和响应式布局。
- 建立 light/dark 主题切换入口。
- 建立物品列表、示例工作流、账号设置等 V0.2 视觉占位页面。
- 建立 Tauri 2 + Rust 工程目录和窗口配置。
- 添加前端类型边界、开发/构建脚本和基础 `.gitignore`。

### Known limitations

- Tauri Rust 依赖已完成编译；当前受限执行环境在启动桌面窗口时返回 `os error 5`，需在本机终端验证窗口显示。
- 当前物品数据为内存演示数据，SQLite 和历史记录将在 V0.3 接入。
- 当前智能体界面为交互壳，LLM Provider、RAG 和工具调用将在 V0.6/V0.7 接入。
- 当前 Tauri 原生构建尚未验证，原因是开发环境缺少 Rust 工具链。

## [0.1.0-planning] - 2026-09-07

### Added

- 完成产品需求分析和分阶段开发路线。
- 完成 React + TypeScript + Vite + Tauri 2 + Rust + SQLite 技术路线设计。
- 完成领域模型、分层边界、安全模型、同步原则和质量门禁文档。
- 建立 README 与 CHANGELOG 维护规则。

### Not built yet

- 当前尚未生成可编译的 Tauri 工程；开发环境还缺少 Rust 工具链。
