# 食有数

食有数是面向一人食的 Web 应用，包含时令推荐、菜谱和跟做。新版从 [tomato3.xyz](https://tomato3.xyz/) 进入。

## Windows 部署

使用 Node.js 24.12 或更新的 24.x、项目锁定的 npm 11.6.2，以及 PostgreSQL 18。将 PostgreSQL Windows 二进制包中的 `pgsql` 目录放到 `%LOCALAPPDATA%\ShiyoushuWeb\tools`，确认 `tools\pgsql\bin\pg_ctl.exe` 存在。 [Node.js 下载](https://nodejs.org/en/download) · [PostgreSQL 下载](https://www.postgresql.org/download/windows/)

在仓库目录执行以下命令。将 `node` 指向安装好的 Node.js，首次部署时传入公网主机名。

```powershell
npm ci
npm run build
node .\deploy\windows.cjs prepare tomato3.xyz
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\Install-WindowsStartup.ps1
Start-ScheduledTask -TaskName 'Shiyoushu Web'
```

PostgreSQL 和网页分别监听 `127.0.0.1:55434` 和 `127.0.0.1:8797`。Cloudflare Tunnel 将域名转发到网页端口。`/healthz` 检查数据库连通性。计划任务在当前 Windows 用户登录后启动，每次启动网页前会检查并应用待执行的迁移。凭据、数据库数据和日志保存在 `%LOCALAPPDATA%\ShiyoushuWeb`。

Windows 正式站的 `web.env` 使用 `AUTH_LOGIN_MODE=username`。使用账号名和密码注册、登录，账号记录继续按账号同步。邮件验证和邮件找回仅适用于邮箱模式。

要使用 OpenAI 增强推荐理由，在本机 `%LOCALAPPDATA%\ShiyoushuWeb\web.env` 填写 `OPENAI_API_KEY`，并设置 `AI_PROVIDER=openai`、`AI_MODEL=gpt-4.1-mini`。将 `AI_NOTICE_URL` 指向正式域名下的 `/privacy/recommendation-enhancement` HTTPS 页面。确认告知内容后，将 `AI_PROCESSING_APPROVED` 设为 `true`、`AI_MODE` 设为 `live`，然后重启 `Shiyoushu Web`。登录后在档案页授权，再从厨房触发增强。

GitHub Actions 在 Windows 上验证构建。更新时从 `main` 获取变更，停止 `Shiyoushu Web` 计划任务，安装依赖并重新构建，再启动计划任务。正式数据库初始化后只有表结构，正式菜谱和历表由内容审核流程发布。

`deploy/publish-workbook.ts` 使用正式库配置和本地批准清单，在一个事务中发布已审核的菜谱和历表。工作簿及审核资料留在维护机。迁移部署时随数据库备份 `public/content` 下已发布的封面。
