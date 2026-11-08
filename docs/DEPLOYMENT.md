# 本机部署

## 固定入口

| 项目 | 配置 |
|---|---|
| 网站 | 食有数 SoloBowl |
| 域名 | `tomato3.xyz` |
| 本机地址 | `http://127.0.0.1:8797` |
| 健康接口 | `http://127.0.0.1:8797/healthz` |
| 现有 Cloudflare Tunnel | `floral-pattern-site` |
| 新增应用路由 | `tomato3.xyz` → `http://127.0.0.1:8797` |

缠枝纹网站仍使用自己的服务和端口。食有数的脚本不修改 Cloudflare token、原网站路由或原网站的启动项。

## 第一次运行

```powershell
.\solobowl.cmd build
.\solobowl.cmd start
.\solobowl.cmd status
.\solobowl.cmd autostart-install
```

浏览器打开本机首页，确认图片、菜名和做法可以加载。`service:status` 同时查询后台进程和实际 HTTP 服务。

Windows 自启使用当前用户的 Startup 快捷方式，调用隐藏启动脚本。在用户登录后生效；电脑关机、休眠或断网时，网站无法通过本机提供服务。Cloudflare 的连接进程仍沿用现有配置。

## 更新网站

```powershell
git pull --ff-only
.\solobowl.cmd build
.\solobowl.cmd restart
```

端口保持 8797。浏览器记录随来源保存，更新代码不需要清空 localStorage。

## 停止与撤销自启

```powershell
.\solobowl.cmd stop
.\solobowl.cmd autostart-remove
```

这两个命令只处理 SoloBowl。停止网站不删除用户浏览器中的收藏与做法。

## Cloudflare 接入

域名已经在阿里云改用 Cloudflare 分配的 DNS 服务器，Tunnel 应用路由也已创建。公网是否可访问，待域名状态变成 Active 后再验证。DNS 等待期间先完成本机运行即可。

路由参数：子域名留空，域名选择 `tomato3.xyz`，服务类型 HTTP，服务地址 `127.0.0.1:8797`，路径留空。若要使用 `www.tomato3.xyz`，另加一条同目标路由。

Tunnel 的 token 和账户凭据不存入本仓库。DNS 与隧道在 Cloudflare 控制台管理。

## 旧版和记录

同源 `/legacy-v3/` 提供旧版入口。新版保存到 `shiyoushu.app.v4`，迁移原文保存在独立副本与新版导出文件中。旧版继续使用原 v3 key，回退期间新增的旧版记录不自动并入新版。

本机地址和公网域名是两个不同来源。需要带走已有记录时，在旧地址导出，在新地址导入。

## 文件范围

HTTP 服务只提供构建后的页面与脚本，不开放项目目录列表。聊天附件、Git 配置、后台控制脚本和运行日志不属于网站资源。

基础配置参考：[Cloudflare 应用路由](https://developers.cloudflare.com/cloudflare-one/networks/routes/add-routes/)、[Node.js IPC](https://nodejs.org/api/net.html#ipc-support)。
