# OpenResty 部署调试记录（kig-tts-tools）

## 背景

- 部署环境：1Panel + OpenResty
- 域名：kig.qadg.xyz
- 前端形态：纯前端页面，调用
  - HTTP 代理路径：/proxy-cn、/proxy-intl
  - WebSocket 代理路径：/proxy-cn-ws、/proxy-intl-ws

## 问题现象

1. 打包部署后出现 404。
2. 修复部分路由后，WebSocket 仍失败：
   - 浏览器报错：WebSocket connection failed
   - 连接地址：ws://kig.qadg.xyz/proxy-cn-ws/api-ws/v1/realtime?...&api_key=...

## 排查过程

### 阶段 1：404 排查

定位结论：站点仅配置了静态根目录，未配置 /proxy-* 反向代理，导致前端请求被当作静态资源处理并返回 404。

修复点：

- 增加 SPA 回退：
  - location / { try_files $uri $uri/ /index.html; }
- 增加 HTTP 代理：
  - /proxy-cn -> https://dashscope.aliyuncs.com
  - /proxy-intl -> https://dashscope-intl.aliyuncs.com
- 增加 WebSocket 代理：
  - /proxy-cn-ws -> https://dashscope.aliyuncs.com
  - /proxy-intl-ws -> https://dashscope-intl.aliyuncs.com

### 阶段 2：WebSocket 失败排查

现象：已经命中 /proxy-cn-ws，但仍握手失败。

根因：

- 本地开发环境通过 Vite 代理把 URL 中的 api_key 注入到了 Authorization 请求头。
- 线上 OpenResty 没有这段注入逻辑。
- 上游实时接口鉴权依赖 Authorization: Bearer <api_key>。
- 仅传 query 参数时，上游会直接拒绝或关闭连接。

最终修复：

在 WebSocket 代理 location 中补充：

- proxy_set_header Authorization "Bearer $arg_api_key";

并保留标准 WS 升级头：

- proxy_http_version 1.1
- proxy_set_header Upgrade $http_upgrade
- proxy_set_header Connection "upgrade"

## 最终有效配置要点

1. 仅在 WS 相关 location 中设置 Upgrade/Connection，不要在 server 全局设置。
2. WS 代理必须设置 Authorization 头注入：
   - proxy_set_header Authorization "Bearer $arg_api_key";
3. 保留 proxy_ssl_server_name on，避免上游 SNI 问题。
4. 设置较长 read/send timeout，避免长文本合成时连接过早断开。

## 安全事项

- 调试时不要在公开渠道粘贴完整 API Key。
- 若发生泄露，应立即在控制台废弃并重建 Key。

## 结果

- 页面可正常发起声音复刻请求。
- Realtime WebSocket 可稳定连接并返回音频。
- 线上域名部署功能恢复正常。
