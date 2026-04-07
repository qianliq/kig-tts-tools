# kig-tts-tools

基于 Vue + Node Relay 的 Qwen3 TTS 网页工具。

你可以在网页中：

- 上传本地 wav，或使用项目内预留 wav
- 调用本地 relay 转发服务生成 voice
- 由 relay 转发实时 TTS 并返回音频
- 在网页中直接播放返回音频

## 功能概览

- 前端框架：Vue 3 + Vite
- 运行形态：前端 + 本地 relay（推荐）
- 支持模式：
  - server_commit
  - commit
- 支持区域：
  - 中国内地（北京）
  - 国际（新加坡）

## 目录结构

```text
kig-tts-tools/
├── docs/
│   ├── ref.md
│   └── 设计文档.md
└── web/
	 ├── public/
	 │   └── reserved.wav   # 可选：预留 wav
	 ├── src/
	 │   ├── App.vue
	 │   └── style.css
	 ├── .env.example
	 └── README.md
```

## 使用前准备

1. 准备 DashScope API Key（注意内地与国际区域不互通）。
2. 本地安装 Node.js 18+（建议 LTS 版本）。
3. 进入 web 目录安装依赖。

## 快速启动

```bash
cd web
npm install
npm run relay
```

新开一个终端，再执行：

```bash
cd web
npm run dev
```

启动后，打开终端输出中的本地地址（通常是 http://localhost:5173）。

## 环境变量（可选）

可复制 web/.env.example 为 web/.env.local，并填入：

```bash
VITE_DASHSCOPE_API_KEY=sk-xxx
```

不配置也可以，在页面中手动输入 API Key。

## 页面操作流程

1. 在页面填写 API Key。
2. 选择地域（中国内地 / 国际）。
3. 选择模型（默认 qwen3-tts-vc-realtime-2026-01-15）。
4. 选择 wav 来源：
	- 上传本地 wav
	- 使用预留 wav（默认路径 /reserved.wav）
5. 输入要合成的文本。
6. 点击：
	- 仅生成 voice：先做声音复刻，拿到 voice id。
	- 生成并播放音频：自动完成复刻 + TTS 合成，并在页面 audio 控件中播放。

## 预留 wav 的放置方法

如果使用“预留 wav”模式，请把文件放到：

web/public/reserved.wav

页面默认读取 /reserved.wav。

## 关键约束

- 声音复刻时的 target_model 与合成时的 model 必须一致。
- API Key 与地域必须匹配（内地 key 配内地 endpoint，国际 key 配国际 endpoint）。
- 建议使用 relay 转发方案，避免浏览器直接连接上游 WebSocket 时的兼容问题。

## 常见问题

1. 没有音频输出
	- 检查 voice 是否成功生成。
	- 检查 model 是否和复刻时一致。
	- 查看页面日志是否出现 response.audio.delta。

2. 连接失败或鉴权失败
	- 确认 API Key 有效。
	- 确认地域与 key 对应。
	- 检查网络是否可访问 DashScope WebSocket 地址。

3. 预留 wav 读取失败
	- 确认文件存在于 web/public/reserved.wav。
	- 确认文件为可读取的 wav 音频。

## 构建产物

```bash
cd web
npm run build
```

构建输出位于 web/dist。

