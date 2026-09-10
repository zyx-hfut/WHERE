# Changelog

本文件记录 WHERE 每个可回溯版本的新增功能、修改和修复。

## [0.9.0-agent-planner] - 2026-09-10

### Added

- 增加 `multi_step` 复合任务计划和 `tasks` 子任务数组。
- 支持按位置筛选多个物品并批量移动。
- 支持一条消息中同时执行移动、删除和新增等不同操作。
- 增加“任务分解与规划”“逐步检索与校验”工作流步骤展示。
- 所有子任务校验通过后统一生成确认预览。
- 支持 `delete_item` 的名称与位置联合定位。
- 复合任务执行后复用现有 SQLite 写入和历史记录链路。
- 能力文档增加复合请求拆解示例。
- 增加复合任务 Mock 计划测试。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.8.5-agent-all-items] - 2026-09-09

### Fixed

- 修复“我目前一共有哪些物品”等全量查询返回 0 条的问题。
- 增加 `all_items` 查询模式，模型不再为全量查询生成空关键词。
- 全量查询会读取当前账号所有列表中的物品，再交给模型自然语言总结。
- 增加全量查询能力文档和 Mock 计划测试。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`

## [0.8.4-agent-reliability] - 2026-09-09

### Fixed

- 修复切换/新建会话后，旧会话异步生成结果停止更新或串写到当前会话的问题。
- 每个智能体任务现在绑定自己的 conversation ID，可并行继续执行。
- 增加 `delete_items` 语义批量删除计划，支持名称包含、明确名称和语义类别。
- “需要用电的物品”由模型对本地候选逐个判断，不再只依赖固定电子设备关键词。
- 增加吹风机、充电宝等语义类别测试样例。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.8.3-search-settings] - 2026-09-09

### Added

- 实现全局搜索，支持物品名称、位置和备注。
- 搜索结果可直接跳转到物品所属列表。
- “我的”页面接通设备同步状态、使用说明、关于 WHERE 和全局历史入口。
- 增加当前账号本地数据导出 JSON 备份和导入恢复。
- 增加备份恢复格式校验和失败提示。
- 主题切换继续保留并可直接使用。

### Known limitations

- 设备同步入口目前展示规划状态，实际同步协议将在后续版本实现。
- 桌面端备份导出需要接入 Tauri 原生文件选择器，浏览器预览支持直接下载 JSON。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`

## [0.8.2-management] - 2026-09-09

### Added

- 支持单独删除智能体对话。
- 支持勾选多个对话并批量删除。
- 支持进入列表管理模式。
- 支持单独或批量删除列表。
- 删除列表前校验列表必须为空，并在删除前二次确认。
- 删除当前对话或列表后自动切换到可用项。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`

## [0.8.1-agent-context] - 2026-09-09

### Fixed

- 增加 `create_items` 批量新增意图，支持一次添加多个物品。
- 当前对话最近消息会注入下一轮模型请求，支持“都添加”等省略表达。
- 能力文档增加批量新增和上下文承接示例。
- Mock Provider 增加多物品和多轮上下文测试夹具。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.8.0-agent-chat] - 2026-09-09

### Added

- 增加本地智能体对话会话和历史列表。
- 支持新建对话、切换历史对话和继续当前对话。
- 发送消息后立即显示用户消息和助手生成中状态。
- 工作流步骤在助手消息下实时更新。
- DeepSeek 最终回答支持 SSE 流式输出。
- Mock Provider 支持逐段模拟输出，便于无 API Key 测试流畅体验。
- 支持对话消息状态保存，包括完成、生成中和错误状态。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.7.2-agent-synthesis] - 2026-09-09

### Fixed

- API Key 预设改为使用 Windows Credential Manager 持久化，切换页面后自动按预设加载。
- 预设元数据仍只保存名称、Provider、Base URL 和模型，不保存明文 API Key。
- 查询工具结果现在会再次交给模型进行自然语言总结，而不是由固定模板直接拼接。
- 对容器查询增加去重规则：不会把“钱包 存有 银行卡”再次当成钱包中的重复物品。
- 查询结果页面不再同时展示机械化原始记录卡片，避免回答重复。
- 增加钱包容器去重测试。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.7.1-agent-rag-plan] - 2026-09-09

### Changed

- 将查询计划改为由模型输出 `queryMode`：物品名称、位置包含关系或语义类别。
- 能力文档增加五类示例的字段提取规则。
- “床头柜里有什么”使用 `location_contains`，可匹配更具体的“床头柜第一个抽屉”。
- “电子设备都放在哪里”使用 `semantic_category` 和 `electronic_device` 类别。
- Mock Provider 改为固定示例夹具，不再作为正式意图识别逻辑。
- DeepSeek Provider 继续使用能力文档和结构化 JSON 计划。
- 增加五类示例的结构化计划测试。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.7.0-agent-write] - 2026-09-08

### Added

- 增加统一 Agent Provider 接口。
- 增加 Mock Provider，可在没有 API Key 时验证智能体意图和工具工作流。
- 增加 DeepSeek OpenAI-compatible Provider，支持运行时配置 Base URL、模型和 API Key。
- LLM 先读取能力文档 RAG，再生成结构化意图计划。
- 支持智能体规划查询、新增物品、修改位置、删除物品和更新备注。
- 写操作执行前显示变更预览，必须用户确认。
- 确认后复用现有 SQLite 事务和历史记录入口。
- 增加工具意图校验，拒绝未注册意图和 SQL 类越权操作。
- 增加 Mock Provider 结构化计划测试。

### Security note

- API Key 只在当前页面内存中使用，不写入 localStorage、源码或 Git。
- 生产版仍应将 API Key 迁移到操作系统安全存储，并将 Provider 请求移至 Rust 后端。

### Verified

- `npm test`
- `npm run typecheck`
- `npm run build`
- `cargo fmt --check`
- `cargo check`
- `cargo test`

## [0.6.1-auth-ui-fix] - 2026-09-08

### Fixed

- 修复创建账号、登录和重置密码按钮文字不可见的问题。
- 将认证页所需的主题颜色变量提升为全局变量，并为认证提交按钮增加明确的背景色。

### Security note

- API Key 不写入源码、Git 或普通配置文件；测试凭据应通过本地安全存储或未提交的环境变量注入。

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
