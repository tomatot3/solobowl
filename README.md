# 食有数 SoloBowl

一人食家常菜应用。找一顿饭，看看食材，照着做；喜欢的调味可以留到下次。

当前包含 15 种做法、3 篇厨房随记。支持一至两人份、调味选项、缺料替换、收藏、个人做法、步骤计时与本地备份。首页、一餐详情、做饭页共用一份内容数据。真正的 AI 接入留待后续版本。

## 开始使用

需要 Node.js 22 或更新版本，无第三方运行依赖。

```bash
npm run build
npm start
```

打开 `http://127.0.0.1:8797`。构建同时生成 `dist/solobowl.html`，可以单独打开演示。

## Windows 后台运行

```bash
npm run service:start
npm run service:status
npm run service:stop
npm run service:restart
```

后台进程隐藏运行，网站进程异常退出后约 5 秒重新启动。手动停止会一并停止看守进程。日志和 PID 放在 `.runtime/`。

```bash
npm run autostart:install
npm run autostart:remove
```

安装后，在当前 Windows 用户登录时启动。部署到新的机器或更换 Node.js 路径后，重新运行安装命令。

## 项目结构

| 目录 | 内容 |
|---|---|
| `src/` | 三页界面、样式、解析、保存与计时 |
| `content/build.cjs` | 菜谱编辑入口，生成完整的一人份与两人份方案 |
| `legacy-v3/` | 原版程序与基础菜谱；用于旧版回退和编辑内容来源 |
| `scripts/` | 构建、本机服务、后台运行和登录自启 |
| `docs/` | 开发规格、数据合同、任务与部署说明 |
| `dist/` | 构建产物，不提交 Git |
| `.runtime/` | 本机运行文件，不提交 Git |

只在本仓库编辑代码。`src/content.js` 与 `dist/` 由构建生成；旧的 `output/shiyoushu` 目录作为此前交付的存档。

## 数据与部署

用户收藏和个人做法存在浏览器 localStorage 中，服务器只提供静态文件。清理浏览器数据或换域名之前，可在“关于与备份”导出。`localhost` 与 `tomato3.xyz` 的记录相互独立，需要导出、导入来迁移。

本机服务监听 `127.0.0.1:8797`，通过既有 Cloudflare Tunnel 对接 `tomato3.xyz`。域名接入的等待状态不会影响本地使用。配置步骤见 [部署说明](docs/DEPLOYMENT.md)。

## 当前状态

- 三页使用流程、个人做法和新版图标信息卡已实现。
- 份量、调味和步骤引用共用完整方案；个人做法固定保存时的内容。
- v3 收藏通过明确 ID 对应找回，旧备注和记录保留为只读资料。
- 做饭时间是编辑估算，尚未逐道试做。
- 不包含账号、云同步、社区、支付或真实模型调用。

原开发规格和任务表保留为设计基线；运行方式与当前范围以本 README 和部署说明为准。
