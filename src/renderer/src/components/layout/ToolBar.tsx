import React, { useState, useEffect, useRef } from 'react'
import { useDocumentStore, cleanIpcError } from '../../stores/useDocumentStore'
import { toast, useToastStore } from '../../stores/useToastStore'
import { useAIStore } from '../../stores/useAIStore'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'
import {
  FolderOpen,
  Save,
  Download,
  Layers,
  Scissors,
  RotateCw,
  Stamp,
  Hash,
  FileCode,
  Image as ImageIcon,
  Info,
  ScanText,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Bot,
  Workflow,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  CheckSquare,
  FolderSync,
  LayoutGrid,
  FileDown,
  FileImage,
  ListTree,
  FileSignature,
  GitCompare,
  ChevronDown,
  Lock,
  Unlock,
  Printer,
  Scaling,
  Crop,
  FileMinus,
  Contrast,
  Minimize2,
  ShieldCheck,
  FileArchive,
  BookOpen,
  Compass,
  MoveHorizontal,
  Maximize,
  Undo2,
  Redo2,
  Search
} from 'lucide-react'

export const ToolBar: React.FC = () => {
  const { t, i18n } = useTranslation()
  const tr = useTr()
  const {
    tabs,
    activeTabId,
    openDocument,
    setCurrentPage,
    setScale,
    setRotation,
    showSidebar,
    toggleSidebar,
    setActiveDialog,
    saveCurrentDocument,
    saveCurrentDocumentAs,
    undo,
    redo
  } = useDocumentStore()

  const { toggleOpen: toggleAI, isOpen: isAIOpen, isOllamaOnline } = useAIStore()
  const { toggleOpen: toggleWorkflow, isOpen: isWorkflowOpen } = useWorkflowStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuContainerRef = useRef<HTMLDivElement>(null)

  // 全局点击菜单外部关闭下拉
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Esc 关闭下拉菜单
  useEffect(() => {
    if (!openMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpenMenu(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [openMenu])

  // 全局快捷键：Ctrl+S 保存 / Ctrl+Shift+S 另存为 / Ctrl+O 打开 / Ctrl+W 关闭标签 / Ctrl+Tab 切换标签
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const target = e.target as HTMLElement | null
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      // 撤销 / 重做：输入框内保留系统默认行为，弹窗打开时不处理
      if (mod && (key === 'z' || key === 'y') && !inField && useDocumentStore.getState().activeDialog === 'none') {
        e.preventDefault()
        if (key === 'y' || (key === 'z' && e.shiftKey)) void useDocumentStore.getState().redo()
        else void useDocumentStore.getState().undo()
        return
      }
      if (mod && key === 's' && e.shiftKey) {
        e.preventDefault()
        if (activeTab) void saveCurrentDocumentAs()
      } else if (mod && key === 's') {
        e.preventDefault()
        if (activeTab) void handleSave()
      } else if (mod && key === 'w') {
        e.preventDefault()
        if (activeTab) useDocumentStore.getState().closeTab(activeTab.id)
      } else if (mod && e.key === 'Tab') {
        e.preventDefault()
        const { tabs: allTabs, activeTabId: currentId, setActiveTab } = useDocumentStore.getState()
        if (allTabs.length > 1) {
          const idx = allTabs.findIndex((t) => t.id === currentId)
          const next = (idx + (e.shiftKey ? -1 : 1) + allTabs.length) % allTabs.length
          setActiveTab(allTabs[next].id)
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void (async () => {
          const paths = await window.electronAPI.openFileDialog()
          if (paths?.length) await openDocument(paths[0])
        })()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, openDocument, saveCurrentDocument, saveCurrentDocumentAs])

  const handleOpen = async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths && paths.length > 0) {
      await openDocument(paths[0])
    }
  }

  const handleSave = async () => {
    if (!activeTab) return
    // 保存结果由 store 内的 toast 统一反馈
    const success = await saveCurrentDocument()
    if (!success) {
      // 若原路径不可覆盖（只读、被占用），触发另存为
      await saveCurrentDocumentAs()
    }
  }

  const handlePdfToWord = async () => {
    let input = activeTab ? activeTab.filePath : ''
    if (!input) {
      const paths = await window.electronAPI.openFileDialog({
        multiSelections: false,
        filters: [{ name: tr('PDF 文档', 'PDF documents'), extensions: ['pdf'] }]
      })
      if (paths && paths.length > 0) input = paths[0]
      else return
    }
    const defaultOut = input.replace(/\.pdf$/i, '.docx')
    const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
    if (!savePath) return

    const pending = toast.info(tr('正在转换为 Word…', 'Converting to Word…'), tr('大文件可能需要几十秒', 'Large files may take a minute'))
    try {
      const res = await window.electronAPI.pdfToWord(input, savePath)
      if (res.success && res.outputPath) {
        toast.success(tr('已导出 Word 文档', 'Word document exported'), res.outputPath, res.outputPath)
      } else {
        toast.error(tr('转 Word 失败', 'Word conversion failed'), res.error)
      }
    } catch (e: any) {
      toast.error(tr('转 Word 失败', 'Word conversion failed'), cleanIpcError(e))
    } finally {
      useToastStore.getState().dismiss(pending)
    }
  }

  // 适合宽度 / 适合页面：根据视口尺寸与当前渲染尺寸反推缩放比例
  const fitTo = (mode: 'width' | 'page') => {
    if (!activeTab) return
    const container = document.querySelector<HTMLElement>('[data-pdf-viewport]')
    const canvas = container?.querySelector('canvas')
    if (!container || !canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const baseW = rect.width / activeTab.scale
    const baseH = rect.height / activeTab.scale
    const availW = container.clientWidth - 64 // 与 px-8 内边距一致
    const availH = container.clientHeight - 104 // pt-16 + pb-10
    const next = mode === 'width' ? availW / baseW : Math.min(availW / baseW, availH / baseH)
    setScale(Math.round(next * 100) / 100)
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')
  }

  const handleMenuAction = (action: () => void) => {
    action()
    setOpenMenu(null)
  }

  return (
    <div
      ref={menuContainerRef}
      className="min-h-14 h-auto bg-slate-900/95 border-b border-slate-800/90 px-4 py-1 flex items-center justify-between gap-3 select-none shadow-[0_8px_24px_-18px_rgba(0,0,0,0.9)] text-xs relative z-30"
    >
      {/* 左侧：文件操作与分类菜单 */}
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1 gap-y-1">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          title={showSidebar ? tr('折叠侧边栏', 'Hide sidebar') : tr('展开侧边栏', 'Show sidebar')}
        >
          {showSidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* 打开 */}
        <button
          onClick={handleOpen}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 transition-colors font-medium"
          title={tr('打开 PDF 文件 (Ctrl+O)', 'Open PDF file (Ctrl+O)')}
        >
          <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="hidden xl:inline">{t('toolbar.open')}</span>
        </button>

        {/* 原地保存 (Ctrl+S) */}
        <button
          disabled={!activeTab}
          onClick={handleSave}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all font-medium disabled:opacity-30 ${
            activeTab?.isModified
              ? 'bg-brand-500/10 text-brand-200 border border-brand-400/30 hover:bg-brand-500/15'
              : 'hover:bg-slate-800 text-slate-300'
          }`}
          title={
            activeTab?.isModified
              ? tr('有未保存的修改 (Ctrl+S)', 'Unsaved changes (Ctrl+S)')
              : tr('保存当前文档 (Ctrl+S)', 'Save document (Ctrl+S)')
          }
        >
          <Save className={`w-4 h-4 shrink-0 ${activeTab?.isModified ? 'text-brand-300' : 'text-slate-400'}`} />
          <span className="hidden xl:inline">{tr('保存', 'Save')}</span>
          {activeTab?.isModified && (
            <span className="w-1.5 h-1.5 rounded-full bg-brand-300 inline-block" />
          )}
        </button>

        {/* 另存为 */}
        <button
          disabled={!activeTab}
          onClick={saveCurrentDocumentAs}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors font-medium"
          title={tr('另存为新文件... (Ctrl+Shift+S)', 'Save as new file... (Ctrl+Shift+S)')}
        >
          <Download className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="hidden xl:inline">{tr('另存为', 'Save As')}</span>
        </button>

        {/* 撤销 / 重做 */}
        <button
          disabled={!activeTab || activeTab.historyIndex <= 0}
          onClick={() => void undo()}
          className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
          title={tr('撤销 (Ctrl+Z)', 'Undo (Ctrl+Z)')}
          aria-label={tr('撤销', 'Undo')}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          disabled={!activeTab || activeTab.historyIndex >= activeTab.history.length - 1}
          onClick={() => void redo()}
          className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
          title={tr('重做 (Ctrl+Y)', 'Redo (Ctrl+Y)')}
          aria-label={tr('重做', 'Redo')}
        >
          <Redo2 className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1" />

        {/* 分类下拉菜单 1：页面排版 */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'pages' ? null : 'pages')}
            onMouseEnter={() => openMenu && openMenu !== 'pages' && setOpenMenu('pages')}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'pages'}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
              openMenu === 'pages' ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>{tr('页面排版', 'Pages')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'pages' && (
            <div className="absolute left-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 p-1.5 flex flex-col space-y-0.5 animate-in fade-in slide-in-from-top-2 z-50 backdrop-blur-md" role="menu">
              <button
                onClick={() => handleMenuAction(() => setActiveDialog('merge'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200 transition-colors"
              >
                <Layers className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('多文件合并', 'Merge PDFs')}</div>
                  <div className="text-[10px] text-slate-400">{tr('将多个文档按自定义顺序拼装', 'Combine multiple documents in a custom order')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('split'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Scissors className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('页面拆分', 'Split PDF')}</div>
                  <div className="text-[10px] text-slate-400">{tr('单页、区间、条形码或固定大小拆分', 'Split by page, range, barcode or fixed size')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('rotate'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <RotateCw className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('旋转页面', 'Rotate pages')}</div>
                  <div className="text-[10px] text-slate-400">{tr('90° / 180° / 270° 顺逆时针永久旋转', 'Rotate 90° / 180° / 270° clockwise or counter-clockwise')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('nup'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <LayoutGrid className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('多合一拼版', 'N-Up layout')}</div>
                  <div className="text-[10px] text-slate-400">{tr('2、4、9 页缩印拼版在单张纸上', 'Print 2, 4 or 9 pages on one sheet')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('crop'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Crop className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('裁剪与调整边距', 'Crop & margins')}</div>
                  <div className="text-[10px] text-slate-400">{tr('裁剪扫描黑边或四周增加装订留白', 'Trim scan borders or add binding margins')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('removeBlank'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <FileMinus className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('检测并删除空白页', 'Remove blank pages')}</div>
                  <div className="text-[10px] text-slate-400">{tr('一键剔除整本文档中所有纯白页', 'Detect and remove blank pages across the document')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('deskew'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Compass className="w-4 h-4 text-teal-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('倾斜自动校准', 'Deskew')}</div>
                  <div className="text-[10px] text-slate-400">{tr('自动检测歪斜扫描角并回正为水平', 'Detect and straighten skewed scans')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('toc'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <ListTree className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('大纲书签目录编辑器', 'Bookmark / TOC editor')}</div>
                  <div className="text-[10px] text-slate-400">{tr('可视化树状增删改层级大纲目录', 'Add, edit and reorder outline entries in a tree')}</div>
                </div>
              </button>
              {!activeTab && (
                <div className="mt-1 px-3 pt-1.5 pb-0.5 border-t border-slate-800 text-[10px] text-slate-500">{tr('灰色项需要先打开一份 PDF 文档', 'Greyed-out items require an open PDF')}</div>
              )}
            </div>
          )}
        </div>

        {/* 分类下拉菜单 2：格式转换 */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'convert' ? null : 'convert')}
            onMouseEnter={() => openMenu && openMenu !== 'convert' && setOpenMenu('convert')}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'convert'}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
              openMenu === 'convert' ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <FileDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{tr('格式互转', 'Convert')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'convert' && (
            <div className="absolute left-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 p-1.5 flex flex-col space-y-0.5 animate-in fade-in slide-in-from-top-2 z-50 backdrop-blur-md" role="menu">
              <button
                onClick={() => handleMenuAction(handlePdfToWord)}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200 transition-colors"
              >
                <FileDown className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('PDF 转 Microsoft Word', 'PDF to Microsoft Word')}</div>
                  <div className="text-[10px] text-slate-400">{tr('保留版面重排导出为 .docx', 'Export to .docx with layout preserved')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('pdfToImage'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <FileImage className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('PDF 转图片', 'PDF to images')}</div>
                  <div className="text-[10px] text-slate-400">{tr('逐页导出为 PNG、JPG、WebP、TIFF', 'Export each page as PNG, JPG, WebP or TIFF')}</div>
                </div>
              </button>

              <button
                onClick={() => handleMenuAction(() => setActiveDialog('imagesToPdf'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('图片批量转 PDF', 'Images to PDF')}</div>
                  <div className="text-[10px] text-slate-400">{tr('多张 JPG、PNG 合并为标准 PDF', 'Combine JPG / PNG images into one PDF')}</div>
                </div>
              </button>

              <button
                onClick={() => handleMenuAction(() => setActiveDialog('htmlToPdf'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200 transition-colors"
              >
                <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('网页与 HTML 转 PDF', 'Web page / HTML to PDF')}</div>
                  <div className="text-[10px] text-slate-400">{tr('输入网址或上传 HTML 文件导出', 'Enter a URL or choose an HTML file')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('popplerText'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <FileCode className="w-4 h-4 text-teal-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('版面保留纯文本提取', 'Layout-preserving text extraction')}</div>
                  <div className="text-[10px] text-slate-400">{tr('Poppler 原生多栏文本抽取', 'Multi-column text extraction with Poppler')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('popplerImages'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <ImageIcon className="w-4 h-4 text-orange-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('无损抽取内嵌图像', 'Extract embedded images')}</div>
                  <div className="text-[10px] text-slate-400">{tr('直接抽取二进制流中原始图片', 'Extract original images losslessly')}</div>
                </div>
              </button>
              {!activeTab && (
                <div className="mt-1 px-3 pt-1.5 pb-0.5 border-t border-slate-800 text-[10px] text-slate-500">{tr('灰色项需要先打开一份 PDF 文档', 'Greyed-out items require an open PDF')}</div>
              )}
            </div>
          )}
        </div>

        {/* 分类下拉菜单 3：安全与签署 */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'security' ? null : 'security')}
            onMouseEnter={() => openMenu && openMenu !== 'security' && setOpenMenu('security')}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'security'}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
              openMenu === 'security' ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>{tr('安全与签署', 'Security & Signing')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'security' && (
            <div className="absolute left-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 p-1.5 flex flex-col space-y-0.5 animate-in fade-in slide-in-from-top-2 z-50 backdrop-blur-md" role="menu">
              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('digitalSign'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <FileSignature className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('数字证书签名', 'Digital signature (P12)')}</div>
                  <div className="text-[10px] text-slate-400">{tr('基于 P12/PFX 证书添加电子签名', 'Sign with a P12/PFX certificate')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('redact'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('内容脱敏', 'Redact')}</div>
                  <div className="text-[10px] text-slate-400">{tr('框选或按关键词不可逆地抹除敏感内容', 'Permanently remove content by area or keyword')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('watermark'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Stamp className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('添加水印', 'Watermark')}</div>
                  <div className="text-[10px] text-slate-400">{tr('平铺或居中加盖半透明水印', 'Add tiled or centered translucent watermarks')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('pageNumbers'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Hash className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('页眉页脚与页码', 'Headers, footers & page numbers')}</div>
                  <div className="text-[10px] text-slate-400">{tr('在页面四角或居中添加连续页码', 'Add sequential page numbers at any corner or center')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('bates'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Hash className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('贝茨编号', 'Bates numbering')}</div>
                  <div className="text-[10px] text-slate-400">{tr('添加形如 CONF-000001 的诉讼流水号', 'Stamp legal IDs like CONF-000001')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('sanitize'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('隐私与元数据清理', 'Sanitize metadata')}</div>
                  <div className="text-[10px] text-slate-400">{tr('清理作者、单位、历史版本及 XML 隐藏标签', 'Remove author, organization, revision history and hidden XML')}</div>
                </div>
              </button>
              {!activeTab && (
                <div className="mt-1 px-3 pt-1.5 pb-0.5 border-t border-slate-800 text-[10px] text-slate-500">{tr('灰色项需要先打开一份 PDF 文档', 'Greyed-out items require an open PDF')}</div>
              )}
            </div>
          )}
        </div>

        {/* 分类下拉菜单 4：智能与高级 */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'advanced' ? null : 'advanced')}
            onMouseEnter={() => openMenu && openMenu !== 'advanced' && setOpenMenu('advanced')}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'advanced'}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
              openMenu === 'advanced' ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <ScanText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>{tr('智能与高级', 'Advanced')}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'advanced' && (
            <div className="absolute left-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl shadow-black/50 p-1.5 flex flex-col space-y-0.5 animate-in fade-in slide-in-from-top-2 z-50 backdrop-blur-md" role="menu">
              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('ocr'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <ScanText className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('双层可搜索 OCR', 'Searchable OCR (sandwich)')}</div>
                  <div className="text-[10px] text-slate-400">{tr('识别扫描件，生成外观不变、可选中文字的 PDF', 'Make scans searchable while keeping their original look')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('tableExtract'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('表格提取', 'Table extraction (Excel)')}</div>
                  <div className="text-[10px] text-slate-400">{tr('抽取复杂结构化表格并导出为 .csv/.xlsx', 'Extract tables and export to .csv / .xlsx')}</div>
                </div>
              </button>

              <button
                onClick={() => handleMenuAction(() => setActiveDialog('compare'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200 transition-colors"
              >
                <GitCompare className="w-4 h-4 text-teal-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('双文档视觉差异比对', 'Compare documents')}</div>
                  <div className="text-[10px] text-slate-400">{tr('并排比对两份文件，自动标红修改区域', 'Side-by-side comparison with changes highlighted')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('scanner'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Printer className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('仿扫描件效果', 'Scanned look')}</div>
                  <div className="text-[10px] text-slate-400">{tr('添加轻微倾斜、复印噪点与泛黄质感', 'Add skew, photocopy noise and paper tint')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('grayscale'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Contrast className="w-4 h-4 text-slate-300 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('黑白灰度化 / 暗黑模式', 'Grayscale / dark mode')}</div>
                  <div className="text-[10px] text-slate-400">{tr('节省打印耗材或高对比度反转利于夜读', 'Save toner, or invert colors for night reading')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('compressRepair'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <Minimize2 className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('体积压缩与损坏修复', 'Compress & repair')}</div>
                  <div className="text-[10px] text-slate-400">{tr('降采样图像瘦身与修复损坏 XRef 表', 'Downsample images and repair broken XRef tables')}</div>
                </div>
              </button>

              <button
                disabled={!activeTab}
                onClick={() => handleMenuAction(() => setActiveDialog('form'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-left text-slate-200 transition-colors"
              >
                <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('交互式表单识别与展平', 'Forms: fill & flatten')}</div>
                  <div className="text-[10px] text-slate-400">{tr('填写输入框或将表单展平为静态页面', 'Fill form fields or flatten them into static content')}</div>
                </div>
              </button>

              <button
                onClick={() => handleMenuAction(() => setActiveDialog('hotfolder'))}
                className="flex items-center space-x-2.5 px-3 py-2 rounded-lg hover:bg-slate-800 text-left text-slate-200 transition-colors"
              >
                <FolderSync className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="font-medium text-xs">{tr('热文件夹监听', 'Hot folder')}</div>
                  <div className="text-[10px] text-slate-400">{tr('自动检测目录新文件并执行自动化流水线', 'Watch a folder and run a pipeline on new files')}</div>
                </div>
              </button>
              {!activeTab && (
                <div className="mt-1 px-3 pt-1.5 pb-0.5 border-t border-slate-800 text-[10px] text-slate-500">{tr('灰色项需要先打开一份 PDF 文档', 'Greyed-out items require an open PDF')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 中间：视图导航与页面跳转（仅在打开文档时展示） */}
      {activeTab && (
        <div className="flex items-center space-x-2 bg-slate-950/70 px-3 py-1 rounded-xl border border-slate-800 shadow-inner shrink-0">
          <button
            onClick={() => setCurrentPage(activeTab.currentPage - 1)}
            disabled={activeTab.currentPage <= 1}
            className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
            title={tr('上一页', 'Previous page')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center space-x-1 text-slate-300 font-mono text-xs">
            <input
              type="number"
              min={1}
              max={activeTab.pageCount}
              value={activeTab.currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val)) setCurrentPage(val)
              }}
              className="w-10 bg-slate-800 border border-slate-700 rounded-md px-1 py-0.5 text-center text-slate-100 text-xs focus:outline-none focus:border-brand-500 font-mono"
            />
            <span className="text-slate-500">/</span>
            <span>{activeTab.pageCount}</span>
          </div>

          <button
            onClick={() => setCurrentPage(activeTab.currentPage + 1)}
            disabled={activeTab.currentPage >= activeTab.pageCount}
            className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition-colors"
            title={tr('下一页', 'Next page')}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px bg-slate-800 mx-1" />

          {/* 顺时针旋转预览 */}
          <button
            onClick={() => setRotation((r) => r + 90)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
            title={tr('顺时针旋转视图 90°', 'Rotate view 90° clockwise')}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px bg-slate-800 mx-1" />

          {/* 缩放控制器 */}
          <button
            onClick={() => setScale((s) => s - 0.15)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
            title={tr('缩小 (Ctrl + - / Ctrl + 滚轮)', 'Zoom out (Ctrl + - / Ctrl + wheel)')}
            aria-label={tr('缩小', 'Zoom out')}
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setScale(1.0)}
            className="text-slate-300 hover:text-white font-mono text-xs min-w-[42px] text-center hover:bg-slate-800 px-1 py-0.5 rounded transition-colors"
            title={tr('重置为 100% 原始比例', 'Reset to 100%')}
          >
            {Math.round(activeTab.scale * 100)}%
          </button>

          <button
            onClick={() => setScale((s) => s + 0.15)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
            title={tr('放大 (Ctrl + = / Ctrl + 滚轮)', 'Zoom in (Ctrl + = / Ctrl + wheel)')}
            aria-label={tr('放大', 'Zoom in')}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => fitTo('width')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
            title={tr('适合宽度', 'Fit width')}
            aria-label={tr('适合宽度', 'Fit width')}
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => fitTo('page')}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
            title={tr('适合整页', 'Fit page')}
            aria-label={tr('适合整页', 'Fit page')}
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px bg-slate-800 mx-1" />

          {/* 搜索：复用阅读器中 Ctrl+F 的处理逻辑 */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 transition-colors"
            title={tr('在文档中搜索 (Ctrl+F)', 'Search in document (Ctrl+F)')}
            aria-label={tr('搜索', 'Search')}
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 右侧：标杆矩阵直达、AI 智能体与工作流 */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Bento & Stirling 全能工具箱矩阵入口 */}
        <button
          onClick={() => setActiveDialog('toolbox')}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-medium shadow-md shadow-indigo-600/30 transition-all border border-indigo-400/40 hover:scale-[1.02] active:scale-95"
          title={tr('打开工具箱（53+ 款工具，涵盖 Stirling-PDF 与 BentoPDF 功能）', 'Open toolbox (53+ tools covering Stirling-PDF and BentoPDF features)')}
        >
          <LayoutGrid className="w-3.5 h-3.5 text-amber-300" />
          <span className="hidden xl:inline">{tr('工具箱', 'Toolbox')}</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-amber-400/30 text-amber-200 rounded font-bold shadow-sm">
            53+
          </span>
        </button>

        {/* 工作流画布 */}
        <button
          onClick={toggleWorkflow}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all shadow-sm ${
            isWorkflowOpen
              ? 'bg-purple-600 text-white font-medium ring-2 ring-purple-400/40'
              : 'bg-slate-800 text-purple-300 hover:bg-slate-700 border border-purple-900/60'
          }`}
          title={tr('打开可视化节点工作流编排画布', 'Open the visual workflow canvas')}
        >
          <Workflow className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden xl:inline">{tr('工作流', 'Workflow')}</span>
        </button>

        {/* 本地 AI 智能体 */}
        <button
          onClick={toggleAI}
          className={`relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all shadow-sm ${
            isAIOpen
              ? 'bg-brand-600 text-white font-medium ring-2 ring-brand-400/40'
              : 'bg-slate-800 text-brand-300 hover:bg-slate-700 border border-brand-900/60'
          }`}
          title={tr('打开本地优先的 AI Copilot 助手', 'Open the local-first AI Copilot')}
        >
          <Bot className="w-3.5 h-3.5 text-brand-400" />
          <span className="hidden xl:inline">{tr('AI 助手', 'AI Copilot')}</span>
          {isOllamaOnline && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block ml-0.5" />
          )}
        </button>

        {/* 文档元信息 */}
        {activeTab && (
          <button
            onClick={() => setActiveDialog('info')}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title={t('toolbar.docInfo')}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 语言切换 */}
        <button
          onClick={toggleLanguage}
          className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
          title={tr('切换到英文 / Switch to English', '切换到中文 / Switch to Chinese')}
          aria-label={tr('切换语言', 'Switch language')}
        >
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span>{i18n.language === 'zh' ? '中文' : 'EN'}</span>
        </button>
      </div>
    </div>
  )
}
