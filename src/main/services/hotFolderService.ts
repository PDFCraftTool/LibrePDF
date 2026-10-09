import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { PDFService } from './pdfService'
import { PythonService } from './pythonService'
import { PopplerService } from './popplerService'

export interface HotFolderConfig {
  inputDir: string
  outputDir: string
  action: 'ocr_sandwich' | 'watermark' | 'extract_tables' | 'extract_text'
  watermarkText?: string
  isRunning: boolean
}

export class HotFolderService {
  private config: HotFolderConfig | null = null
  private timer: NodeJS.Timeout | null = null
  private processedFiles = new Set<string>()
  private isScanning = false
  private pdfService: PDFService
  private pythonService: PythonService
  private popplerService: PopplerService

  constructor(pdfService: PDFService, pythonService: PythonService, popplerService: PopplerService) {
    this.pdfService = pdfService
    this.pythonService = pythonService
    this.popplerService = popplerService
  }

  private emitLog(message: string) {
    const wins = BrowserWindow.getAllWindows()
    wins.forEach((w) => {
      w.webContents.send('hotfolder:log', `[${new Date().toLocaleTimeString()}] ${message}`)
    })
  }

  async start(config: HotFolderConfig): Promise<{ success: boolean; message: string }> {
    try {
      await fs.mkdir(config.inputDir, { recursive: true })
      await fs.mkdir(config.outputDir, { recursive: true })

      this.config = { ...config, isRunning: true }
      this.processedFiles.clear()

      if (this.timer) clearInterval(this.timer)

      this.timer = setInterval(() => this.scan(), 3000)
      this.emitLog(`🚀 文件夹热监听已启动！监听目录: ${config.inputDir} -> 输出目录: ${config.outputDir}`)

      // 立即触发一次扫描
      this.scan()

      return { success: true, message: '监听服务已启动' }
    } catch (err: any) {
      return { success: false, message: err.message || '启动监听失败' }
    }
  }

  stop(): { success: boolean } {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.config) {
      this.config.isRunning = false
    }
    this.emitLog('⏹ 文件夹热监听服务已停止。')
    return { success: true }
  }

  getStatus(): { isRunning: boolean; config: HotFolderConfig | null } {
    return {
      isRunning: this.config?.isRunning ?? false,
      config: this.config
    }
  }

  private async scan() {
    if (!this.config || !this.config.isRunning) return
    // 防止上一轮（如耗时 OCR）尚未结束时定时器再次触发，导致同一文件被并发处理
    if (this.isScanning) return
    this.isScanning = true

    try {
      const files = await fs.readdir(this.config.inputDir)
      const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'))

      for (const fileName of pdfFiles) {
        const filePath = path.join(this.config.inputDir, fileName)

        // 以“文件名 + 大小 + 修改时间”作为处理标识：同名文件被覆盖更新后会重新处理
        let fileKey = ''
        try {
          const stat1 = await fs.stat(filePath)
          fileKey = `${fileName}|${stat1.size}|${stat1.mtimeMs}`
          if (this.processedFiles.has(fileKey)) continue
          // 简单延迟检测文件是否处于写入中
          await new Promise((r) => setTimeout(r, 600))
          const stat2 = await fs.stat(filePath)
          if (stat1.size !== stat2.size || stat1.mtimeMs !== stat2.mtimeMs) continue // 正在写入中，跳过本次
        } catch {
          continue
        }
        if (!this.config?.isRunning) break

        this.processedFiles.add(fileKey)
        // 防止 processedFiles 无限增长：超过 5000 条时清除最旧的一半（Set 保持插入顺序）
        if (this.processedFiles.size > 5000) {
          const dropCount = Math.floor(this.processedFiles.size / 2)
          let dropped = 0
          for (const key of this.processedFiles) {
            if (dropped++ >= dropCount) break
            this.processedFiles.delete(key)
          }
        }
        this.emitLog(`⚡ 检测到新 PDF 放入: ${fileName}，正在自动套用流水线 [${this.config.action}]...`)

        // 扩展名剥离需大小写不敏感（.PDF / .Pdf 等），否则输出文件名会带上原扩展名
        const baseName = fileName.replace(/\.[pP][dD][fF]$/, '')

        try {
          if (this.config.action === 'ocr_sandwich') {
            const outPath = path.join(this.config.outputDir, `${baseName}_searchable_ocr.pdf`)
            const res = await this.pythonService.ocrToSearchablePDF(filePath, outPath)
            if (res.success) {
              this.emitLog(`✅ ${fileName} 双层可搜索 OCR 处理完毕，已转存至输出目录`)
            } else {
              this.emitLog(`❌ ${fileName} OCR 处理失败: ${res.error}`)
            }
          } else if (this.config.action === 'watermark') {
            const outPath = path.join(this.config.outputDir, `${baseName}_watermarked.pdf`)
            const res = await this.pdfService.addWatermark(filePath, {
              text: this.config.watermarkText || '已审核归档',
              position: 'tiled',
              opacity: 0.2
            }, outPath)
            if (res.success) {
              this.emitLog(`✅ ${fileName} 水印处理完成`)
            } else {
              this.emitLog(`❌ ${fileName} 水印处理失败: ${res.message || res.error || '未知错误'}`)
            }
          } else if (this.config.action === 'extract_tables') {
            const outPath = path.join(this.config.outputDir, `${baseName}_tables.xlsx`)
            const res = await this.pythonService.extractTables(filePath, outPath)
            if (res.success) {
              this.emitLog(`✅ ${fileName} 表格提取完成，已导出 Excel: ${outPath}`)
            } else {
              this.emitLog(`❌ ${fileName} 表格提取失败: ${res.error || '未知错误'}`)
            }
          } else if (this.config.action === 'extract_text') {
            const res = await this.popplerService.extractText(filePath, { layout: true })
            if (res.success && res.text) {
              const outPath = path.join(this.config.outputDir, `${baseName}_layout.txt`)
              await fs.writeFile(outPath, res.text, 'utf-8')
              this.emitLog(`✅ ${fileName} 版面文本已保存为 txt 文件`)
            }
          }
        } catch (err: any) {
          this.emitLog(`❌ 处理 ${fileName} 遇到异常: ${err.message}`)
        }
      }
    } catch (err: any) {
      // 扫描瞬时读取错误不中断监听，但记录日志便于排查
      console.error('热文件夹扫描出错:', err?.message || err)
    } finally {
      this.isScanning = false
    }
  }
}
