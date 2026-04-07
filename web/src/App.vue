<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const region = ref('cn')
const apiKey = ref(import.meta.env.VITE_DASHSCOPE_API_KEY || '')
const model = ref('qwen3-tts-vc-realtime-2026-01-15')
const preferredName = ref('my-cloned-voice')
const sourceMode = ref('upload')
const presetWavUrl = ref('/reserved.wav')
const uploadedFile = ref(null)
const voiceId = ref('')
const inputText = ref('你好，这是一个基于声音复刻的网页 TTS 演示。')
const busy = ref(false)
const synthMode = ref('server_commit')
const statusLogs = ref([])
const audioUrl = ref('')

const relayBase = computed(() => '/relay')

function pushLog(message) {
  statusLogs.value = [...statusLogs.value, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-12)
}

function clearAudio() {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
  }
  audioUrl.value = ''
}

onBeforeUnmount(() => {
  clearAudio()
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

  const response = await fetch(presetWavUrl.value)
  if (!response.ok) {
    throw new Error(`读取预留 wav 失败: ${response.status}`)
  }

  const blob = await response.blob()
  return new File([blob], 'reserved.wav', { type: 'audio/wav' })
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

async function ensureRelayReady() {
  try {
    const response = await fetch(`${relayBase.value}/health`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch (_error) {
    throw new Error('relay 服务不可用，请先在 web 目录运行: npm run relay')
  }
}

async function createVoiceFromWav() {
  if (!apiKey.value) {
    throw new Error('请填写 API Key')
  }

  await ensureRelayReady()

  const safePreferredName = normalizePreferredName(preferredName.value)
  if (safePreferredName !== preferredName.value) {
    preferredName.value = safePreferredName
    pushLog(`preferred_name 已自动规范为: ${safePreferredName}`)
  }

  const wavFile = await getWavFile()
  const dataUri = await toDataUri(wavFile)

  pushLog('正在调用声音复刻接口...')
  let response
  try {
    response = await fetch(`${relayBase.value}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey.value,
        region: region.value,
        targetModel: model.value,
        preferredName: safePreferredName,
        audioDataUri: dataUri
      })
    })
  } catch (_error) {
    throw new Error('声音复刻请求未到达服务端，请检查 dev 服务是否已重启且代理可用')
  }

  const result = await safeReadJson(response)
  if (!response.ok) {
    if (response.status === 502 && !result?.error) {
      throw new Error('声音复刻失败: HTTP 502（relay 已连接但上游网关失败，请稍后重试或检查地域与模型）')
    }
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

  await ensureRelayReady()

  const usedVoice = voiceId.value || (await createVoiceFromWav())
  clearAudio()
  pushLog('正在通过 relay 转发合成音频...')
  const response = await fetch(`${relayBase.value}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: apiKey.value,
      region: region.value,
      model: model.value,
      voice: usedVoice,
      text: inputText.value,
      mode: synthMode.value
    })
  })

  if (!response.ok) {
    const errorBody = await safeReadJson(response)
    if (response.status === 502 && !errorBody?.error) {
      throw new Error('合成失败: HTTP 502（relay 已连接但上游网关失败）')
    }
    const message = errorBody?.error || `合成失败: HTTP ${response.status}`
    throw new Error(message)
  }

  const blob = await response.blob()
  if (!blob.size) {
    throw new Error('转发服务未返回音频数据')
  }

  audioUrl.value = URL.createObjectURL(blob)
  pushLog('合成完成，可在页面中播放音频（relay）')
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

async function createVoiceOnly() {
  busy.value = true
  try {
    await createVoiceFromWav()
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
      <p class="tag">Qwen3 TTS · Vue 单页演示</p>
      <h1>上传或使用预置 WAV，直接网页合成并播放语音</h1>
      <p class="sub">
        无需单独后端。页面会先用 WAV 进行声音复刻，再调用实时 TTS 接口，最后生成可播放音频。
      </p>
    </header>

    <main class="grid">
      <section class="card">
        <h2>1) 接口配置</h2>
        <label>
          API Key
          <input v-model="apiKey" type="password" placeholder="sk-..." />
        </label>

        <label>
          地域
          <select v-model="region">
            <option value="cn">中国内地（北京）</option>
            <option value="intl">国际（新加坡）</option>
          </select>
        </label>

        <label>
          模型（声音复刻与合成必须一致）
          <input v-model="model" type="text" />
        </label>

        <label>
          合成模式
          <select v-model="synthMode">
            <option value="server_commit">server_commit</option>
            <option value="commit">commit</option>
          </select>
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
            预留 wav 路径
            <input v-model="presetWavUrl" type="text" placeholder="/reserved.wav" />
          </label>
        </div>

        <label>
          复刻名称
          <input v-model="preferredName" type="text" />
        </label>

        <label>
          已生成 voice
          <input v-model="voiceId" type="text" placeholder="可留空，点击合成时自动生成" />
        </label>
      </section>

      <section class="card wide">
        <h2>3) 文本合成</h2>
        <label>
          要合成的文本
          <textarea v-model="inputText" rows="6" />
        </label>

        <div class="actions">
          <button :disabled="busy" @click="createVoiceOnly">
            {{ busy ? '处理中...' : '仅生成 voice' }}
          </button>
          <button class="primary" :disabled="busy" @click="runAll">
            {{ busy ? '处理中...' : '生成并播放音频' }}
          </button>
        </div>

        <audio v-if="audioUrl" :src="audioUrl" controls></audio>

        <div class="log">
          <p v-for="item in statusLogs" :key="item">{{ item }}</p>
        </div>
      </section>
    </main>
  </div>
</template>
