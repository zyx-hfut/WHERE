# WHERE

当前版本：`v0.14.2-bundle-fix`。桌面端备份支持用户选择保存位置，并已接入签名校验的在线更新框架。

## 桌面端备份与在线更新

- 桌面端点击“我的 → 备份与恢复”后，会弹出系统保存对话框，用户可以选择任意可写目录和文件名。
- 浏览器开发模式仍使用浏览器下载功能。
- 桌面端的“检查更新”按钮会访问 GitHub Release 的静态更新清单；发现新版本后可在应用内下载安装。
- 更新包必须经过 Tauri 签名。发布前需要在 GitHub 仓库 Secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，私钥不能提交到 Git。
- `.github/workflows/release.yml` 会在推送 `v*` tag 时构建 Windows 安装包并发布更新资源。

当前补丁版本：`v0.13.1-backup-fix`。桌面端备份会写入系统下载目录，并兼容跨端附件备份恢复。

## v0.13.0 数据与帮助

当前开发版本为 `v0.13.0-data-help`。

本版本完善了本地数据管理体验：历史记录支持物品快照、列表/位置、分页、单条删除和全部清空；备份文件统一为 `where-account-backup` JSON 格式，桌面端会同时打包图片字节，恢复时写回当前账号数据库和附件目录。使用说明改为分页内容，涵盖物品、列表、搜索、分组、智能体、备份与安全；“关于 WHERE”展示项目技术栈和当前版本信息。

备份恢复会替换当前账号的数据。导入前建议先导出一份当前备份，并只导入可信文件。

> Where is my... —— 一个开源、本地优先、支持双端同步的物品位置记录应用。

## 项目状态

当前处于 `v0.12.0-lists-groups` 开发阶段，列表已作为智能体可规划的独立原子操作，物品支持按位置、按物品分组折叠展示；同时保留通用工具组合、向量检索、复合计划和原子操作预览。完整需求拆解、技术路线、数据模型和迭代计划见 [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)，架构约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

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

规划中的 Tauri 开发需要 Node.js、Rust、Windows WebView2/C++ 构建工具；移动端还需要 Android SDK，iOS 构建需要 macOS + Xcode。当前环境已检测到 Node.js、Rust 和 Tauri CLI；SQLite、Argon2 依赖已经下载并通过编译验证。DeepSeek API Key 仅支持运行时内存输入，不应提交到仓库。

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
