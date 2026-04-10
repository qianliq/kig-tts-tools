# 参考资料

本文档用于维护当前项目实际使用到的官方资料链接，避免保留过期或冗长的粘贴内容。

## 必读

- 获取 API Key：
  https://help.aliyun.com/zh/model-studio/get-api-key
- Qwen 实时语音合成（Realtime TTS）：
  https://help.aliyun.com/zh/model-studio/qwen-tts-realtime
- Qwen 声音复刻：
  https://help.aliyun.com/zh/model-studio/qwen-tts-voice-cloning
- DashScope 模型列表：
  https://help.aliyun.com/zh/model-studio/models

## 本项目相关约束

- 当前前端使用 Realtime WebSocket 合成。
- 仅当模型支持 realtime 时，WebSocket 合成可用。
- 内地与国际 API Key 不互通，需与对应 endpoint 匹配。
- API Key 在前端浏览器 Cookie 本地保存，仅对当前浏览器用户有效。
