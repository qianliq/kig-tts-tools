import express from 'express'
import { WebSocket } from 'ws'

const app = express()
const PORT = Number(process.env.RELAY_PORT || 8787)

app.use(express.json({ limit: '50mb' }))

function getRegionConfig(region) {
  if (region === 'intl') {
    return {
      customizeUrl: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization',
      wsUrl: 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime'
    }
  }

  return {
    customizeUrl: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization',
    wsUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
  }
}

function decodeB64(base64) {
  return Buffer.from(base64, 'base64')
}

async function readUpstreamBody(response) {
  const contentType = response.headers.get('content-type') || ''
  const raw = await response.text()

  if (!raw) {
    return { parsed: null, raw: '' }
  }

  if (contentType.includes('application/json')) {
    try {
      return { parsed: JSON.parse(raw), raw }
    } catch (_error) {
      return { parsed: null, raw }
    }
  }

  return { parsed: null, raw }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/clone', async (req, res) => {
  const { apiKey, region, targetModel, preferredName, audioDataUri } = req.body || {}

  if (!apiKey || !targetModel || !preferredName || !audioDataUri) {
    return res.status(400).json({ error: 'Missing required fields for clone.' })
  }

  const { customizeUrl } = getRegionConfig(region)

  try {
    const response = await fetch(customizeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-voice-enrollment',
        input: {
          action: 'create',
          target_model: targetModel,
          preferred_name: preferredName,
          audio: {
            data: audioDataUri
          }
        }
      })
    })

    const { parsed, raw } = await readUpstreamBody(response)
    const result = parsed
    if (!response.ok) {
      const msg =
        result?.message ||
        result?.code ||
        raw.slice(0, 300) ||
        `Clone request failed with ${response.status}`
      return res.status(response.status).json({ error: msg, details: result || raw })
    }

    const voice = result?.output?.voice
    if (!voice) {
      return res.status(502).json({ error: 'No voice returned from upstream.', details: result })
    }

    return res.json({ voice })
  } catch (error) {
    return res.status(500).json({ error: `Clone relay error: ${error.message}` })
  }
})

app.post('/synthesize', async (req, res) => {
  const { apiKey, region, model, voice, text, mode } = req.body || {}

  if (!apiKey || !model || !voice || !text) {
    return res.status(400).json({ error: 'Missing required fields for synthesize.' })
  }

  const { wsUrl } = getRegionConfig(region)
  const realtimeUrl = `${wsUrl}?model=${encodeURIComponent(model)}`

  const ws = new WebSocket(realtimeUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })

  const chunks = []
  let settled = false
  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true
      ws.close()
      res.status(504).json({ error: 'Realtime synthesize timed out.' })
    }
  }, 60000)

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          mode: mode || 'server_commit',
          voice,
          response_format: 'mp3',
          sample_rate: 24000
        }
      })
    )

    ws.send(
      JSON.stringify({
        type: 'input_text_buffer.append',
        text
      })
    )

    if ((mode || 'server_commit') === 'commit') {
      ws.send(JSON.stringify({ type: 'input_text_buffer.commit' }))
    }

    ws.send(JSON.stringify({ type: 'session.finish' }))
  })

  ws.on('message', (raw) => {
    try {
      const payload = JSON.parse(raw.toString())

      if (payload.type === 'response.audio.delta' && payload.delta) {
        chunks.push(decodeB64(payload.delta))
      }

      if (payload.type === 'error' && !settled) {
        settled = true
        clearTimeout(timeout)
        ws.close()
        res.status(502).json({
          error: payload.message || 'Upstream realtime error',
          details: payload
        })
      }

      if (payload.type === 'session.finished' && !settled) {
        settled = true
        clearTimeout(timeout)
        ws.close()

        if (!chunks.length) {
          return res.status(502).json({ error: 'No audio chunks returned from upstream.' })
        }

        const audioBuffer = Buffer.concat(chunks)
        res.setHeader('Content-Type', 'audio/mpeg')
        res.setHeader('Content-Length', String(audioBuffer.length))
        return res.send(audioBuffer)
      }
    } catch (error) {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        ws.close()
        return res.status(500).json({ error: `Relay parse error: ${error.message}` })
      }
    }
  })

  ws.on('error', (error) => {
    if (!settled) {
      settled = true
      clearTimeout(timeout)
      return res.status(502).json({ error: `Relay websocket error: ${error.message}` })
    }
  })

  ws.on('close', (code, reasonBuffer) => {
    if (!settled) {
      settled = true
      clearTimeout(timeout)
      const reason = reasonBuffer ? reasonBuffer.toString() : ''
      return res.status(502).json({ error: `Relay websocket closed: code=${code}, reason=${reason}` })
    }
  })
})

app.listen(PORT, () => {
  console.log(`[relay] listening on http://127.0.0.1:${PORT}`)
})
