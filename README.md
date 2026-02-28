# zentao-mcp

ZenTao 18.13 的只读 MCP 服务骨架（TypeScript）。

## 功能
- MCP Server（stdio）
- 10 个工具：
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
- `ZenTaoAuthClient`（Token 获取与缓存）
- `ZenTaoApiClient`（端点封装、鉴权重试、错误映射）

## 快速开始
1. 复制配置文件：
   - `.env.example` -> `.env`
2. 安装依赖：
   - `npm install`
3. 类型检查：
   - `npm run check`
4. 运行测试：
   - `npm run test`
5. 构建：
   - `npm run build`
6. 启动（stdio）：
   - `npm start`

## Codex CLI 一段配置即用
如果你已经把包发布到 npm（比如 `zentao-mcp`），同事只需在 `~/.codex/config.toml` 增加：

```toml
[mcp_servers.zentao]
command = "npx"
args = ["-y", "zentao-mcp"]
env = {
  ZENTAO_BASE_URL = "https://zentao.example.com",
  ZENTAO_ACCOUNT = "your_account",
  ZENTAO_PASSWORD = "your_password"
}
startup_timeout_sec = 60.0
tool_timeout_sec = 60.0
```

然后重启 Codex CLI，即可直接自然语言使用，无需手动运行 `npm start`。

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
- `MCP_DEFAULT_PAGE`（默认 `1`）
- `MCP_DEFAULT_LIMIT`（默认 `20`）
- `MCP_MAX_LIMIT`（默认 `100`）

## 多用户账号方式
- 默认方式：使用进程环境变量（`.env`）作为账号配置。
- 个人覆盖方式：每次工具调用可传入 `baseUrl/account/password`，优先级高于 `.env`。
- 覆盖参数必须同时提供 3 个字段，缺失任一项会返回 `INVALID_ARGUMENT`。

## 说明
- 当前是首版骨架，4 类核心对象已包含字段标准化映射，并保留 `raw` 原始响应。
- 测试覆盖了参数校验、scope 路由和错误码映射等关键路径。
