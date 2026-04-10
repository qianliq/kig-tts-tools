# kig-tts-tools (Web)

前端页面用于声音复刻与文本转语音，采用纯前端调用方式：

- 支持上传本地 wav，或者读取预留 wav 文件
- 前端直接调用声音复刻接口创建 `voice`
- 前端直接连接 Realtime WebSocket 获取音频
- 页面拿到音频后直接播放

## 1. 安装与启动

```bash
cd web
npm install
npm run dev
```

## 2. Docker 部署

在仓库根目录执行：

```bash
docker compose up -d --build
```

默认访问：`http://127.0.0.1:5173`

## 3. 环境变量（可选）

可在 `web/.env.local` 中预置 API Key：

```bash
VITE_DASHSCOPE_API_KEY=sk-xxx
```

你也可以不配置，在页面输入框中手动填写。

## 4. 预留 WAV 文件

如果你选择“使用预留 wav”，请将文件统一放到：

`web/public/wavs/`

页面会读取 `/wavs/wav-list.json`，并自动展示可选 WAV 列表。

如果使用 Docker，请将 wav 文件放到仓库根目录 `data/wavs/`，该目录会挂载到容器内 `web/public/wavs/`。

项目已配置：

- `npm run dev` 前自动执行 `npm run sync:wavs`
- `npm run build` 前自动执行 `npm run sync:wavs`

如需手动刷新列表可执行：

```bash
npm run sync:wavs
```

## 5. 代理说明

- 前端通过 Vite 代理访问 DashScope：`/proxy-cn`、`/proxy-intl`
- 前端通过 Vite WS 代理访问 Realtime：`/proxy-cn-ws`、`/proxy-intl-ws`
- WebSocket 鉴权通过 URL 参数 `api_key` 传递，代理会注入 `Authorization` 请求头

## 6. 重要注意项

- 声音复刻 (`target_model`) 与语音合成 (`model`) 必须一致，否则会失败。
- 中国内地与国际区域的 API Key 不互通，请在页面选择对应地域。
- 当前页面由用户输入 API Key，并写入浏览器 Cookie（本地持久化）。生产环境建议改为后端托管密钥。
- 若出现 `ERR_CONNECTION_RESET`，请先重启 `npm run dev`，并将上传的 WAV 控制在 8MB 以内。
