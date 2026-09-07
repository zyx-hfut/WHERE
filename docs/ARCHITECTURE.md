# WHERE 架构约束

## 分层

```text
React UI
  -> UI Store / View Model
  -> Application Use Cases
  -> Domain Model + Ports
  -> Tauri Commands
  -> Rust Services
  -> SQLite / File Storage / OS Secret Store
```

智能体走独立边界：

```text
Chat UI
  -> Agent Orchestrator
  -> RAG Retriever + Tool Registry
  -> Provider Adapter (LLM)
  -> Application Use Cases
```

### 强制边界

- React 组件不得拼接 SQL、读取数据库文件或直接调用第三方 LLM。
- Rust command 只做参数转换、权限检查和服务编排；业务规则放在 application/domain 层。
- 领域用例是唯一的写入入口，普通 UI 和智能体共用同一组用例。
- 工具调用不能绕过用例直接写表；危险工具必须返回待确认变更。
- 外部 Provider 的响应必须转成内部 DTO，禁止让厂商字段泄漏到领域层。

## 建议目录

```text
WHERE/
├─ apps/
│  └─ client/                 # React/Vite/Tauri 前端入口
├─ crates/
│  └─ where-core/              # Rust 领域服务、SQLite、Tauri commands
├─ packages/
│  ├─ domain-contracts/        # 前后端共享 schema/types
│  └─ agent-contracts/         # 工具和 AgentStep schema
├─ migrations/                # SQLite 版本迁移
├─ knowledge/                 # 智能体功能文档（RAG 原文）
├─ docs/                       # 计划、架构、ADR、用户说明
├─ tests/                      # 集成/端到端测试
├─ CHANGELOG.md
├─ README.md
└─ LICENSE
```

## 初始数据库表

```text
accounts
item_lists
items
item_notes
item_attachments
item_history
llm_presets
conversations
messages
agent_runs
agent_steps
sync_devices
sync_changes
sync_conflicts
```

所有业务表包含 `id`、`created_at`、`updated_at`；属于账号的数据包含 `account_id`。时间统一保存 UTC，显示层再按系统时区格式化。

## 安全模型

- 密码：Argon2id 哈希 + 安全参数；登录只解锁当前本地账号。
- LLM API Key：优先 OS keychain/secure storage；导出预设时默认不包含明文 key。
- 同步包：密码派生密钥或恢复密钥加密；传输层即使使用局域网也不作为唯一安全边界。
- 智能体：最小权限工具集、参数 schema、超时、取消、用户确认、审计历史。
- 图片和备份：路径必须位于应用管理目录或经过 allowlist 校验，防止任意文件读取。

## 性能模型

- 首屏只加载当前列表和必要图标；历史、图片和对话按需加载。
- 列表查询使用索引；名称/位置检索使用 SQLite FTS5 或明确的 LIKE fallback。
- 写操作小事务完成，UI 先展示 pending 状态，成功后刷新局部状态。
- 图片缩略图与原图分离，避免列表渲染加载大文件。
- LLM、RAG、同步均为可取消后台任务，不阻塞本地 CRUD。
