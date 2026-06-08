# zentao-mcp

ZenTao 18.13 的 MCP 服务（TypeScript，读写能力逐步扩展）。

## 已发布 npm
- 包名：`zentao-mcp`
- 使用 MCP 时不需要先 `npm install` 或手动 `npm start`
- 推荐直接在各大 AI 客户端的 MCP 配置中通过 `npx` 启动

## 支持主流 AI 客户端（直接可用）

### 1. Claude Desktop / Cursor / Windsurf
在客户端对应的 MCP 配置文件（如 `mcp.json` 或 `cline_mcp_settings.json`）中添加：

```json
{
  "mcpServers": {
    "zentao": {
      "command": "npx",
      "args": ["-y", "zentao-mcp"],
      "env": {
        "ZENTAO_BASE_URL": "https://zentao.example.com/",
        "ZENTAO_ACCOUNT": "your_account",
        "ZENTAO_PASSWORD": "your_password"
      }
    }
  }
}
```

### 2. Gemini CLI
在 Gemini CLI 的 MCP 配置文件中（如 `~/.gemini/mcp.json`）添加上述同样的 JSON 结构。

### 3. Claude Code
运行以下命令直接在当前项目绑定：
```bash
claude mcp add zentao -- npx -y zentao-mcp
```
*(注意：Claude Code 支持通过配置环境变量文件来加载凭据)*

### 4. Codex CLI
在 `~/.codex/config.toml` 增加：

```toml
[mcp_servers.zentao]
command = "npx"
args = ["-y", "zentao-mcp"]
env = { ZENTAO_BASE_URL = "https://zentao.example.com/", ZENTAO_ACCOUNT = "your_account", ZENTAO_PASSWORD = "your_password" }
startup_timeout_sec = 60.0
tool_timeout_sec = 60.0
```

重启各客户端后即可直接通过自然语言调用禅道工具。

## 多用户账号方式
- 每个使用者只需在自己的 MCP 配置中填写自己的禅道账号密码
- 默认读取 `env` 中的 `ZENTAO_BASE_URL/ZENTAO_ACCOUNT/ZENTAO_PASSWORD`
- 也支持在单次工具调用里传 `baseUrl/account/password` 覆盖
- 覆盖参数必须 3 个字段同时提供，否则返回 `INVALID_ARGUMENT`

## 功能
- MCP Server（stdio）
- 默认 14 个只读工具（推荐生产默认）：
  - `zentao_health_check`
  - `zentao_list_projects`
  - `zentao_get_project`
  - `zentao_list_executions`
  - `zentao_list_stories`
  - `zentao_get_story`
  - `zentao_list_tasks`
  - `zentao_get_task`
  - `zentao_list_bugs`
  - `zentao_get_bug`
  - `zentao_list_story_attachments`
  - `zentao_list_task_attachments`
  - `zentao_download_attachment`
  - `zentao_download_task_attachment`
- 可选开启写工具（共 12 个，需设置 `MCP_ENABLE_WRITE_TOOLS=true`）：
  - `zentao_create_task`
  - `zentao_update_task`
  - `zentao_start_task`
  - `zentao_pause_task`
  - `zentao_restart_task`
  - `zentao_finish_task`
  - `zentao_close_task`
  - `zentao_create_bug`
  - `zentao_assign_bug`
  - `zentao_resolve_bug`
  - `zentao_close_bug`
  - `zentao_activate_bug`
- `ZenTaoAuthClient`（Token 获取与缓存）
- `ZenTaoApiClient`（端点封装、鉴权重试、错误映射）

## 发布与分发
- 本地打包：`npm run pack:local`（会产出 `.tgz`）
- 发布前构建：`npm run prepack`
- 发布到 npm：`npm publish`（需先登录 npm）
- 详细发布流程见：[docs/PUBLISH.md](./docs/PUBLISH.md)

## 环境变量
- `ZENTAO_BASE_URL`
- `ZENTAO_ACCOUNT`
- `ZENTAO_PASSWORD`
- `ZENTAO_TIMEOUT_MS`（默认 `10000`）
- `ZENTAO_TOKEN_TTL_MS`（默认 `3000000`）
- `ZENTAO_SESSION_TTL_MS`（默认 `3000000`）
- `MCP_DEFAULT_PAGE`（默认 `1`）
- `MCP_DEFAULT_LIMIT`（默认 `20`）
- `MCP_MAX_LIMIT`（默认 `100`）
- `MCP_ENABLE_WRITE_TOOLS`（默认 `false`，设为 `true` 时注册 Task/Bug 写操作工具）
- `MCP_ENABLE_ATTACHMENT_TOOLS`（默认 `true`，设为 `false` 时关闭附件查询/下载工具）
- `MCP_ATTACHMENT_MAX_BYTES`（默认 `5242880`，附件下载最大字节数）
- `ZENTAO_E2E`（默认 `0`，设为 `1` 才执行真实禅道沙箱 E2E）
- `ZENTAO_E2E_PRODUCT_ID`（E2E 创建 Bug 使用的产品 ID）
- `ZENTAO_E2E_EXECUTION_ID`（E2E 创建 Task 使用的执行 ID）
- `ZENTAO_E2E_ASSIGNED_TO`（可选，开启生命周期动作时用于指派）
- `ZENTAO_E2E_BUG_LIFECYCLE`（默认 `0`，设为 `1` 运行 Bug assign/resolve/close/activate）
- `ZENTAO_E2E_TASK_LIFECYCLE`（默认 `0`，设为 `1` 运行 Task start/pause/restart/finish/close）

## 本地开发
1. 复制配置文件：`.env.example` -> `.env`
2. 安装依赖：`npm install`
3. 类型检查：`npm run check`
4. 运行测试：`npm run test`
5. 构建：`npm run build`
6. 启动（stdio）：`npm start`

## 真实禅道沙箱 E2E（手动开关）
- 默认不会在 `npm run test` 执行。
- 仅在显式运行 `npm run test:e2e` 且 `ZENTAO_E2E=1` 时执行真实写操作用例。
- E2E 用例会在禅道中创建真实 Task/Bug，请务必使用沙箱环境。

PowerShell 示例：
```powershell
$env:MCP_ENABLE_WRITE_TOOLS='true'
$env:ZENTAO_E2E='1'
$env:ZENTAO_E2E_PRODUCT_ID='123'
$env:ZENTAO_E2E_EXECUTION_ID='456'
$env:ZENTAO_E2E_ASSIGNED_TO='test_user' # 可选
$env:ZENTAO_E2E_BUG_LIFECYCLE='1'       # 可选
$env:ZENTAO_E2E_TASK_LIFECYCLE='1'      # 可选
npm run test:e2e
```

## 说明
- 当前版本默认只读（14 个工具，含需求/任务附件查询与下载）；如需写操作可通过环境变量显式开启。
- 返回结果包含标准化字段映射，并保留 `raw` 原始响应用于排障。
- `zentao_get_task` / `zentao_get_story` 的 `data.raw.actions[]` 包含备注、评论和历史动作；PR 链接通常可从 `actions[].comment` 中提取。
- 测试覆盖了参数校验、scope 路由和错误码映射等关键路径。
