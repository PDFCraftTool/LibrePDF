import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'

export class HtmlToPdfService {
  /**
   * 将网页 URL 或纯 HTML 字符串高质量转换为标准 PDF 文档
   * 采用 Electron 内置 Chromium 原生打印渲染，零外部依赖，支持完整 CSS3 与高保真排版
   */
  async convertUrlOrHtmlToPdf(
    source: { url?: string; html?: string },
    outputPath: string,
    options?: { landscape?: boolean; pageSize?: 'A4' | 'A3' | 'Letter'; printBackground?: boolean }
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    let win: BrowserWindow | null = null
    try {
      win = new BrowserWindow({
        show: false,
        width: 1200,
        height: 800,
        webPreferences: {
          offscreen: true,
          javascript: true
        }
      })

      if (source.url) {
        if (!/^(https?|file):\/\//i.test(source.url)) {
          throw new Error('仅支持 http(s):// 或 file:// 开头的地址')
        }
        // LoadURLOptions 不支持 timeout，这里自行竞速，防止页面挂起导致转换永不结束
        let timer: NodeJS.Timeout | undefined
        const loadPromise = win.loadURL(source.url)
        // 超时竞速失败后窗口会在 finally 中被 destroy，此时 loadURL 的 rejection 无人接收，
        // 挂一个空 catch 防止触发 unhandledRejection
        loadPromise.catch(() => {})
        await Promise.race([
          loadPromise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('网页加载超时（30 秒）')), 30000)
          })
        ]).finally(() => timer && clearTimeout(timer))
      } else if (source.html) {
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(source.html)}`
        await win.loadURL(dataUrl)
      } else {
        throw new Error('未提供有效的 URL 或 HTML 内容')
      }

      // 等待 DOM 与样式完全加载
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: options?.printBackground ?? true,
        landscape: options?.landscape ?? false,
        pageSize: options?.pageSize || 'A4',
        // Electron 21+ 的 printToPDF 使用英寸边距，旧版 marginType 字段会被忽略
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      })

      await fs.writeFile(outputPath, pdfBuffer)
      return { success: true, outputPath }
    } catch (err: any) {
      return { success: false, error: err.message || '网页转 PDF 失败' }
    } finally {
      if (win) {
        win.destroy()
        win = null
      }
    }
  }
}

export const htmlToPdfService = new HtmlToPdfService()
