import type { AIConfig } from '../../shared/types'

export class AIService {
  /**
   * 检查本地 Ollama 服务是否在运行，并获取所有已下载的模型列表
   */
  async checkOllamaStatus(baseUrl = 'http://localhost:11434'): Promise<{ running: boolean; models: string[] }> {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/api/tags`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] }
        const models = (data.models || []).map((m) => m.name)
        return { running: true, models }
      }
      return { running: false, models: [] }
    } catch {
      return { running: false, models: [] }
    }
  }

  /**
   * 统一调用本地与云端模型
   */
  async callModel(
    config: AIConfig,
    messages: { role: string; content: string }[]
  ): Promise<{ text: string; error?: string }> {
    // 非流式调用统一加 120 秒超时，防止请求永久挂起
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000)
    try {
      if (config.provider === 'ollama') {
        const url = `${(config.baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/chat`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model || 'llama3',
            messages,
            stream: false,
            options: {
              temperature: config.temperature ?? 0.2
            }
          })
        })

        if (!res.ok) {
          const errText = await res.text()
          return { text: '', error: `Ollama 请求失败 (${res.status}): ${errText}` }
        }

        const data = await res.json() as { message?: { content: string } }
        return { text: data.message?.content || '' }
      } else {
        // OpenAI / LM Studio / DeepSeek compatible endpoint
        const baseUrl = config.baseUrl || 'http://localhost:1234/v1'
        const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`
        }

        const res = await fetch(url, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: config.temperature ?? 0.2
          })
        })

        if (!res.ok) {
          const errText = await res.text()
          return { text: '', error: `API 请求失败 (${res.status}): ${errText}` }
        }

        const data = await res.json() as { choices?: { message?: { content: string } }[] }
        return { text: data.choices?.[0]?.message?.content || '' }
      }
    } catch (err: any) {
      return { text: '', error: err.message || 'AI 调度执行异常' }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
