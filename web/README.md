# Qwen3 TTS Web Demo (Vue)

这个示例实现了你在设计文档中的目标（使用 relay 转发）：

- 支持上传本地 wav，或者读取预留 wav 文件
- 网页调用本地 relay 完成声音复刻并创建 `voice`
- relay 连接 Qwen3 Realtime TTS 并转发音频
- 网页接收转发后的音频并直接播放

## 1. 安装与启动

```bash
cd web
npm install
npm run relay
```

另开终端执行：

```bash
cd web
npm run dev
```

## 2. 环境变量（可选）

可在 `web/.env.local` 中预置 API Key：

```bash
VITE_DASHSCOPE_API_KEY=sk-xxx
```

你也可以不配置，在页面输入框中手动填写。

## 3. 预留 WAV 文件

如果你选择“使用预留 wav”，请将文件放到：

`web/public/reserved.wav`

启动后页面中默认会读取 `/reserved.wav`。

## 4. relay 说明

- relay 服务入口文件：`web/relay-server.js`
- 前端通过 `/relay/clone`、`/relay/synthesize` 调用 relay
- Vite 代理会将 `/relay/*` 转发到 `http://127.0.0.1:8787`

## 5. 重要注意项

- 声音复刻 (`target_model`) 与语音合成 (`model`) 必须一致，否则会失败。
- 中国内地与国际区域的 API Key 不互通，请在页面选择对应地域。
- 当前页面仍由用户输入 API Key。若用于生产，建议把 API Key 固定在服务端环境变量。
