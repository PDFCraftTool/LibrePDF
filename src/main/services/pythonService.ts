import { execFile, spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'
import electron from 'electron'
import type {
  EncryptionOptions,
  SignP12Options,
  SignP12Result,
  PdfAResult,
  CompressLevel,
  CompressResult,
  RepairResult,
  SanitizeResult,
  SignatureValidationResult
} from '../../shared/types'

// 使用默认导入：在纯 Node（tsx 测试）下 'electron' 只导出可执行文件路径字符串，app 为 undefined
const app: Electron.App | undefined = (electron as any)?.app

const rawExecFileAsync = promisify(execFile)

// 统一的子进程默认参数：10 分钟超时、50MB 输出缓冲、隐藏 Windows 控制台窗口
// 记录所有运行中的子进程，便于应用退出时统一终止，避免残留后台 python 进程
const runningChildren = new Set<ChildProcess>()

const trackChild = (child: ChildProcess | undefined) => {
  if (!child) return
  runningChildren.add(child)
  child.once('exit', () => runningChildren.delete(child))
  child.once('error', () => runningChildren.delete(child))
}

export const killAllPythonChildren = () => {
  for (const child of runningChildren) {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }
  runningChildren.clear()
}

/** 构造仅附加了敏感参数的子进程环境变量（值为空的键不写入） */
const secretEnv = (secrets: Record<string, string | undefined>) => {
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8' }
  for (const [key, value] of Object.entries(secrets)) {
    if (value) env[key] = value
    else delete env[key]
  }
  return env
}

const execFileAsync = (file: string, args: string[], options: Record<string, any> = {}) => {
  const promise = rawExecFileAsync(file, args, {
    timeout: 10 * 60 * 1000,
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
    ...options
  }) as Promise<{ stdout: string; stderr: string }> & { child?: ChildProcess }
  trackChild(promise.child)
  return promise
}

export interface PythonOCRResult {
  success: boolean
  outputPath?: string
  pageCount?: number
  totalWords?: number
  error?: string
}

export interface PythonTableResult {
  success: boolean
  outputPath?: string
  tableCount?: number
  markdown?: string
  error?: string
}

export class PythonService {
  private cachedPython: string | null = null

  private getPythonRoot(): string {
    // 打包后 bridge.py 位于 resources/python（见 electron-builder extraResources）
    // 注意：主进程构建未注入 NODE_ENV，不能依赖 process.env.NODE_ENV 判断环境
    // 在纯 Node 环境（如 tsx 运行的测试脚本）中 electron 模块不提供 app 对象，回退到 cwd
    if (app?.isPackaged) {
      return path.join(process.resourcesPath, 'python')
    }
    return path.join(app ? app.getAppPath() : process.cwd(), 'python')
  }

  private getBridgeScriptPath(): string {
    return path.join(this.getPythonRoot(), 'bridge.py')
  }

  private async findPythonExecutable(): Promise<string> {
    if (this.cachedPython) return this.cachedPython

    // 1. 优先检测随应用/项目附带的虚拟环境或便携运行时
    const root = this.getPythonRoot()
    const localCandidates = process.platform === 'win32'
      ? [
          path.join(root, 'venv', 'Scripts', 'python.exe'),
          path.join(root, 'runtime', 'python.exe'),
          path.join(process.cwd(), 'python', 'venv', 'Scripts', 'python.exe')
        ]
      : [
          path.join(root, 'venv', 'bin', 'python'),
          path.join(process.cwd(), 'python', 'venv', 'bin', 'python')
        ]

    for (const candidate of localCandidates) {
      try {
        await fs.access(candidate)
        this.cachedPython = candidate
        return candidate
      } catch {
        // 继续尝试下一个
      }
    }

    // 2. 探测系统 PATH 中可用的解释器（规避 Windows 应用商店的 python.exe 占位符）
    const systemCandidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']
    for (const candidate of systemCandidates) {
      try {
        await execFileAsync(candidate, ['--version'], { timeout: 8000 })
        this.cachedPython = candidate
        return candidate
      } catch {
        // 继续尝试下一个
      }
    }

    throw new Error('未检测到可用的 Python 3 环境。请安装 Python 3.9+ 并执行 pip install -r python/requirements.txt')
  }

  private extractJsonFromStdout(stdout: string): any {
    const lines = stdout.trim().split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          return JSON.parse(line)
        } catch {
          continue
        }
      }
    }
    throw new Error(`无法从 Python 进程输出中解析 JSON 数据: ${stdout.slice(0, 200)}`)
  }

  /**
   * 检查 Python 侧车环境及 RapidOCR、PyMuPDF、OpenPyXL 是否就绪
   */
  async checkEnvironment(): Promise<{ ready: boolean; engine?: string; version?: string; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [scriptPath, '--action', 'check_env'], {
        encoding: 'utf-8'
      })

      const data = this.extractJsonFromStdout(stdout)
      const missing: string[] = Array.isArray(data.missing) ? data.missing : []
      return {
        ready: !!data.success,
        engine: data.engine,
        version: data.version,
        error: data.success
          ? undefined
          : `缺少 Python 依赖: ${missing.join(', ') || '未知'}，请执行 pip install -r python/requirements.txt`
      }
    } catch (err: any) {
      return {
        ready: false,
        error: `Python 侧车环境异常: ${err.message || String(err)}`
      }
    }
  }

  /**
   * 制作双层可搜索可复制的 Sandwich PDF (使用 RapidOCR 深度学习引擎)
   */
  async ocrToSearchablePDF(
    inputPath: string,
    outputPath: string,
    dpi = 200,
    onProgress?: (progress: { page: number; totalPages: number; percent: number }) => void
  ): Promise<PythonOCRResult> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      return new Promise<PythonOCRResult>((resolve) => {
        const child = spawn(pythonBin, [
          scriptPath,
          '--action', 'ocr_sandwich',
          '--input', inputPath,
          '--output', outputPath,
          '--dpi', String(dpi)
        ], { windowsHide: true })
        trackChild(child)

        let stdoutData = ''
        let stderrData = ''
        // 跨 chunk 行缓冲：进度 JSON 行可能被截断在 chunk 边界，只解析完整行，残段留到下一个 chunk
        let stderrLineBuf = ''

        child.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString('utf-8')
        })

        child.stderr.on('data', (chunk) => {
          const str = chunk.toString('utf-8')
          stderrData += str
          // 解析可能存在的进度事件
          stderrLineBuf += str
          const lines = stderrLineBuf.split('\n')
          stderrLineBuf = lines.pop() ?? ''
          for (const line of lines) {
            if (line.includes('"type": "progress"')) {
              try {
                const prog = JSON.parse(line.trim())
                onProgress?.(prog)
              } catch {}
            }
          }
        })

        child.on('close', (code) => {
          // 进程结束后解析缓冲区中残留的最后一行（可能没有换行符结尾）
          if (stderrLineBuf.includes('"type": "progress"')) {
            try {
              const prog = JSON.parse(stderrLineBuf.trim())
              onProgress?.(prog)
            } catch {}
          }
          stderrLineBuf = ''
          if (code === 0) {
            try {
              const res = this.extractJsonFromStdout(stdoutData)
              resolve(res)
            } catch (err: any) {
              resolve({ success: false, error: err.message })
            }
          } else {
            resolve({
              success: false,
              error: `OCR 执行失败 (退出码 ${code}): ${stderrData || stdoutData}`
            })
          }
        })

        child.on('error', (err) => {
          resolve({ success: false, error: `启动 Python 进程失败: ${err.message}` })
        })
      })
    } catch (err: any) {
      return { success: false, error: err.message || '执行 OCR 遇到未知异常' }
    }
  }

  /**
   * 复杂表格版面深度学习识别并转为标准 Excel (.xlsx) 与 Markdown
   */
  async extractTables(
    inputPath: string,
    outputPath: string,
    pages?: number[]
  ): Promise<PythonTableResult> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'extract_tables',
        '--input', inputPath,
        '--output', outputPath
      ]

      if (pages && pages.length > 0) {
        args.push('--pages', pages.join(','))
      }

      const { stdout } = await execFileAsync(pythonBin, args, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024
      })

      const res = this.extractJsonFromStdout(stdout)
      return res
    } catch (err: any) {
      return {
        success: false,
        error: `表格提取执行失败: ${err.message || String(err)}`
      }
    }
  }

  /**
   * 提取页面可编辑文本块及几何坐标
   */
  async getTextBlocks(inputPath: string, pageNum: number): Promise<{ success: boolean; blocks?: any[]; pageWidth?: number; pageHeight?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'get_text_blocks',
        '--input', inputPath,
        '--page', String(pageNum)
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '获取文本块失败' }
    }
  }

  /**
   * 原地正文替换编辑
   */
  async editText(
    inputPath: string,
    outputPath: string,
    pageNum: number,
    rect: number[],
    newText: string,
    fontSize?: number
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'edit_text',
        '--input', inputPath,
        '--output', outputPath,
        '--page', String(pageNum),
        '--rect', JSON.stringify(rect),
        '--text', newText
      ]

      if (fontSize) {
        args.push('--fontSize', String(fontSize))
      }

      const { stdout } = await execFileAsync(pythonBin, args, { encoding: 'utf-8' })
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '正文编辑失败' }
    }
  }

  /**
   * 物理脱敏 (True Redaction)
   */
  async redact(
    inputPath: string,
    outputPath: string,
    pageNum?: number,
    rects?: number[][],
    pattern?: string,
    fillColor: number[] = [0, 0, 0]
  ): Promise<{ success: boolean; outputPath?: string; redactedCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'redact',
        '--input', inputPath,
        '--output', outputPath,
        '--color', JSON.stringify(fillColor)
      ]

      // 与 Python 侧约定：--page 0 表示全文档脱敏。pageNum 未指定/为 0 时必须显式传 0，
      // 否则 bridge.py 的 argparse 默认值 1 会导致"全文档脱敏"实际只脱敏第 1 页
      args.push('--page', String(pageNum && pageNum > 0 ? pageNum : 0))
      if (rects && rects.length > 0) args.push('--rects', JSON.stringify(rects))
      if (pattern) args.push('--pattern', pattern)

      const { stdout } = await execFileAsync(pythonBin, args, { encoding: 'utf-8' })
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '脱敏失败' }
    }
  }

  /**
   * 添加 PDF 批注 (高亮/下划线/画笔手绘/便签)
   */
  async addAnnotation(
    inputPath: string,
    outputPath: string,
    pageNum: number,
    annotType: string,
    options: {
      rect?: number[]
      points?: number[][]
      color?: number[]
      content?: string
    }
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'add_annot',
        '--input', inputPath,
        '--output', outputPath,
        '--page', String(pageNum),
        '--annotType', annotType
      ]

      if (options.rect) args.push('--rect', JSON.stringify(options.rect))
      if (options.points) args.push('--points', JSON.stringify(options.points))
      if (options.color) args.push('--color', JSON.stringify(options.color))
      if (options.content) args.push('--text', options.content)

      const { stdout } = await execFileAsync(pythonBin, args, { encoding: 'utf-8' })
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '批注保存失败' }
    }
  }

  /**
   * 本地长文档 RAG 语义切片与检索问答
   */
  async queryRAG(
    inputPath: string,
    query: string
  ): Promise<{ success: boolean; citations?: { page: number; text: string; score: number }[]; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'rag_query',
        '--input', inputPath,
        '--query', query
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'RAG 查询失败' }
    }
  }

  /**
   * 仿真扫描件质感效果 (Scanner Effect)
   */
  async scannerEffect(
    inputPath: string,
    outputPath: string,
    dpi: number = 200,
    noise: number = 15,
    angle: number = 0.4
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'scanner_effect',
        '--input', inputPath,
        '--output', outputPath,
        '--dpi', String(dpi),
        '--noise', String(noise),
        '--angle', String(angle)
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '仿真扫描效果处理失败' }
    }
  }

  /**
   * 智能自动倾斜纠偏 (Auto Deskew)
   */
  async autoDeskew(
    inputPath: string,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'auto_deskew',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '自动纠偏处理失败' }
    }
  }

  /**
   * 自动检测并删除空白页 (Remove Blank Pages)
   */
  async removeBlankPages(
    inputPath: string,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; removedPages?: number[]; remainingPages?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'remove_blank_pages',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '空白页检测删除失败' }
    }
  }

  /**
   * 灰度化与暗黑模式反色 (Grayscale / Invert Colors)
   */
  async grayscaleOrInvert(
    inputPath: string,
    outputPath: string,
    mode: 'grayscale' | 'invert' = 'grayscale'
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'grayscale_invert',
        '--input', inputPath,
        '--output', outputPath,
        '--mode', mode
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '灰度/反色处理失败' }
    }
  }

  grayscaleInvert = this.grayscaleOrInvert

  /**
   * 双文档视觉高亮差异比对 (Compare PDFs)
   */
  async comparePDFs(
    inputPath1: string,
    inputPath2: string,
    outputPath: string,
    dpi: number = 150
  ): Promise<{ success: boolean; outputPath?: string; totalPages?: number; diffCount?: number; diffPages?: number[]; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'compare_documents',
        '--input', inputPath1,
        '--secondInput', inputPath2,
        '--output', outputPath,
        '--dpi', String(dpi)
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '双文档比对失败' }
    }
  }

  /**
   * PDF 转可编辑 Word (.docx)
   */
  async pdfToWord(inputPath: string, outputPath: string): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'pdf_to_word',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'PDF 转 Word 失败' }
    }
  }

  /**
   * 获取目录/大纲
   */
  async getPdfToc(inputPath: string): Promise<{ success: boolean; toc?: { level: number; title: string; page: number }[]; totalPages?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'get_toc',
        '--input', inputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '获取大纲目录失败' }
    }
  }

  /**
   * 写入/更新目录大纲
   */
  async setPdfToc(inputPath: string, outputPath: string, tocData: { level: number; title: string; page: number }[]): Promise<{ success: boolean; outputPath?: string; itemCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'set_toc',
        '--input', inputPath,
        '--output', outputPath,
        '--toc', JSON.stringify(tocData)
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '保存大纲目录失败' }
    }
  }

  /**
   * 按空白页自动切分文档
   */
  async splitByBlankPages(inputPath: string, outputDir: string): Promise<{ success: boolean; outputFiles?: string[]; partsCount?: number; blankPagesCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'split_by_blank_pages',
        '--input', inputPath,
        '--output', outputDir
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '按空白页拆分失败' }
    }
  }

  /**
   * 基于文字方向自动整页旋转回正
   */
  async autoRotate(inputPath: string, outputPath: string): Promise<{ success: boolean; outputPath?: string; rotatedPages?: number[]; count?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'auto_rotate',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '自动旋转纠偏失败' }
    }
  }

  /**
   * PDF 密码安全加密 (AES-256)
   */
  async encryptPDF(
    inputPath: string,
    options: EncryptionOptions,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'encrypt_pdf',
        '--input', inputPath,
        '--output', outputPath
      ]
      if (options.permissions) {
        args.push('--permissions', JSON.stringify(options.permissions))
      }

      // 密码通过环境变量传递，避免出现在进程命令行中
      const { stdout } = await execFileAsync(pythonBin, args, {
        encoding: 'utf-8',
        env: secretEnv({
          PDFOPEN_USER_PASSWORD: options.userPassword,
          PDFOPEN_OWNER_PASSWORD: options.ownerPassword
        })
      })
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '加密 PDF 失败' }
    }
  }

  /**
   * 移除/解密密码
   */
  async removePassword(inputPath: string, password: string, outputPath: string): Promise<{ success: boolean; outputPath?: string; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'remove_password',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8', env: secretEnv({ PDFOPEN_PASSWORD: password }) })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '移除密码失败' }
    }
  }

  /**
   * 嵌入附件文件
   */
  async addAttachment(inputPath: string, attachFile: string, outputPath: string): Promise<{ success: boolean; outputPath?: string; fileName?: string; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'add_attachment',
        '--input', inputPath,
        '--output', outputPath,
        '--attachFile', attachFile
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '嵌入附件失败' }
    }
  }

  /**
   * 提取所有附件文件
   */
  async extractAttachments(inputPath: string, outputDir: string): Promise<{ success: boolean; files?: string[]; count?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'extract_attachments',
        '--input', inputPath,
        '--output', outputDir
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '提取附件失败' }
    }
  }

  /** 通用的“输入 → 输出”侧车调用 */
  private async runSimpleAction<T extends { success: boolean; error?: string }>(
    action: string,
    inputPath: string,
    outputPath: string,
    extraArgs: string[],
    fallbackError: string
  ): Promise<T> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()
      const { stdout } = await execFileAsync(
        pythonBin,
        [scriptPath, '--action', action, '--input', inputPath, '--output', outputPath, ...extraArgs],
        { encoding: 'utf-8' }
      )
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || fallbackError } as T
    }
  }

  /** 中日韩等非拉丁文字水印（pdf-lib 标准字体无法绘制） */
  textWatermark(inputPath: string, outputPath: string, spec: Record<string, unknown>) {
    return this.runSimpleAction<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>(
      'text_watermark', inputPath, outputPath, ['--text', JSON.stringify(spec)], '添加水印失败'
    )
  }

  /** 按页写入页码 / 贝茨编号等短文本（支持中日韩文字） */
  stampPageTexts(inputPath: string, outputPath: string, spec: Record<string, unknown>) {
    return this.runSimpleAction<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>(
      'stamp_page_texts', inputPath, outputPath, ['--text', JSON.stringify(spec)], '写入页面文字失败'
    )
  }

  /** 真实压缩：图像降采样重编码 + 字体子集化 + 对象去重 */
  compressPdf(inputPath: string, outputPath: string, level: CompressLevel = 'medium'): Promise<CompressResult> {
    return this.runSimpleAction<CompressResult>('compress_pdf', inputPath, outputPath, ['--level', level], '压缩失败')
  }

  /** 结构修复：重建交叉引用表并重写对象 */
  repairPdf(inputPath: string, outputPath: string): Promise<RepairResult> {
    return this.runSimpleAction<RepairResult>('repair_pdf', inputPath, outputPath, [], '修复失败')
  }

  /** 隐私清理：元数据 / XMP / JavaScript / 附件 / 缩略图 / 自动动作 */
  sanitizePdf(inputPath: string, outputPath: string): Promise<SanitizeResult> {
    return this.runSimpleAction<SanitizeResult>('sanitize_pdf', inputPath, outputPath, [], '隐私清理失败')
  }

  /**
   * 验证数字签名
   */
  async validateSignatures(inputPath: string): Promise<SignatureValidationResult> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'validate_signatures',
        '--input', inputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '验证签名失败' }
    }
  }

  /**
   * 按条形码/二维码自动拆分多文档 (Split by Barcode / QR Code)
   */
  async splitByBarcode(inputPath: string, outputDir: string): Promise<{ success: boolean; outputFiles?: string[]; count?: number; barcodeCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'split_by_barcode',
        '--input', inputPath,
        '--output', outputDir
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '按条形码拆分失败' }
    }
  }

  /**
   * 基于 P12/PFX 证书的 PKCS#7 密码学数字签名 (Digital Signature)
   */
  async signPdfP12(
    inputPath: string,
    p12Path: string,
    password: string,
    outputPath: string,
    options?: SignP12Options
  ): Promise<SignP12Result> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'sign_p12',
        '--input', inputPath,
        '--output', outputPath,
        '--p12Path', p12Path
      ]

      if (options?.reason) {
        args.push('--reason', options.reason)
      }
      if (options?.location) {
        args.push('--location', options.location)
      }
      if (options?.tsaUrl) {
        args.push('--tsaUrl', options.tsaUrl)
      }
      if (options?.page) {
        args.push('--page', String(options.page))
      }
      if (options?.rect && options.rect.length === 4) {
        args.push('--rect', JSON.stringify(options.rect))
      }

      // 证书口令通过环境变量传递，避免出现在进程命令行中
      const { stdout } = await execFileAsync(pythonBin, args, {
        encoding: 'utf-8',
        env: secretEnv({ PDFOPEN_P12_PASSWORD: password })
      })
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'P12 证书签名执行失败' }
    }
  }

  /**
   * PDF/A 国际长期电子归档标准格式转换 (ISO 19005)
   */
  async convertToPdfA(
    inputPath: string,
    outputPath: string,
    conformance: string = '2b'
  ): Promise<PdfAResult> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'convert_to_pdfa',
        '--input', inputPath,
        '--output', outputPath,
        '--conformance', conformance
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'PDF/A 归档转换失败' }
    }
  }

  /**
   * 按书签/大纲章节拆分文档 (Split by Bookmarks / Outline)
   */
  async splitByBookmarks(
    inputPath: string,
    outputDir: string
  ): Promise<{ success: boolean; outputFiles?: { title: string; startPage: number; endPage: number; filePath: string }[]; count?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'split_by_bookmarks',
        '--input', inputPath,
        '--output', outputDir
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '按书签拆分失败' }
    }
  }

  /**
   * 纯文本 (.txt) 与 Markdown (.md) 转 PDF
   */
  async textOrMarkdownToPdf(
    inputPath: string,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'text_to_pdf',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '文本/Markdown 转 PDF 失败' }
    }
  }

  /**
   * CBZ / CBR 漫画包转 PDF (Comic to PDF)
   */
  async comicToPdf(
    comicPath: string,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'comic_to_pdf',
        '--input', comicPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '漫画转 PDF 失败' }
    }
  }

  /**
   * PDF 导出为独立 HTML 网页 (PDF to HTML)
   */
  async pdfToHtml(
    inputPath: string,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'pdf_to_html',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'PDF 转 HTML 失败' }
    }
  }

  /**
   * PDF 导出为高保真 PowerPoint (.pptx)
   */
  async pdfToPptx(
    inputPath: string,
    outputPath: string,
    dpi: number = 150
  ): Promise<{ success: boolean; outputPath?: string; slideCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'pdf_to_pptx',
        '--input', inputPath,
        '--output', outputPath,
        '--dpi', String(dpi)
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'PDF 转 PPTX 失败' }
    }
  }

  /**
   * Office 文档转 PDF (Word / Excel / PowerPoint to PDF)
   */
  async officeToPdf(
    inputPath: string,
    outputPath: string
  ): Promise<{ success: boolean; outputPath?: string; engine?: string; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'office_to_pdf',
        '--input', inputPath,
        '--output', outputPath
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'Office 转 PDF 失败' }
    }
  }

  /**
   * 全格式图片批量转标准 PDF (JPG, PNG, WebP, TIFF, GIF, BMP)
   */
  async imagesToPdf(
    imagePaths: string[],
    outputPath: string,
    pageSize: 'fit' | 'A4' = 'fit'
  ): Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const { stdout } = await execFileAsync(pythonBin, [
        scriptPath,
        '--action', 'images_to_pdf',
        '--images', JSON.stringify(imagePaths),
        '--output', outputPath,
        '--pageSize', pageSize
      ], { encoding: 'utf-8' })

      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || '全格式图片转 PDF 失败' }
    }
  }

  /**
   * PDF 逐页高保真渲染并导出为图片 (JPG, PNG, TIFF, WebP)
   */
  async pdfToImages(
    inputPath: string,
    outputDir: string,
    options?: { format?: 'png' | 'jpg' | 'webp' | 'tiff'; dpi?: number; pages?: number[] }
  ): Promise<{ success: boolean; outputFiles?: string[]; count?: number; outputDir?: string; format?: string; dpi?: number; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()

      const args = [
        scriptPath,
        '--action', 'pdf_to_images',
        '--input', inputPath,
        '--output', outputDir,
        '--format', options?.format || 'png',
        '--dpi', String(options?.dpi || 200)
      ]

      if (options?.pages && options.pages.length > 0) {
        args.push('--pages', options.pages.join(','))
      }

      const { stdout } = await execFileAsync(pythonBin, args, { encoding: 'utf-8' })
      return this.extractJsonFromStdout(stdout)
    } catch (err: any) {
      return { success: false, error: err.message || 'PDF 导出图片失败' }
    }
  }
}
