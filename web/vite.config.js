import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

function attachWsAuthHeader(proxy) {
  proxy.on('proxyReqWs', (proxyReq, req) => {
    try {
      const reqUrl = new URL(req.url || '', 'http://localhost')
      const apiKey = reqUrl.searchParams.get('api_key')
      if (apiKey) {
        proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
      }
    } catch (_error) {
      // Ignore parsing errors and let upstream return diagnostics.
    }
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: ['frp.qadg.xyz'],
    proxy: {
      '/relay': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/relay/, ''),
      },
      '/proxy-cn': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/proxy-cn/, ''),
      },
      '/proxy-cn-ws': {
        target: 'wss://dashscope.aliyuncs.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/proxy-cn-ws/, ''),
        configure: attachWsAuthHeader,
      },
      '/proxy-intl': {
        target: 'https://dashscope-intl.aliyuncs.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/proxy-intl/, ''),
      },
      '/proxy-intl-ws': {
        target: 'wss://dashscope-intl.aliyuncs.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/proxy-intl-ws/, ''),
        configure: attachWsAuthHeader,
      },
    },
  },
})
