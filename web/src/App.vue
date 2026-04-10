<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const region = ref('cn')
const apiKey = ref(import.meta.env.VITE_DASHSCOPE_API_KEY || '')
const model = ref('qwen3-tts-vc-realtime-2026-01-15')
const preferredName = ref('my-cloned-voice')
const sourceMode = ref('preset')
const presetWavUrl = ref('')
const presetWavOptions = ref([])
const uploadedFile = ref(null)
const voiceId = ref('')
const inputText = ref('你好，这是一个基于声音复刻的网页 TTS 演示。')
const busy = ref(false)
const synthMode = ref('server_commit')
const autoPlayAfterReceive = ref(true)
const statusLogs = ref([])
const audioUrl = ref('')
const audioPlayerRef = ref(null)
const wsSampleRate = 24000
const maxWavSizeBytes = 8 * 1024 * 1024

const regionConfig = computed(() => {
  if (region.value === 'intl') {
    return {
      customizeBase: '/proxy-intl',
      wsBase: '/proxy-intl-ws'
    }
  }
  return {
    customizeBase: '/proxy-cn',
    wsBase: '/proxy-cn-ws'
  }
})

function pushLog(message) {
  statusLogs.value = [...statusLogs.value, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-12)
}

function clearAudio() {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
  }
  if (audioPlayerRef.value) {
    audioPlayerRef.value.pause()
    audioPlayerRef.value.removeAttribute('src')
    audioPlayerRef.value.load()
  }
  audioUrl.value = ''
}

onBeforeUnmount(() => {
  clearAudio()
})

onMounted(() => {
  loadPresetWavList()
})

function toDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取 WAV 文件失败'))
    reader.readAsDataURL(file)
  })
}

async function getWavFile() {
  if (sourceMode.value === 'upload') {
    if (!uploadedFile.value) {
      throw new Error('请先上传一个 wav 文件')
    }
    return uploadedFile.value
  }

  if (!presetWavUrl.value) {
    throw new Error('请先从列表中选择一个预留 wav')
  }

  const response = await fetch(presetWavUrl.value)
  if (!response.ok) {
    throw new Error(`读取预留 wav 失败: ${response.status}`)
  }

  const blob = await response.blob()
  return new File([blob], 'reserved.wav', { type: 'audio/wav' })
}

async function loadPresetWavList() {
  try {
    const response = await fetch('/wavs/wav-list.json', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const list = await response.json()
    if (!Array.isArray(list)) {
      throw new Error('wav-list.json 格式错误')
    }

    presetWavOptions.value = list
      .filter((item) => item && typeof item.name === 'string' && typeof item.url === 'string')
      .map((item) => ({ name: item.name, url: item.url }))

    if (!presetWavUrl.value && presetWavOptions.value.length) {
      presetWavUrl.value = presetWavOptions.value[0].url
    }

    pushLog(`已加载预留 wav 列表: ${presetWavOptions.value.length} 个`)
  } catch (_error) {
    presetWavOptions.value = []
    presetWavUrl.value = ''
    pushLog('未读取到 wav 列表，请先执行 npm run sync:wavs')
  }
}

function validateWavFileSize(file) {
  if (!file || typeof file.size !== 'number') {
    return
  }
  if (file.size > maxWavSizeBytes) {
    const maxMb = (maxWavSizeBytes / (1024 * 1024)).toFixed(0)
    const gotMb = (file.size / (1024 * 1024)).toFixed(2)
    throw new Error(`WAV 文件过大（${gotMb} MB）。请控制在 ${maxMb} MB 以内后重试`) 
  }
}

function handleFileChange(event) {
  const [file] = event.target.files || []
  uploadedFile.value = file || null
}

function normalizePreferredName(rawName) {
  const base = (rawName || '').trim() || `voice_${Date.now()}`
  let normalized = base.replace(/[^a-zA-Z0-9_]/g, '_')

  if (!/^[a-zA-Z]/.test(normalized)) {
    normalized = `v_${normalized}`
  }

  normalized = normalized.replace(/_+/g, '_').slice(0, 32)

  if (normalized.length < 3) {
    normalized = `voice_${Date.now().toString().slice(-6)}`
  }

  return normalized
}

async function safeReadJson(response) {
  const raw = await response.text()
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch (_error) {
    return null
  }
}

async function createVoiceFromWav() {
  if (!apiKey.value) {
    throw new Error('请填写 API Key')
  }

  const safePreferredName = normalizePreferredName(preferredName.value)
  if (safePreferredName !== preferredName.value) {
    preferredName.value = safePreferredName
    pushLog(`preferred_name 已自动规范为: ${safePreferredName}`)
  }

  const wavFile = await getWavFile()
  validateWavFileSize(wavFile)
  const dataUri = await toDataUri(wavFile)

  pushLog('正在调用声音复刻接口...')
  let response
  try {
    response = await fetch(`${regionConfig.value.customizeBase}/api/v1/services/audio/tts/customization`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-voice-enrollment',
        input: {
          action: 'create',
          target_model: model.value,
          preferred_name: safePreferredName,
          audio: {
            data: dataUri
          }
        }
      })
    })
  } catch (_error) {
    throw new Error('声音复刻请求失败（网络已重置）。请重启 npm run dev，并尝试更小的 WAV 文件')
  }

  const result = await safeReadJson(response)
  if (!response.ok) {
    throw new Error(result?.error || result?.message || result?.code || `声音复刻失败: HTTP ${response.status}`)
  }

  const newVoiceId = result?.voice || result?.output?.voice
  if (!newVoiceId) {
    throw new Error('未从接口返回中获取到 voice id')
  }

  voiceId.value = newVoiceId
  pushLog(`声音复刻成功，voice: ${newVoiceId}`)
  return newVoiceId
}

async function synthesizeSpeech() {
  if (!apiKey.value) {
    throw new Error('请填写 API Key')
  }
  if (!inputText.value.trim()) {
    throw new Error('请输入要合成的文本')
  }

  const usedVoice = voiceId.value || (await createVoiceFromWav())
  clearAudio()
  pushLog('正在直连 Realtime WebSocket 合成音频...')
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl =
    `${wsProtocol}//${window.location.host}` +
    `${regionConfig.value.wsBase}/api-ws/v1/realtime?model=${encodeURIComponent(model.value)}&api_key=${encodeURIComponent(apiKey.value)}`

  const audioChunks = []
  const player = audioPlayerRef.value
  let mediaSource = null
  let sourceBuffer = null
  let mediaSourceUrl = ''
  const pendingSegments = []
  let streamClosed = false

  const canUseStreaming =
    !!player &&
    typeof window !== 'undefined' &&
    'MediaSource' in window &&
    window.MediaSource.isTypeSupported('audio/mpeg')

  const appendQueuedSegments = () => {
    if (!sourceBuffer || sourceBuffer.updating) {
      return
    }
    const next = pendingSegments.shift()
    if (next) {
      sourceBuffer.appendBuffer(next)
      return
    }
    if (streamClosed && mediaSource && mediaSource.readyState === 'open') {
      mediaSource.endOfStream()
    }
  }

  const tryAutoPlay = () => {
    if (!player || !player.paused) {
      return
    }
    player.play().catch(() => {
      // Browsers may block autoplay until user interacts with controls.
    })
  }

  const playWhenReady = () => {
    if (!player) {
      return
    }

    let done = false
    const cleanup = () => {
      if (done) {
        return
      }
      done = true
      player.removeEventListener('canplay', onCanPlay)
      clearTimeout(fallbackTimer)
    }

    const onCanPlay = () => {
      cleanup()
      tryAutoPlay()
    }

    const fallbackTimer = setTimeout(() => {
      cleanup()
      tryAutoPlay()
    }, 1200)

    player.addEventListener('canplay', onCanPlay, { once: true })
  }

  if (canUseStreaming) {
    mediaSource = new window.MediaSource()
    mediaSourceUrl = URL.createObjectURL(mediaSource)
    player.src = mediaSourceUrl

    mediaSource.addEventListener('sourceopen', () => {
      if (!mediaSource || mediaSource.readyState !== 'open') {
        return
      }
      sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
      sourceBuffer.mode = 'sequence'
      sourceBuffer.addEventListener('updateend', () => {
        appendQueuedSegments()
      })
      appendQueuedSegments()
    })
  }

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    let settled = false

    const settleReject = (message) => {
      if (settled) {
        return
      }
      settled = true
      try {
        socket.close()
      } catch (_error) {
        // no-op
      }
      reject(new Error(message))
    }

    const settleResolve = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    const timeout = setTimeout(() => {
      settleReject('Realtime 合成超时（60s）')
    }, 60000)

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            mode: synthMode.value,
            voice: usedVoice,
            response_format: 'mp3',
            sample_rate: wsSampleRate
          }
        })
      )

      socket.send(
        JSON.stringify({
          type: 'input_text_buffer.append',
          text: inputText.value
        })
      )

      if (synthMode.value === 'commit') {
        socket.send(JSON.stringify({ type: 'input_text_buffer.commit' }))
      }

      socket.send(JSON.stringify({ type: 'session.finish' }))
    }

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data))

        if (payload.type === 'response.audio.delta' && payload.delta) {
          const binary = atob(payload.delta)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i)
          }
          audioChunks.push(bytes)

          if (canUseStreaming) {
            pendingSegments.push(bytes)
            appendQueuedSegments()
          }
        }

        if (payload.type === 'error') {
          clearTimeout(timeout)
          settleReject(payload.message || 'Realtime 返回错误')
          return
        }

        if (payload.type === 'session.finished') {
          clearTimeout(timeout)
          streamClosed = true
          appendQueuedSegments()
          settleResolve()
        }
      } catch (_error) {
        clearTimeout(timeout)
        settleReject('解析 Realtime 消息失败')
      }
    }

    socket.onerror = () => {
      clearTimeout(timeout)
      settleReject('WebSocket 连接失败，请检查代理或 API Key')
    }

    socket.onclose = (event) => {
      clearTimeout(timeout)
      if (!settled && event.code !== 1000) {
        settleReject(`WebSocket 异常关闭: code=${event.code}`)
      }
    }
  })

  const blob = new Blob(audioChunks, { type: 'audio/mpeg' })

  if (!blob.size) {
    throw new Error('Realtime 未返回音频数据')
  }

  audioUrl.value = URL.createObjectURL(blob)
  if (canUseStreaming && mediaSourceUrl) {
    URL.revokeObjectURL(mediaSourceUrl)
    if (player) {
      player.src = audioUrl.value
      player.load()
      if (autoPlayAfterReceive.value) {
        playWhenReady()
      }
    }
  } else {
    if (autoPlayAfterReceive.value) {
      playWhenReady()
    }
  }
  pushLog('合成完成，可在页面中播放音频')
}

async function runAll() {
  busy.value = true
  try {
    await synthesizeSpeech()
  } catch (error) {
    pushLog(`失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    busy.value = false
  }
}

</script>

<template>
  <div class="page">
    <header class="hero">
      <p class="tag">kig-tts-tools</p>
    </header>

    <main class="grid">
      <section class="card">
        <h2>1) 接口配置</h2>
        <label>
          Qwen API Key
          <a
            class="help-link"
            href="https://help.aliyun.com/zh/model-studio/get-api-key"
            target="_blank"
            rel="noopener noreferrer"
          >
            如何获取 Key
          </a>
          <input v-model="apiKey" type="password" placeholder="sk-..." />
        </label>

        <label>
          模型
          <input v-model="model" type="text" />
        </label>
      </section>

      <section class="card">
        <h2>2) WAV 来源</h2>
        <label class="inline">
          <input v-model="sourceMode" type="radio" value="upload" /> 上传本地 wav
        </label>
        <label class="inline">
          <input v-model="sourceMode" type="radio" value="preset" /> 使用预留 wav
        </label>

        <div v-if="sourceMode === 'upload'">
          <input type="file" accept="audio/wav,.wav" @change="handleFileChange" />
        </div>

        <div v-else>
          <label>
            预留 wav 列表
            <select v-model="presetWavUrl" :disabled="!presetWavOptions.length">
              <option value="" disabled>
                {{ presetWavOptions.length ? '请选择 wav' : '无可用 wav（先执行 npm run sync:wavs）' }}
              </option>
              <option v-for="item in presetWavOptions" :key="item.url" :value="item.url">
                {{ item.name }}
              </option>
            </select>
          </label>
        </div>

      </section>

      <section class="card wide">
        <h2>3) 文本合成</h2>
        <label>
          要合成的文本
          <textarea v-model="inputText" rows="6" />
        </label>

        <label class="switch-row">
          <span>接收完成后自动播放</span>
          <input v-model="autoPlayAfterReceive" class="switch-input" type="checkbox" />
          <span class="switch-slider" aria-hidden="true"></span>
        </label>

        <div class="actions">
          <button class="primary" :disabled="busy" @click="runAll">
            {{ busy ? '处理中...' : '生成音频' }}
          </button>
        </div>

        <audio ref="audioPlayerRef" :src="audioUrl || undefined" controls></audio>

        <div class="log">
          <p v-for="item in statusLogs" :key="item">{{ item }}</p>
        </div>
      </section>
    </main>
  </div>
</template>
