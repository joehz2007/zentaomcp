# zentao-mcp 发布清单（npm）

## 0. 前提
- Node.js >= 20
- 你有 npm 账号，并具备发布权限
- 当前目录是项目根目录

## 1. 本地质量门禁
```bash
npm run prepublish:check
```

## 2. 检查包名可用性
```bash
npm view zentao-mcp version --registry=https://registry.npmjs.org/
```
- 如果返回 `404 Not Found`，通常表示包名未被占用。
- 如果返回版本号，说明包已存在，需要确认是否你自己的包。

## 3. 登录 npm（注意用 npmjs registry）
```bash
npm login --registry=https://registry.npmjs.org/
```

验证登录：
```bash
npm whoami --registry=https://registry.npmjs.org/
```

## 4. 发布
```bash
npm run publish:npm
```

## 5. 验证安装
```bash
npx -y zentao-mcp --help
```

## 6. 给同事的 Codex 配置
在同事 `~/.codex/config.toml` 增加：

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

## 7. 常见问题
- `ENEEDAUTH`：未登录，先执行 `npm login`。
- 发布到镜像失败：使用 `--registry=https://registry.npmjs.org/`。
- 包已存在但非你账号：改包名（建议组织 scope，如 `@your-org/zentao-mcp`）。
