import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFService } from './services/pdfService'
import { PopplerService } from './services/popplerService'
import { SecurityService } from './services/securityService'
import { AIService } from './services/aiService'
import { PythonService, killAllPythonChildren } from './services/pythonService'
import { HotFolderService } from './services/hotFolderService'
import { htmlToPdfService } from './services/htmlToPdfService'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

const pdfService = new PDFService()
const popplerService = new PopplerService()
const securityService = new SecurityService()
const aiService = new AIService()
const pythonService = new PythonService()
const hotFolderService = new HotFolderService(pdfService, pythonService, popplerService)

// 日志大小轮转：超过 5MB 时先重命名为 .old（覆盖旧的 .old）再重新写入，避免无限增长
function appendWithRotation(logPath: string, content: string) {
  try {
    const st = fs.statSync(logPath)
    if (st.size > 5 * 1024 * 1024) {
      try { fs.rmSync(`${logPath}.old`, { force: true }) } catch {}
      fs.renameSync(logPath, `${logPath}.old`)
    }
  } catch {}
  fs.appendFileSync(logPath, content)
}

function logToFile(msg: string) {
  try {
    const logPath = path.join(app.getPath('userData'), 'app-startup.log')
    appendWithRotation(logPath, `[${new Date().toISOString()}] ${msg}\n`)
    try {
      const execDir = path.dirname(process.execPath)
      appendWithRotation(path.join(execDir, 'app-debug.log'), `[${new Date().toISOString()}] ${msg}\n`)
    } catch {}
  } catch {}
}

// 路径守卫：拒绝向敏感位置写入（Windows 系统目录、Program Files、启动项目录、相对路径）
// 正常的用户文档路径（保存对话框选择的目标）不受影响
function isPathAllowedForWrite(target: string): boolean {
  if (typeof target !== 'string' || !target || !path.isAbsolute(target)) return false
  const resolved = path.resolve(target).toLowerCase()
  if (process.platform === 'win32') {
    // Windows 系统目录（通常为 C:\Windows）
    const winDir = (process.env.SystemRoot || process.env.windir || 'C:\\Windows').toLowerCase()
    if (resolved === winDir || resolved.startsWith(winDir + path.sep)) return false
    // Program Files / Program Files (x86)
    for (const envKey of ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432']) {
      const dir = process.env[envKey]
      if (dir) {
        const d = path.resolve(dir).toLowerCase()
        if (resolved === d || resolved.startsWith(d + path.sep)) return false
      }
    }
    // 用户 AppData 下的启动项目录
    const startup = path
      .join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
      .toLowerCase()
    if (resolved === startup || resolved.startsWith(startup + path.sep)) return false
  } else {
    // 非 Windows 平台拦截常见系统目录
    for (const d of ['/usr', '/bin', '/sbin', '/boot', '/System', '/Library']) {
      if (resolved === d.toLowerCase() || resolved.startsWith(d.toLowerCase() + '/')) return false
    }
  }
  return true
}

// 已签发但未清理的临时 PDF 路径（file:getTempPdfPath 签发），退出/窗口全部关闭时统一清理
const issuedTempPaths = new Set<string>()

function cleanupIssuedTempFiles() {
  for (const p of issuedTempPaths) {
    try { fs.unlinkSync(p) } catch {}
  }
  issuedTempPaths.clear()
}

// 启动时清扫 temp 目录中本应用残留超过 24 小时的临时 PDF（pdfopen_* 及已知 prefix 模式）
function sweepStaleTempFiles() {
  try {
    const tempDir = app.getPath('temp')
    const pattern = /^(pdfopen|attachment|bates|compress|repair|overlay|imposition|numbered|rotated|watermark|effect|toc)_\d+_[a-z0-9]+\.pdf$/i
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    for (const name of fs.readdirSync(tempDir)) {
      if (!pattern.test(name)) continue
      const full = path.join(tempDir, name)
      try {
        const st = fs.statSync(full)
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full)
      } catch {}
    }
  } catch {}
}

// 校验 saveCurrentFile 的源路径：必须是已签发的临时工作副本，或真实存在的非敏感用户文档
function isAllowedTempSource(tempPath: string): boolean {
  if (typeof tempPath !== 'string' || !tempPath || !path.isAbsolute(tempPath)) return false
  if (!isPathAllowedForWrite(tempPath)) return false
  const resolved = path.resolve(tempPath)
  if (issuedTempPaths.has(resolved.toLowerCase())) return true
  // temp 目录下 pdfopen_ 前缀的文件（兼容未经 Set 记录的工作副本）
  const tempDir = path.resolve(app.getPath('temp')).toLowerCase()
  if (resolved.toLowerCase().startsWith(tempDir + path.sep) && path.basename(resolved).startsWith('pdfopen_')) return true
  // 正常用户文档路径（“另存为”的源文件）：必须是已存在的普通文件
  try {
    return fs.statSync(resolved).isFile()
  } catch {
    return false
  }
}

process.on('uncaughtException', (err) => {
  logToFile('Uncaught Exception: ' + (err?.stack || err))
})

process.on('unhandledRejection', (reason) => {
  logToFile('Unhandled Rejection: ' + (reason instanceof Error ? reason.stack : String(reason)))
})

function getPreloadPath(): string {
  const possiblePaths = [
    path.join(__dirname, '../preload/index.cjs'),
    path.join(__dirname, '../preload/index.js'),
    path.join(app.getAppPath(), 'dist-electron/preload/index.cjs'),
    path.join(app.getAppPath(), 'dist-electron/preload/index.js'),
    path.join(__dirname, '../preload/index.mjs')
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  return path.join(__dirname, '../preload/index.cjs')
}

function getHtmlPath(): string {
  const possiblePaths = [
    path.join(app.getAppPath(), 'dist/index.html'),
    path.join(__dirname, '../../dist/index.html'),
    path.join(__dirname, '../renderer/index.html')
  ]
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  return path.join(app.getAppPath(), 'dist/index.html')
}

function createWindow() {
  const preloadPath = getPreloadPath()
  const htmlPath = getHtmlPath()
  logToFile(`Creating window. Preload: ${preloadPath}, exists: ${fs.existsSync(preloadPath)}`)
  logToFile(`Html: ${htmlPath}, exists: ${fs.existsSync(htmlPath)}`)

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'PDFOpen Studio',
    titleBarStyle: 'hidden',
    // 与渲染进程 TitleBar（h-11 = 44px，背景 #0b1112）保持一致，避免窗口按钮区出现色块和高度错位
    backgroundColor: '#0b1112',
    titleBarOverlay: {
      color: '#0b1112',
      symbolColor: '#94a3b8',
      height: 44
    },
    show: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 安全加固：禁止渲染进程打开新窗口或跳转到应用以外的页面（外链交给系统浏览器）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    const isAppUrl = url.startsWith('file://') || (devUrl ? url.startsWith(devUrl) : false)
    if (!isAppUrl) event.preventDefault()
  })

  // 右键菜单：选中文字时可复制，输入框中提供剪切/复制/粘贴
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const zh = app.getLocale().toLowerCase().startsWith('zh')
    const items: Electron.MenuItemConstructorOptions[] = []
    if (params.isEditable) {
      items.push(
        { role: 'cut', label: zh ? '剪切' : 'Cut', enabled: params.editFlags.canCut },
        { role: 'copy', label: zh ? '复制' : 'Copy', enabled: params.editFlags.canCopy },
        { role: 'paste', label: zh ? '粘贴' : 'Paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: zh ? '全选' : 'Select all' }
      )
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy', label: zh ? '复制' : 'Copy' })
    }
    if (items.length && mainWindow) Menu.buildFromTemplate(items).popup({ window: mainWindow })
  })

  // 渲染进程在存在未保存修改时会阻止卸载（beforeunload），这里弹出原生确认框让用户决定
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    if (!mainWindow) return
    const zh = app.getLocale().toLowerCase().startsWith('zh')
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: zh ? ['放弃修改并退出', '取消'] : ['Discard changes and quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'PDFOpen Studio',
      message: zh ? '有文档包含未保存的修改' : 'Some documents have unsaved changes',
      detail: zh
        ? '退出后这些修改将会丢失。若要保留，请取消后按 Ctrl+S 保存。'
        : 'These changes will be lost if you quit. To keep them, cancel and press Ctrl+S.',
      noLink: true
    })
    // preventDefault 表示忽略 beforeunload 的阻止，继续关闭
    if (choice === 0) event.preventDefault()
  })

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    logToFile(`[Renderer Console lvl=${level}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    logToFile(`webContents did-fail-load: code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    logToFile('webContents did-finish-load event successfully fired')
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    logToFile(`webContents render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`)
  })

  mainWindow.on('ready-to-show', () => {
    logToFile('mainWindow ready-to-show')
    mainWindow?.show()
  })
  mainWindow.on('show', () => logToFile('mainWindow show'))
  mainWindow.on('close', () => logToFile('mainWindow close'))
  mainWindow.on('closed', () => {
    logToFile('mainWindow closed event fired')
    mainWindow = null
  })

  // 生产环境与开发环境加载
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch((err) => {
      logToFile('loadURL failed: ' + err)
    })
  } else {
    // 优先使用相对于 appPath 的标准相对路径
    mainWindow.loadFile('dist/index.html').catch((err) => {
      logToFile('loadFile dist/index.html failed: ' + err + ', retrying absolute path...')
      mainWindow?.loadFile(htmlPath).catch((err2) => {
        logToFile('loadFile absolute failed: ' + err2)
      })
    })
  }
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  logToFile('Another instance is already running. Quitting duplicate instance.')
  app.quit()
} else {
  app.on('second-instance', () => {
    logToFile('second-instance event: focusing mainWindow')
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    logToFile('app.whenReady resolved')
    // 启动时清扫 temp 目录中超过 24 小时的历史残留临时文件
    sweepStaleTempFiles()
    setupIpcHandlers()
    createWindow()

    app.on('activate', () => {
      logToFile('app activate event')
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('before-quit', () => {
  logToFile('app before-quit')
  // 退出时停止热文件夹定时器并终止仍在运行的 Python 子进程，避免后台残留
  try {
    hotFolderService.stop()
  } catch {}
  killAllPythonChildren()
  // 清理本次会话签发的所有临时 PDF 工作副本
  cleanupIssuedTempFiles()
})
app.on('will-quit', () => logToFile('app will-quit'))
app.on('quit', (_, exitCode) => logToFile(`app quit with exitCode: ${exitCode}`))

app.on('window-all-closed', () => {
  logToFile('window-all-closed event fired')
  // 所有窗口关闭后统一清理已签发的临时 PDF（忽略错误）
  cleanupIssuedTempFiles()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function setupIpcHandlers() {
  // 1. 文件选择与保存对话框
  ipcMain.handle('dialog:openFile', async (_, options) => {
    if (!mainWindow) return null
    const properties: ('openFile' | 'openDirectory' | 'multiSelections')[] = []
    if (options?.openDirectory) {
      properties.push('openDirectory')
    } else {
      properties.push('openFile')
      if (options?.multiSelections) {
        properties.push('multiSelections')
      }
    }
    const res = await dialog.showOpenDialog(mainWindow, {
      properties,
      filters: options?.filters || [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    return res.canceled ? null : res.filePaths
  })

  ipcMain.handle('dialog:saveFile', async (_, options) => {
    if (!mainWindow) return null
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'PDF Files', extensions: ['pdf'] }]
    })
    return res.canceled ? null : res.filePath
  })

  // 1.1 临时工作副本与文件写回支持
  ipcMain.handle('file:getTempPdfPath', async (_, prefix?: string) => {
    const tempDir = app.getPath('temp')
    const fileName = `${prefix || 'pdfopen_work'}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.pdf`
    const full = path.join(tempDir, fileName)
    // 记录已签发路径，退出或窗口全部关闭时统一清理
    issuedTempPaths.add(path.resolve(full).toLowerCase())
    return full
  })

  ipcMain.handle('file:saveCurrentFile', async (_, tempPath: string, targetPath: string) => {
    try {
      if (!isAllowedTempSource(tempPath)) return { success: false, error: '路径不被允许' }
      if (!isPathAllowedForWrite(targetPath)) return { success: false, error: '路径不被允许' }
      await fs.promises.copyFile(tempPath, targetPath)
      // 保存成功后不删除 tempPath：渲染层可能继续使用它作为工作副本，由退出/启动清扫统一回收
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '保存文件失败' }
    }
  })

  // pdf.js 字符映射 (CMap) 与标准字体：从本地读取，保证离线时中日韩等文档也能正确显示
  ipcMain.handle('pdfjs:asset', async (_, kind: string, name: string) => {
    if ((kind !== 'cmaps' && kind !== 'standard_fonts') || typeof name !== 'string' || !/^[\w.\-]+$/.test(name)) {
      throw new Error('非法的 pdf.js 资源请求')
    }
    const baseDir = app.isPackaged
      ? path.join(process.resourcesPath, 'pdfjs', kind)
      : path.join(app.getAppPath(), 'node_modules', 'pdfjs-dist', kind)
    return new Uint8Array(await fs.promises.readFile(path.join(baseDir, name)))
  })

  // 受限的系统目录查询（用于热文件夹等默认路径）
  ipcMain.handle('app:getPath', async (_, name: string) => {
    const allowed = ['documents', 'downloads', 'desktop', 'home'] as const
    if (!(allowed as readonly string[]).includes(name)) throw new Error('不支持的目录类型')
    return app.getPath(name as (typeof allowed)[number])
  })

  // 文件重命名（同目录内），用于“智能重命名”
  ipcMain.handle('file:rename', async (_, oldPath: string, newName: string) => {
    try {
      if (typeof oldPath !== 'string' || typeof newName !== 'string') throw new Error('参数无效')
      const cleanName = newName.trim()
      if (!cleanName || /[\\/:*?"<>|]/.test(cleanName) || cleanName === '.' || cleanName === '..') {
        throw new Error('文件名包含非法字符')
      }
      const finalName = /\.pdf$/i.test(cleanName) ? cleanName : `${cleanName}.pdf`
      const newPath = path.join(path.dirname(oldPath), finalName)
      // 路径守卫：禁止在敏感系统位置写入/重命名
      if (!isPathAllowedForWrite(newPath)) return { success: false, error: '路径不被允许' }
      if (path.resolve(newPath) === path.resolve(oldPath)) return { success: true, newPath }
      if (fs.existsSync(newPath)) throw new Error(`目标文件已存在: ${finalName}`)
      await fs.promises.rename(oldPath, newPath)
      return { success: true, newPath }
    } catch (err: any) {
      return { success: false, error: err.message || '重命名失败' }
    }
  })

  ipcMain.handle('shell:showItemInFolder', async (_, targetPath: string) => {
    if (typeof targetPath !== 'string' || !targetPath) return false
    try {
      const stat = await fs.promises.stat(targetPath)
      if (stat.isDirectory()) {
        await shell.openPath(targetPath)
      } else {
        shell.showItemInFolder(targetPath)
      }
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:writeText', async (_, targetPath: string, contents: string) => {
    try {
      // 路径守卫：拒绝向敏感系统位置写入
      if (!isPathAllowedForWrite(targetPath)) return { success: false, error: '路径不被允许' }
      await fs.promises.writeFile(targetPath, contents, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message || '保存文本文件失败' }
    }
  })

  // 2. 读取 PDF 文件
  ipcMain.handle('pdf:read', async (_, filePath: string) => {
    return await pdfService.getMetadata(filePath)
  })

  // 3. PDF 核心原子操作
  ipcMain.handle('pdf:merge', async (_, filePaths: string[], outputPath: string) => {
    return await pdfService.mergePDFs(filePaths, outputPath)
  })

  ipcMain.handle('pdf:split', async (_, filePath: string, ranges: any[], outputDir: string) => {
    return await pdfService.splitPDF(filePath, ranges, outputDir)
  })

  ipcMain.handle('pdf:rotate', async (_, filePath: string, pages: number[], angle: number, outputPath: string) => {
    return await pdfService.rotatePages(filePath, pages, angle, outputPath)
  })

  ipcMain.handle('pdf:extract', async (_, filePath: string, pages: number[], outputPath: string) => {
    return await pdfService.extractPages(filePath, pages, outputPath)
  })

  ipcMain.handle('pdf:deletePages', async (_, filePath: string, pages: number[], outputPath: string) => {
    return await pdfService.deletePages(filePath, pages, outputPath)
  })

  ipcMain.handle('pdf:reorder', async (_, filePath: string, newOrder: number[], outputPath: string) => {
    return await pdfService.reorderPages(filePath, newOrder, outputPath)
  })

  ipcMain.handle('pdf:insertBlankPage', async (_, filePath: string, targetIndex: number, width?: number, height?: number, outputPath?: string) => {
    return await pdfService.insertBlankPage(filePath, targetIndex, width, height, outputPath)
  })

  ipcMain.handle('pdf:watermark', async (_, filePath: string, options: any, outputPath: string) => {
    return await pdfService.addWatermark(filePath, options, outputPath)
  })

  ipcMain.handle('pdf:encrypt', async (_, filePath: string, options: any, outputPath: string) => {
    return await pdfService.encryptPDF(filePath, options, outputPath)
  })

  ipcMain.handle('pdf:bates', async (_, filePath: string, options: any, outputPath: string) => {
    return await pdfService.applyBatesNumbering(filePath, options, outputPath)
  })

  // 4. Poppler 工业级工具
  ipcMain.handle('poppler:extractText', async (_, filePath: string, options: any) => {
    return await popplerService.extractText(filePath, options)
  })

  ipcMain.handle('poppler:extractImages', async (_, filePath: string, outputDir: string) => {
    return await popplerService.extractImages(filePath, outputDir)
  })

  ipcMain.handle('poppler:getInfo', async (_, filePath: string) => {
    return await popplerService.getInfo(filePath)
  })

  // 5. 安全钥匙串
  ipcMain.handle('security:saveKey', async (_, service: string, key: string, value: string) => {
    return await securityService.saveSecureKey(service, key, value)
  })

  ipcMain.handle('security:getKey', async (_, service: string, key: string) => {
    return await securityService.getSecureKey(service, key)
  })

  // 6. AI 与 本地 Ollama 引擎
  ipcMain.handle('ai:checkOllama', async (_, baseUrl?: string) => {
    return await aiService.checkOllamaStatus(baseUrl)
  })

  ipcMain.handle('ai:callModel', async (_, config: any, messages: any[]) => {
    return await aiService.callModel(config, messages)
  })

  // 7. Python 智能侧车 (RapidOCR, 文字编辑, 物理脱敏, 批注, RAG)
  ipcMain.handle('python:checkEnv', async () => {
    return await pythonService.checkEnvironment()
  })

  ipcMain.handle('python:ocrSandwich', async (event, inputPath: string, outputPath: string, dpi?: number) => {
    // 将逐页进度实时推送给渲染进程（OCR 弹窗显示进度条）
    return await pythonService.ocrToSearchablePDF(inputPath, outputPath, dpi, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send('python:ocrProgress', progress)
    })
  })

  ipcMain.handle('python:extractTables', async (_, inputPath: string, outputPath: string, pages?: number[]) => {
    return await pythonService.extractTables(inputPath, outputPath, pages)
  })

  ipcMain.handle('python:getTextBlocks', async (_, inputPath: string, pageNum: number) => {
    return await pythonService.getTextBlocks(inputPath, pageNum)
  })

  ipcMain.handle('python:editText', async (_, inputPath: string, outputPath: string, pageNum: number, rect: number[], newText: string, fontSize?: number) => {
    return await pythonService.editText(inputPath, outputPath, pageNum, rect, newText, fontSize)
  })

  ipcMain.handle('python:redact', async (_, inputPath: string, outputPath: string, pageNum?: number, rects?: number[][], pattern?: string, fillColor?: number[]) => {
    return await pythonService.redact(inputPath, outputPath, pageNum, rects, pattern, fillColor)
  })

  ipcMain.handle('python:addAnnotation', async (_, inputPath: string, outputPath: string, pageNum: number, annotType: string, options: any) => {
    return await pythonService.addAnnotation(inputPath, outputPath, pageNum, annotType, options)
  })

  ipcMain.handle('python:queryRAG', async (_, inputPath: string, query: string) => {
    return await pythonService.queryRAG(inputPath, query)
  })

  // 8. 交互式表单 (AcroForms)
  ipcMain.handle('pdf:getFormFields', async (_, filePath: string) => {
    return await pdfService.getFormFields(filePath)
  })

  ipcMain.handle('pdf:fillFormFields', async (_, filePath: string, fieldValues: Record<string, string>, outputPath: string) => {
    return await pdfService.fillFormFields(filePath, fieldValues, outputPath)
  })

  ipcMain.handle('pdf:flattenForm', async (_, filePath: string, outputPath: string) => {
    return await pdfService.flattenForm(filePath, outputPath)
  })

  // 9. 文件夹热监听 (Hot Folder)
  ipcMain.handle('hotfolder:start', async (_, config: any) => {
    return await hotFolderService.start(config)
  })

  ipcMain.handle('hotfolder:stop', async () => {
    return hotFolderService.stop()
  })

  ipcMain.handle('hotfolder:getStatus', async () => {
    return hotFolderService.getStatus()
  })

  // 10. 页面拼版与高级组织 (Bento & Stirling)
  ipcMain.handle('pdf:nUp', async (_, filePath: string, n: 2 | 4 | 9, drawBorder: boolean, outputPath: string) => {
    return await pdfService.nUp(filePath, n, drawBorder, outputPath)
  })

  ipcMain.handle('pdf:posterize', async (_, filePath: string, pageNumber: number, rows: number, cols: number, outputPath: string) => {
    return await pdfService.posterize(filePath, pageNumber, rows, cols, outputPath)
  })

  ipcMain.handle('pdf:booklet', async (_, filePath: string, outputPath: string) => {
    return await pdfService.booklet(filePath, outputPath)
  })

  ipcMain.handle('pdf:sanitize', async (_, filePath: string, outputPath: string) => {
    // 优先使用 PyMuPDF 的彻底清理（JavaScript / 附件 / XMP / 缩略图 / 自动动作），侧车不可用时回退 pdf-lib
    const res = await pythonService.sanitizePdf(filePath, outputPath)
    if (res.success) return res
    const fallback = await pdfService.sanitize(filePath, outputPath)
    return fallback.success ? { ...fallback, message: '已使用基础模式清理（仅元数据），Python 侧车不可用' } : { ...fallback, error: res.error }
  })

  ipcMain.handle('pdf:updateMetadata', async (_, filePath: string, metadata: any, outputPath: string) => {
    return await pdfService.updateMetadata(filePath, metadata, outputPath)
  })

  ipcMain.handle('pdf:cropOrMargin', async (_, filePath: string, margins: any, mode: 'crop' | 'pad', outputPath: string) => {
    return await pdfService.cropOrMargin(filePath, margins, mode, outputPath)
  })

  ipcMain.handle('pdf:imagesToPDF', async (_, imagePaths: string[], pageSize: 'fit' | 'A4', outputPath: string) => {
    return await pdfService.imagesToPDF(imagePaths, pageSize, outputPath)
  })

  // 11. 图像增强与特效 (Python 侧车)
  ipcMain.handle('python:scannerEffect', async (_, inputPath: string, outputPath: string, dpi?: number, noise?: number, angle?: number) => {
    return await pythonService.scannerEffect(inputPath, outputPath, dpi, noise, angle)
  })

  ipcMain.handle('python:autoDeskew', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.autoDeskew(inputPath, outputPath)
  })

  ipcMain.handle('python:removeBlankPages', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.removeBlankPages(inputPath, outputPath)
  })

  ipcMain.handle('python:grayscaleInvert', async (_, inputPath: string, outputPath: string, mode?: 'grayscale' | 'invert') => {
    return await pythonService.grayscaleOrInvert(inputPath, outputPath, mode)
  })

  ipcMain.handle('python:comparePDFs', async (_, inputPath1: string, inputPath2: string, outputPath: string, dpi?: number) => {
    return await pythonService.comparePDFs(inputPath1, inputPath2, outputPath, dpi)
  })

  // 12. 高阶增量工具 (Stirling 完整矩阵对标)
  ipcMain.handle('pdf:compress', async (_, filePath: string, outputPath: string, level?: 'low' | 'medium' | 'high') => {
    // 真实压缩（图像降采样/重编码 + 字体子集化）；侧车不可用时回退为 pdf-lib 结构压缩
    const res = await pythonService.compressPdf(filePath, outputPath, level || 'medium')
    if (res.success) return res
    const fallback = await pdfService.compressPDF(filePath, outputPath)
    return fallback.success ? { ...fallback, message: '已使用基础模式压缩（未处理图像），Python 侧车不可用' } : { ...fallback, error: res.error }
  })

  ipcMain.handle('pdf:repair', async (_, filePath: string, outputPath: string) => {
    const res = await pythonService.repairPdf(filePath, outputPath)
    if (res.success) return res
    const fallback = await pdfService.repairPDF(filePath, outputPath)
    return fallback.success ? fallback : { ...fallback, error: res.error }
  })

  ipcMain.handle('pdf:overlay', async (_, foregroundPath: string, backgroundPath: string, outputPath: string) => {
    return await pdfService.overlayPDF(foregroundPath, backgroundPath, outputPath)
  })

  ipcMain.handle('pdf:addPageNumbers', async (_, filePath: string, options: any, outputPath: string) => {
    return await pdfService.addPageNumbers(filePath, options, outputPath)
  })

  ipcMain.handle('pdf:toSingleContinuousPage', async (_, filePath: string, outputPath: string) => {
    return await pdfService.toSingleContinuousPage(filePath, outputPath)
  })

  ipcMain.handle('pdf:removeAnnotations', async (_, filePath: string, outputPath: string) => {
    return await pdfService.removeAnnotations(filePath, outputPath)
  })

  ipcMain.handle('pdf:removeImages', async (_, filePath: string, outputPath: string) => {
    return await pdfService.removeImages(filePath, outputPath)
  })

  ipcMain.handle('pdf:addStampOrSignature', async (_, filePath: string, imagePath: string, options: any, outputPath: string) => {
    return await pdfService.addStampOrSignature(filePath, imagePath, options, outputPath)
  })

  ipcMain.handle('pdf:autoRename', async (_, filePath: string) => {
    return await pdfService.autoRename(filePath)
  })

  // 13. 全量高级特性 (Word互转、TOC目录编辑、空白页拆分、自动整页旋转、网页转PDF、解密、附件、签名校验)
  ipcMain.handle('pdf:toWord', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.pdfToWord(inputPath, outputPath)
  })

  ipcMain.handle('pdf:getToc', async (_, inputPath: string) => {
    return await pythonService.getPdfToc(inputPath)
  })

  ipcMain.handle('pdf:setToc', async (_, inputPath: string, outputPath: string, tocData: any[]) => {
    return await pythonService.setPdfToc(inputPath, outputPath, tocData)
  })

  ipcMain.handle('pdf:splitByBlankPages', async (_, inputPath: string, outputDir: string) => {
    return await pythonService.splitByBlankPages(inputPath, outputDir)
  })

  ipcMain.handle('pdf:autoRotate', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.autoRotate(inputPath, outputPath)
  })

  ipcMain.handle('pdf:removePassword', async (_, inputPath: string, password: string, outputPath: string) => {
    return await pythonService.removePassword(inputPath, password, outputPath)
  })

  ipcMain.handle('pdf:addAttachment', async (_, inputPath: string, attachFile: string, outputPath: string) => {
    return await pythonService.addAttachment(inputPath, attachFile, outputPath)
  })

  ipcMain.handle('pdf:extractAttachments', async (_, inputPath: string, outputDir: string) => {
    return await pythonService.extractAttachments(inputPath, outputDir)
  })

  ipcMain.handle('pdf:validateSignatures', async (_, inputPath: string) => {
    return await pythonService.validateSignatures(inputPath)
  })

  ipcMain.handle('pdf:htmlToPdf', async (_, source: any, outputPath: string, options: any) => {
    return await htmlToPdfService.convertUrlOrHtmlToPdf(source, outputPath, options)
  })

  // 14. 旗舰级自研扩展 (条码切分、P12数字签名、PDF/A归档、表单设计器)
  ipcMain.handle('pdf:splitByBarcode', async (_, inputPath: string, outputDir: string) => {
    return await pythonService.splitByBarcode(inputPath, outputDir)
  })

  ipcMain.handle('pdf:signP12', async (_, inputPath: string, p12Path: string, password: string, outputPath: string, options?: any) => {
    return await pythonService.signPdfP12(inputPath, p12Path, password, outputPath, options)
  })

  ipcMain.handle('pdf:convertToPdfA', async (_, inputPath: string, outputPath: string, conformance?: string) => {
    return await pythonService.convertToPdfA(inputPath, outputPath, conformance)
  })

  ipcMain.handle('pdf:addFormFields', async (_, filePath: string, fields: any[], outputPath: string) => {
    return await pdfService.addFormFields(filePath, fields, outputPath)
  })

  // 15. Stirling-PDF 全满贯拓展 (按大小/书签拆分、画幅缩放、Markdown/文本/漫画/Office转PDF、PDF转HTML/PPTX)
  ipcMain.handle('pdf:splitBySize', async (_, filePath: string, maxSizeMB: number, outputDir: string) => {
    return await pdfService.splitBySize(filePath, maxSizeMB, outputDir)
  })

  ipcMain.handle('pdf:scalePageSize', async (_, filePath: string, targetStandard: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal', outputPath: string) => {
    return await pdfService.scalePageSize(filePath, targetStandard, outputPath)
  })

  ipcMain.handle('pdf:splitByBookmarks', async (_, inputPath: string, outputDir: string) => {
    return await pythonService.splitByBookmarks(inputPath, outputDir)
  })

  ipcMain.handle('pdf:textOrMarkdownToPdf', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.textOrMarkdownToPdf(inputPath, outputPath)
  })

  ipcMain.handle('pdf:comicToPdf', async (_, comicPath: string, outputPath: string) => {
    return await pythonService.comicToPdf(comicPath, outputPath)
  })

  ipcMain.handle('pdf:pdfToHtml', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.pdfToHtml(inputPath, outputPath)
  })

  ipcMain.handle('pdf:pdfToPptx', async (_, inputPath: string, outputPath: string, dpi?: number) => {
    return await pythonService.pdfToPptx(inputPath, outputPath, dpi)
  })

  ipcMain.handle('pdf:officeToPdf', async (_, inputPath: string, outputPath: string) => {
    return await pythonService.officeToPdf(inputPath, outputPath)
  })

  ipcMain.handle('pdf:toImages', async (_, inputPath: string, outputDir: string, options?: any) => {
    return await pythonService.pdfToImages(inputPath, outputDir, options)
  })
}
