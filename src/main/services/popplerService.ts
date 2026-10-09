import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { app } from 'electron'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// 统一的外部进程执行选项：防止坏文件导致子进程永久挂起
const EXEC_OPTIONS = { timeout: 600000, killSignal: 'SIGKILL' as const }

export class PopplerService {
  private getPopplerBinDir(): string {
    const isDev = !app.isPackaged
    if (isDev) {
      return path.join(process.cwd(), 'resources', 'bin', 'poppler')
    }
    return path.join(process.resourcesPath, 'bin', 'poppler')
  }

  private async findBinary(binName: string): Promise<string | null> {
    const ext = process.platform === 'win32' ? '.exe' : ''
    const localBin = path.join(this.getPopplerBinDir(), `${binName}${ext}`)
    
    try {
      await fs.access(localBin)
      return localBin
    } catch {
      // 检查系统 PATH 中是否可用；两处都找不到时返回 null，由调用方给出友好提示
      try {
        const probe = process.platform === 'win32' ? 'where' : 'which'
        await execFileAsync(probe, [binName], { timeout: 5000, windowsHide: true })
        return binName
      } catch {
        return null
      }
    }
  }

  /**
   * 使用 pdftotext 提取文本（带 -layout 选项以高保真还原物理排版）
   */
  async extractText(
    filePath: string,
    options?: { layout?: boolean; pageStart?: number; pageEnd?: number }
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    try {
      const bin = await this.findBinary('pdftotext')
      if (!bin) {
        return { success: false, error: '未检测到 Poppler 工具，请先安装' }
      }

      const args: string[] = []
      if (options?.layout ?? true) {
        args.push('-layout')
      }
      if (options?.pageStart) {
        args.push('-f', String(options.pageStart))
      }
      if (options?.pageEnd) {
        args.push('-l', String(options.pageEnd))
      }

      args.push(filePath)
      args.push('-') // 输出到 stdout

      const { stdout } = await execFileAsync(bin, args, {
        maxBuffer: 20 * 1024 * 1024,
        encoding: 'utf-8',
        ...EXEC_OPTIONS
      })

      return {
        success: true,
        text: stdout
      }
    } catch (err: any) {
      return {
        success: false,
        error: `pdftotext 执行失败: ${err.message || String(err)}`
      }
    }
  }

  /**
   * 使用 pdfimages 无损提取 PDF 内部原图
   */
  async extractImages(
    filePath: string,
    outputDir: string
  ): Promise<{ success: boolean; imagePaths?: string[]; count?: number; error?: string }> {
    try {
      const bin = await this.findBinary('pdfimages')
      if (!bin) {
        return { success: false, error: '未检测到 Poppler 工具，请先安装' }
      }

      await fs.mkdir(outputDir, { recursive: true })
      // 每次调用使用唯一临时子目录，避免残留文件或并发调用污染本次结果
      const workDir = await fs.mkdtemp(path.join(outputDir, 'img-'))
      const prefix = path.join(workDir, 'img')

      // -png 参数抽取为 png 格式
      await execFileAsync(bin, ['-png', filePath, prefix], { ...EXEC_OPTIONS })

      const files = await fs.readdir(workDir)
      const images = files
        .filter((f) => f.startsWith('img-') && (f.endsWith('.png') || f.endsWith('.jpg')))
        .map((f) => path.join(workDir, f))

      return {
        success: true,
        imagePaths: images,
        count: images.length
      }
    } catch (err: any) {
      return {
        success: false,
        error: `pdfimages 执行失败: ${err.message || String(err)}`
      }
    }
  }

  /**
   * 使用 pdfinfo 深度探测文档元数据与权限
   */
  async getInfo(filePath: string): Promise<{ success: boolean; info?: Record<string, string>; error?: string }> {
    try {
      const bin = await this.findBinary('pdfinfo')
      if (!bin) {
        return { success: false, error: '未检测到 Poppler 工具，请先安装' }
      }

      const { stdout } = await execFileAsync(bin, [filePath], { encoding: 'utf-8', ...EXEC_OPTIONS })
      const lines = stdout.split('\n')
      const result: Record<string, string> = {}

      for (const line of lines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim()
          const val = line.slice(colonIdx + 1).trim()
          result[key] = val
        }
      }

      return {
        success: true,
        info: result
      }
    } catch (err: any) {
      return {
        success: false,
        error: `pdfinfo 执行失败: ${err.message || String(err)}`
      }
    }
  }
}
