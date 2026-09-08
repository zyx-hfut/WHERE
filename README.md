# WHERE

> Where is my... —— 一个开源、本地优先、支持双端同步的物品位置记录应用。

## 项目状态

当前处于 `v0.3.0-items` 开发阶段，已接入 SQLite 本地持久化、列表管理、物品 CRUD、备注和历史记录。完整需求拆解、技术路线、数据模型和迭代计划见 [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)，架构约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 产品目标

- 用最少操作记录“物品—列表—位置”。
- 数据默认保存在本地，基本操作离线可用且即时反馈。
- PC 与手机共享同一套领域模型，并支持安全同步和人工解决冲突。
- 通过可查看工作流的 LLM 智能体完成查询、创建、修改、备注和历史检索。
- 源码开放、资源占用低、界面简洁清新。

## 计划技术栈

- 前端：React、TypeScript、Vite、Zustand、Zod、CSS Variables
- 桌面/移动容器：Tauri 2
- 本地后端：Rust + Tauri Commands
- 本地数据库：SQLite（每个账号独立数据库/命名空间，事务和 FTS5）
- 测试：Vitest、React Testing Library、Playwright；Rust 单元测试
- 智能体：OpenAI-compatible Provider Adapter、结构化工具调用、本地轻量 RAG

## 开发原则

1. 先完成本地核心闭环，再加入智能体和同步。
2. UI 不直接操作 SQLite；所有写操作经过领域用例，并统一写入历史记录。
3. LLM 只能调用白名单工具，工具参数必须经过 schema 校验，修改操作默认可预览/确认。
4. 每个版本有明确范围、验收标准、变更记录和 Git tag。
5. 不把 API Key、密码或未加密的敏感凭据写入普通业务表。

## 运行环境

规划中的 Tauri 开发需要 Node.js、Rust、Windows WebView2/C++ 构建工具；移动端还需要 Android SDK，iOS 构建需要 macOS + Xcode。当前环境已检测到 Node.js、Rust 和 Tauri CLI；SQLite Rust 依赖已经下载并通过 `cargo check`。

安装前端依赖后可运行：

```bash
npm install
npm run dev
```

Tauri 桌面开发环境完整后可运行：

```bash
npm run tauri:dev
```

## 许可证

本项目使用 MIT License，详见 [LICENSE](LICENSE)。
