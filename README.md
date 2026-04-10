# kig-tts-tools

`kig-tts-tools` 是一个基于 Vue 3 + Vite 的声音复刻与文本转语音网页工具。

当前实现为纯前端调用：

- 前端调用声音复刻 HTTP 接口创建 voice
- 前端连接 Realtime WebSocket 获取音频
- 页面播放合成音频
- API Key 保存在浏览器 Cookie（每个用户本地隔离）

## 目录结构

```text
kig-tts-tools/
├── docs/
│   ├── ref.md
│   ├── 设计文档.md
│   └── 项目架构文档.md
├── docker-compose.yml
├── data/
│   └── wavs/                # Docker 本地持久化目录
└── web/
    ├── public/
    │   └── wavs/
    ├── scripts/
    │   └── generate-wav-list.mjs
    ├── src/
    └── README.md
```

## 本地开发

```bash
cd web
npm install
npm run dev
```

## Docker 部署

```bash
docker compose up -d --build
```

默认访问地址：`http://127.0.0.1:5173`

### WAV 持久化

Docker 编排会将本地目录 `./data/wavs` 挂载到容器 `web/public/wavs`。

你只需要把 `.wav` 文件放到 `data/wavs`，然后重启容器或重新执行：

```bash
docker compose restart web
```

说明：应用启动时会自动扫描该目录并生成 `wav-list.json`。

## 关键说明

- 声音复刻模型和合成模型需保持一致。
- 内地与国际 API Key 不互通。
- 当前仓库中的 `web/relay-server.js` 为历史遗留文件，当前运行流程不依赖它。

