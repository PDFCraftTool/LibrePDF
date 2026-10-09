import React, { useState } from 'react'
import { useDocumentStore, ActiveDialog } from '../../stores/useDocumentStore'
import { useAIStore } from '../../stores/useAIStore'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { askForm } from '../../stores/usePromptStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import {
  X,
  Search,
  Sparkles,
  Layers,
  Scissors,
  RotateCw,
  Stamp,
  Hash,
  ScanText,
  FileSpreadsheet,
  ShieldAlert,
  CheckSquare,
  FolderSync,
  Grid2X2,
  Maximize2,
  BookOpen,
  ShieldCheck,
  Crop,
  Images,
  FileImage,
  FileCode,
  ScanLine,
  Compass,
  FileMinus2,
  Contrast,
  SlidersHorizontal,
  ChevronRight,
  Minimize2,
  Wrench,
  Layers2,
  GitCompare,
  FileText,
  FileDown,
  Trash2,
  Type,
  FileSignature,
  Bot,
  Workflow,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Info,
  Paperclip,
  ListTree,
  Globe,
  FileCheck2,
  RotateCcw,
  QrCode
} from 'lucide-react'

interface ToolItem {
  id: string
  name: string
  desc: string
  category: 'recommended' | 'layout' | 'security' | 'removal' | 'effects' | 'convert' | 'automation'
  icon: React.ElementType
  color: string
  dialogTarget?: ActiveDialog
  directAction?:
    | 'singleLargePage'
    | 'removeAnnotations'
    | 'removeImages'
    | 'autoRename'
    | 'openAI'
    | 'openWorkflow'
    | 'editText'
    | 'pdfToWord'
    | 'splitByBlank'
    | 'autoRotate'
    | 'validateSignatures'
    | 'splitByBarcode'
    | 'convertToPdfA'
    | 'splitBySize'
    | 'splitByBookmarks'
    | 'scalePageSize'
    | 'textOrMdToPdf'
    | 'comicToPdf'
    | 'pdfToHtml'
    | 'pdfToPptx'
    | 'officeToPdf'
  requireDoc?: boolean
  badge?: string
}

export const BentoToolboxDialog: React.FC = () => {
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument, setViewerMode } = useDocumentStore()
  const { toggleOpen: toggleAI } = useAIStore()
  const { toggleOpen: toggleWorkflow } = useWorkflowStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const tr = useTr()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isProcessing, setIsProcessing] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (activeDialog !== 'toolbox') return null

  // 工具列表按传入的文案函数构建：界面显示用 tr，搜索索引用中英拼接，保证两种语言都能搜到
  const buildTools = (tr: (zh: string, en: string) => string): ToolItem[] => [
    // ----------------- RECOMMENDED (常用推荐) -----------------
    {
      id: 'editText',
      name: tr('PDF 正文原地编辑', 'Edit PDF Text In Place'),
      desc: tr(
        '直接在当前文档画布中点击文字段落进行原地修改，高保真擦除并回写',
        'Click any text paragraph on the page to edit it in place; the original is erased and rewritten faithfully'
      ),
      category: 'recommended',
      icon: Type,
      color: 'from-amber-500 to-orange-500',
      directAction: 'editText',
      requireDoc: true,
      badge: tr('原生编辑', 'Native')
    },
    {
      id: 'merge',
      name: tr('合并多个 PDF', 'Merge PDFs'),
      desc: tr('将多个独立 PDF 文档按自定义顺序拼接合并为单一文件', 'Combine multiple PDF files into one, in any order you choose'),
      category: 'recommended',
      icon: Layers,
      color: 'from-blue-600 to-indigo-600',
      dialogTarget: 'merge'
    },
    {
      id: 'compare',
      name: tr('双文档视觉差异对比', 'Compare Two PDFs'),
      desc: tr(
        '逐页比对两份 PDF，自动高亮标红差异文本与图元变动',
        'Compare two PDFs page by page and highlight changed text and graphics'
      ),
      category: 'recommended',
      icon: GitCompare,
      color: 'from-purple-600 to-pink-600',
      dialogTarget: 'compare',
      badge: 'Stirling'
    },
    {
      id: 'compress',
      name: tr('PDF 压缩瘦身', 'Compress PDF'),
      desc: tr(
        '重构交叉引用表并压缩对象流，剔除孤立废弃对象以缩小体积',
        'Rebuild the cross-reference table, compress object streams and drop unused objects to reduce file size'
      ),
      category: 'recommended',
      icon: Minimize2,
      color: 'from-amber-600 to-yellow-600',
      dialogTarget: 'compressRepair',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'ocr',
      name: tr('RapidOCR 双层可搜索 PDF', 'RapidOCR Searchable PDF'),
      desc: tr(
        '离线深度学习逐页识别并对齐文字，生成外观保持原样、可选中复制的双层 PDF',
        'Offline deep-learning OCR that adds an aligned text layer, keeping the original look while making text selectable'
      ),
      category: 'recommended',
      icon: ScanText,
      color: 'from-rose-500 to-red-600',
      dialogTarget: 'ocr',
      requireDoc: true,
      badge: tr('AI 深度学习', 'AI / Deep Learning')
    },
    {
      id: 'tableExtract',
      name: tr('表格还原为 Excel', 'Extract Tables to Excel'),
      desc: tr(
        '识别有线及无线表格结构，导出带排版样式的标准 .xlsx 电子表格',
        'Detect bordered and borderless tables and export them as formatted .xlsx spreadsheets'
      ),
      category: 'recommended',
      icon: FileSpreadsheet,
      color: 'from-emerald-500 to-teal-600',
      dialogTarget: 'tableExtract',
      requireDoc: true,
      badge: tr('AI 深度学习', 'AI / Deep Learning')
    },
    {
      id: 'redact',
      name: tr('真正的物理脱敏 (Redaction)', 'True Redaction'),
      desc: tr(
        '永久擦除底层文字与图形内容，内置手机号/身份证/邮箱规则批量脱敏',
        'Permanently remove underlying text and graphics, with built-in patterns for phone numbers, ID numbers and emails'
      ),
      category: 'recommended',
      icon: ShieldAlert,
      color: 'from-red-600 to-rose-700',
      dialogTarget: 'redact',
      requireDoc: true
    },
    {
      id: 'imagesToPdf',
      name: tr('图片批量转 PDF', 'Images to PDF'),
      desc: tr(
        '将 JPG、PNG、WebP、TIFF、GIF、BMP 批量转换为 PDF（支持按原图尺寸或 A4 画幅）',
        'Batch convert JPG, PNG, WebP, TIFF, GIF and BMP to PDF (fit to original size or A4)'
      ),
      category: 'recommended',
      icon: Images,
      color: 'from-pink-500 to-rose-600',
      dialogTarget: 'imagesToPdf',
      badge: tr('全格式', 'All formats')
    },

    // ----------------- CONVERT & EXPORT (格式转换与互转) -----------------
    {
      id: 'pdfToImage',
      name: tr('PDF 导出为图片', 'PDF to Image'),
      desc: tr(
        '将 PDF 逐页渲染并导出为 JPG、PNG、TIFF、WebP，支持 72~300 DPI 分辨率',
        'Render each page to JPG, PNG, TIFF or WebP at 72–300 DPI'
      ),
      category: 'convert',
      icon: FileImage,
      color: 'from-rose-500 to-pink-600',
      dialogTarget: 'pdfToImage',
      requireDoc: true,
      badge: tr('多格式高清', 'HD, multi-format')
    },
    {
      id: 'pdfToWord',
      name: tr('PDF 转可编辑 Word (.docx)', 'PDF to Word (.docx)'),
      desc: tr(
        '基于版面与段落解析直接导出为 Microsoft Word (.docx) 文档，无需额外插件',
        'Export to an editable Microsoft Word (.docx) document using layout and paragraph analysis, no plugins needed'
      ),
      category: 'convert',
      icon: FileDown,
      color: 'from-blue-600 to-indigo-700',
      directAction: 'pdfToWord',
      requireDoc: true,
      badge: tr('快速转换', 'Fast')
    },
    {
      id: 'htmlToPdf',
      name: tr('网页 URL / HTML 转 PDF', 'Web Page / HTML to PDF'),
      desc: tr(
        '使用内置 Chromium 打印引擎，将网页或 HTML 代码高保真转为 PDF',
        'Convert web pages or HTML code to PDF with the built-in Chromium print engine'
      ),
      category: 'convert',
      icon: Globe,
      color: 'from-sky-500 to-indigo-600',
      dialogTarget: 'htmlToPdf',
      badge: tr('Chromium 内核', 'Chromium')
    },
    {
      id: 'pdfAConvert',
      name: tr('转换为 PDF/A 归档格式 (ISO 19005)', 'Convert to PDF/A (ISO 19005)'),
      desc: tr(
        '注入 sRGB OutputIntent 与合规 XMP 元数据，转换为符合 ISO 19005 (PDF/A) 的长期归档格式',
        'Add an sRGB OutputIntent and compliant XMP metadata to produce an ISO 19005 (PDF/A) archival file'
      ),
      category: 'convert',
      icon: ShieldCheck,
      color: 'from-amber-600 to-orange-700',
      directAction: 'convertToPdfA',
      requireDoc: true,
      badge: tr('ISO 标准', 'ISO standard')
    },
    {
      id: 'officeToPdf',
      name: tr('Office 转 PDF (Word/Excel/PPT)', 'Office to PDF (Word/Excel/PPT)'),
      desc: tr(
        '支持 docx、doc、xlsx、xls、pptx、ppt 转 PDF，通过 Windows 原生 COM 接口快速转换',
        'Convert docx, doc, xlsx, xls, pptx and ppt to PDF quickly via native Windows COM automation'
      ),
      category: 'convert',
      icon: FileSpreadsheet,
      color: 'from-blue-600 to-indigo-700',
      directAction: 'officeToPdf',
      badge: tr('Windows 原生', 'Windows native')
    },
    {
      id: 'textOrMdToPdf',
      name: tr('Markdown 与纯文本转 PDF', 'Markdown / Text to PDF'),
      desc: tr('将 .md 或 .txt 文本快速排版并导出为 PDF 文档（支持中文）', 'Typeset .md or .txt files into a PDF document (CJK supported)'),
      category: 'convert',
      icon: FileCode,
      color: 'from-emerald-500 to-teal-600',
      directAction: 'textOrMdToPdf',
      badge: tr('轻量转换', 'Lightweight')
    },
    {
      id: 'comicToPdf',
      name: tr('CBZ / CBR 漫画包转 PDF', 'CBZ / CBR Comics to PDF'),
      desc: tr(
        '自动解包漫画压缩文件，按自然序号无损合成为画册 PDF',
        'Unpack comic archives and combine the pages losslessly into a PDF in natural order'
      ),
      category: 'convert',
      icon: Images,
      color: 'from-purple-500 to-indigo-600',
      directAction: 'comicToPdf',
      badge: tr('漫画', 'Comics')
    },
    {
      id: 'pdfToHtml',
      name: tr('PDF 导出为 HTML 网页', 'PDF to HTML'),
      desc: tr(
        '提取版面、段落文本与样式，生成可在浏览器直接打开的独立 HTML5 网页',
        'Extract layout, text and styles into a standalone HTML5 page that opens in any browser'
      ),
      category: 'convert',
      icon: Globe,
      color: 'from-amber-500 to-orange-600',
      directAction: 'pdfToHtml',
      requireDoc: true,
      badge: tr('HTML5 导出', 'HTML5')
    },
    {
      id: 'pdfToPptx',
      name: tr('PDF 导出为幻灯片 (.pptx)', 'PDF to PowerPoint (.pptx)'),
      desc: tr(
        '逐页转换为 PowerPoint 幻灯片，保留高清页面并写入幻灯片备注',
        'Convert each page into a PowerPoint slide with a high-resolution image and speaker notes'
      ),
      category: 'convert',
      icon: FileImage,
      color: 'from-rose-500 to-red-600',
      directAction: 'pdfToPptx',
      requireDoc: true,
      badge: tr('PPTX 导出', 'PPTX')
    },

    // ----------------- PAGE FORMATTING (页面排版与拼印) -----------------
    {
      id: 'nup',
      name: tr('多页拼版缩印 (N-Up)', 'N-Up Page Layout'),
      desc: tr(
        '将 2/4/9 个页面并排缩印到单张 A4 纸上，可自动加边框以节省纸张',
        'Print 2, 4 or 9 pages on a single A4 sheet, with optional borders, to save paper'
      ),
      category: 'layout',
      icon: Grid2X2,
      color: 'from-blue-500 to-cyan-500',
      dialogTarget: 'nup',
      requireDoc: true,
      badge: 'BentoPDF'
    },
    {
      id: 'booklet',
      name: tr('骑马钉小册子', 'Booklet'),
      desc: tr(
        '自动补齐为 4 的倍数页并计算折页顺序，双面打印后对折装订即可成册',
        'Pad to a multiple of 4 pages and reorder for folding; print double-sided and fold into a booklet'
      ),
      category: 'layout',
      icon: BookOpen,
      color: 'from-emerald-500 to-teal-500',
      dialogTarget: 'booklet',
      requireDoc: true,
      badge: 'BentoPDF'
    },
    {
      id: 'posterize',
      name: tr('海报切片拼图', 'Posterize'),
      desc: tr(
        '将单张大图纸/海报切分为 2x2 或 3x3 网格，打印后拼接成大画幅',
        'Split a large page or poster into a 2x2 or 3x3 grid to print and tile together'
      ),
      category: 'layout',
      icon: Maximize2,
      color: 'from-purple-500 to-indigo-500',
      dialogTarget: 'posterize',
      requireDoc: true,
      badge: 'BentoPDF'
    },
    {
      id: 'singleLargePage',
      name: tr('拼接为超长单页', 'Single Large Page'),
      desc: tr('将所有页面自上而下无缝拼接为一个超长连续页面', 'Stitch all pages top to bottom into one continuous long page'),
      category: 'layout',
      icon: FileText,
      color: 'from-cyan-600 to-blue-700',
      directAction: 'singleLargePage',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'pageNumbers',
      name: tr('添加页码', 'Add Page Numbers'),
      desc: tr(
        '在页面顶部/底部自动添加规范页码（如“第 X 页 / 共 Y 页”）',
        'Add page numbers to the header or footer (e.g. "Page X of Y")'
      ),
      category: 'layout',
      icon: Hash,
      color: 'from-teal-500 to-emerald-600',
      dialogTarget: 'pageNumbers',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'split',
      name: tr('拆分文档', 'Split PDF'),
      desc: tr('按单页或自定义页码范围拆分为独立文档', 'Split into separate files by single pages or custom page ranges'),
      category: 'layout',
      icon: Scissors,
      color: 'from-emerald-600 to-green-600',
      dialogTarget: 'split',
      requireDoc: true
    },
    {
      id: 'rotate',
      name: tr('旋转页面', 'Rotate Pages'),
      desc: tr(
        '将单页或整本文档顺时针旋转 90° / 180° / 270° 并永久保存',
        'Rotate single pages or the whole document clockwise by 90°, 180° or 270° and save permanently'
      ),
      category: 'layout',
      icon: RotateCw,
      color: 'from-amber-500 to-orange-500',
      dialogTarget: 'rotate',
      requireDoc: true
    },
    {
      id: 'crop',
      name: tr('页面裁剪与扩边', 'Crop & Margins'),
      desc: tr('裁掉多余的页边空白，或扩展留白以便装订打孔', 'Trim excess margins, or add extra margin space for binding'),
      category: 'layout',
      icon: Crop,
      color: 'from-violet-500 to-purple-600',
      dialogTarget: 'crop',
      requireDoc: true
    },
    {
      id: 'toc',
      name: tr('书签目录编辑器', 'Bookmark / TOC Editor'),
      desc: tr(
        '树状书签大纲编辑器，支持增删改节点、调整章节层级与设置跳转页',
        'Tree-based outline editor: add, edit and delete bookmarks, change nesting and set target pages'
      ),
      category: 'layout',
      icon: ListTree,
      color: 'from-indigo-500 to-purple-600',
      dialogTarget: 'toc',
      requireDoc: true,
      badge: tr('可视化编辑', 'Visual editor')
    },
    {
      id: 'splitByBlank',
      name: tr('按空白页拆分', 'Split by Blank Pages'),
      desc: tr(
        '基于像素方差检测文档中的空白分隔页，自动将大文档拆分为多份独立 PDF',
        'Detect blank separator pages by pixel variance and split the document into multiple PDFs'
      ),
      category: 'layout',
      icon: Scissors,
      color: 'from-emerald-500 to-teal-600',
      directAction: 'splitByBlank',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'autoRotate',
      name: tr('按文字方向自动旋转', 'Auto Rotate'),
      desc: tr(
        '根据文字方向检测，一键将倒置或侧向（90°/180°/270°）的页面批量扶正',
        'Detect text orientation and straighten upside-down or sideways pages (90°/180°/270°) in one click'
      ),
      category: 'layout',
      icon: RotateCcw,
      color: 'from-amber-500 to-orange-600',
      directAction: 'autoRotate',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'splitByBarcode',
      name: tr('按条形码/二维码拆分', 'Split by Barcode'),
      desc: tr(
        '扫描页面中的条形码与二维码，遇到新条码即拆分为新文件，并以条码内容命名',
        'Scan pages for barcodes and QR codes, start a new file at each new code and name it after the code content'
      ),
      category: 'layout',
      icon: QrCode,
      color: 'from-emerald-600 to-teal-700',
      directAction: 'splitByBarcode',
      requireDoc: true,
      badge: tr('条码识别', 'Barcode')
    },
    {
      id: 'splitBySize',
      name: tr('按文件大小拆分', 'Split by File Size'),
      desc: tr(
        '设定每个分卷的大小上限（如 10MB），自动将大文档拆分为多个分卷',
        'Set a maximum size per part (e.g. 10 MB) and split a large document into multiple parts'
      ),
      category: 'layout',
      icon: Scissors,
      color: 'from-emerald-500 to-teal-600',
      directAction: 'splitBySize',
      requireDoc: true,
      badge: tr('分卷拆分', 'Size-based')
    },
    {
      id: 'splitByBookmarks',
      name: tr('按书签章节拆分', 'Split by Bookmarks'),
      desc: tr(
        '读取文档自带的书签目录，按章节拆分为独立 PDF 并以章节名命名',
        'Split the document into separate PDFs by its bookmark chapters, named after each chapter'
      ),
      category: 'layout',
      icon: ListTree,
      color: 'from-indigo-500 to-purple-600',
      directAction: 'splitByBookmarks',
      requireDoc: true,
      badge: tr('章节拆分', 'By chapter')
    },
    {
      id: 'scalePageSize',
      name: tr('缩放至标准纸张', 'Scale Page Size'),
      desc: tr(
        '将任意非标准尺寸的页面等比例缩放并居中到标准纸张（如 A4）',
        'Scale pages of any size proportionally and center them on a standard paper size (e.g. A4)'
      ),
      category: 'layout',
      icon: Maximize2,
      color: 'from-sky-500 to-blue-600',
      directAction: 'scalePageSize',
      requireDoc: true,
      badge: tr('标准纸张', 'Standard sizes')
    },

    // ----------------- SECURITY & SIGNING (安全、图章与签署) -----------------
    {
      id: 'stamp',
      name: tr('加盖印章与手写签名', 'Add Stamp / Signature'),
      desc: tr(
        '在指定页面和位置加盖透明印章、骑缝章或手写签名图片',
        'Place transparent stamps, cross-page seals or handwritten signature images at precise positions'
      ),
      category: 'security',
      icon: Stamp,
      color: 'from-rose-600 to-red-600',
      dialogTarget: 'stamp',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'watermark',
      name: tr('添加水印', 'Add Watermark'),
      desc: tr(
        '以平铺、居中或页眉页脚方式添加文字/图片水印，支持调节角度与透明度',
        'Add tiled, centered or header/footer text or image watermarks with adjustable angle and opacity'
      ),
      category: 'security',
      icon: Layers,
      color: 'from-cyan-600 to-blue-700',
      dialogTarget: 'watermark',
      requireDoc: true
    },
    {
      id: 'bates',
      name: tr('贝茨编号', 'Bates Numbering'),
      desc: tr(
        '批量添加 CONF-000001 格式的连续法律卷宗编号',
        'Stamp sequential legal Bates numbers such as CONF-000001 across pages'
      ),
      category: 'security',
      icon: Hash,
      color: 'from-purple-600 to-indigo-700',
      dialogTarget: 'bates',
      requireDoc: true
    },
    {
      id: 'sanitize',
      name: tr('清除元数据与隐私信息', 'Sanitize Metadata'),
      desc: tr(
        '清除作者、软件版本、创建时间、编辑历史及 XML/XMP 隐藏信息',
        'Remove author, software, creation date, edit history and hidden XML/XMP data'
      ),
      category: 'security',
      icon: ShieldCheck,
      color: 'from-emerald-600 to-teal-700',
      dialogTarget: 'sanitize',
      requireDoc: true,
      badge: 'BentoPDF'
    },
    {
      id: 'flatten',
      name: tr('表单扁平化', 'Flatten Forms'),
      desc: tr('将所有交互式表单控件转换为不可修改的静态页面内容', 'Convert all interactive form fields into static, non-editable page content'),
      category: 'security',
      icon: CheckSquare,
      color: 'from-blue-600 to-indigo-700',
      dialogTarget: 'form',
      requireDoc: true
    },
    {
      id: 'decrypt',
      name: tr('移除密码与安全限制', 'Remove Password'),
      desc: tr(
        '输入已知密码解除加密，另存为无阅读、打印或复制限制的 PDF 文档',
        'Enter the known password to decrypt and save a copy without opening, printing or copying restrictions'
      ),
      category: 'security',
      icon: Unlock,
      color: 'from-rose-500 to-pink-600',
      dialogTarget: 'decrypt',
      requireDoc: true,
      badge: tr('解密另存', 'Decrypt')
    },
    {
      id: 'attachments',
      name: tr('附件嵌入与提取', 'Attachments'),
      desc: tr(
        '在 PDF 中嵌入任意格式的附件（音视频、表格等），或将已有附件提取到本地',
        'Embed files of any type (media, spreadsheets, etc.) into the PDF, or extract existing attachments'
      ),
      category: 'security',
      icon: Paperclip,
      color: 'from-cyan-600 to-blue-600',
      dialogTarget: 'attachments',
      requireDoc: true,
      badge: tr('附件管理', 'Manage files')
    },
    {
      id: 'validateSignatures',
      name: tr('数字签名校验', 'Validate Signatures'),
      desc: tr(
        '扫描签名字典与 ByteRange 哈希，校验数字签名证书链及文档是否被篡改',
        'Inspect signature dictionaries and ByteRange hashes to verify certificate chains and detect tampering'
      ),
      category: 'security',
      icon: FileCheck2,
      color: 'from-emerald-600 to-green-600',
      directAction: 'validateSignatures',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'formDesigner',
      name: tr('AcroForm 表单设计器', 'AcroForm Form Designer'),
      desc: tr(
        '在页面上框选位置，添加单行文本框、复选框、单选按钮和下拉列表',
        'Draw text fields, checkboxes, radio buttons and dropdowns directly on the page'
      ),
      category: 'security',
      icon: CheckSquare,
      color: 'from-blue-600 to-indigo-700',
      dialogTarget: 'formDesigner',
      requireDoc: true,
      badge: tr('表单设计', 'Designer')
    },
    {
      id: 'digitalSign',
      name: tr('P12 证书数字签名与时间戳', 'Digital Signature (P12) & Timestamp'),
      desc: tr(
        '加载 .p12/.pfx 证书写入标准 PKCS#7 签名，可被 Adobe 等阅读器验证，支持 RFC 3161 时间戳',
        'Sign with a .p12/.pfx certificate using standard PKCS#7, verifiable in Adobe Reader, with RFC 3161 timestamps'
      ),
      category: 'security',
      icon: FileCheck2,
      color: 'from-emerald-600 to-green-600',
      dialogTarget: 'digitalSign',
      requireDoc: true,
      badge: 'PKCS#7'
    },

    // ----------------- EXTRACTION & REMOVAL (提取、剔除与清理) -----------------
    {
      id: 'removeBlank',
      name: tr('删除空白页', 'Remove Blank Pages'),
      desc: tr(
        '基于像素方差与阈值检测，一键删除文档中所有无内容的空白页',
        'Detect empty pages by pixel variance and threshold, and remove them in one click'
      ),
      category: 'removal',
      icon: FileMinus2,
      color: 'from-rose-500 to-pink-500',
      dialogTarget: 'removeBlank',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'removeAnnotations',
      name: tr('清除全部批注', 'Remove Annotations'),
      desc: tr(
        '移除所有高亮、手绘线条、便签等注释，只保留原始内容',
        'Remove all highlights, drawings, sticky notes and other annotations, keeping only the original content'
      ),
      category: 'removal',
      icon: Trash2,
      color: 'from-orange-500 to-red-600',
      directAction: 'removeAnnotations',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'removeImages',
      name: tr('移除全部图片', 'Remove Images'),
      desc: tr('删除 PDF 中的所有位图图片以大幅减小体积，仅保留矢量与文字', 'Remove all raster images to shrink the file, keeping only vectors and text'),
      category: 'removal',
      icon: FileImage,
      color: 'from-slate-600 to-zinc-700',
      directAction: 'removeImages',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'popplerImages',
      name: tr('Poppler 无损提取原始图片', 'Extract Images (Poppler)'),
      desc: tr(
        '直接从底层数据流无损提取所有嵌入图片，不做二次压缩',
        'Extract all embedded images losslessly from the raw data streams, without recompression'
      ),
      category: 'removal',
      icon: FileImage,
      color: 'from-amber-600 to-orange-600',
      dialogTarget: 'popplerImages',
      requireDoc: true
    },
    {
      id: 'popplerText',
      name: tr('Poppler 保留版面提取文本', 'Extract Text with Layout (Poppler)'),
      desc: tr(
        '保留原始多栏版面与对齐间距，快速提取大量文字',
        'Quickly extract large amounts of text while preserving multi-column layout and spacing'
      ),
      category: 'removal',
      icon: FileCode,
      color: 'from-teal-600 to-cyan-700',
      dialogTarget: 'popplerText',
      requireDoc: true
    },

    // ----------------- VISUAL & ADVANCED (图像特效与高级修复) -----------------
    {
      id: 'scanner',
      name: tr('仿扫描件效果', 'Fake Scanner Effect'),
      desc: tr(
        '为电子版 PDF 添加轻微倾斜、复印噪点、暗角与纸张泛黄效果',
        'Give a digital PDF a scanned look with slight skew, copier noise, vignetting and yellowed paper'
      ),
      category: 'effects',
      icon: ScanLine,
      color: 'from-amber-600 to-yellow-600',
      dialogTarget: 'scanner',
      requireDoc: true,
      badge: 'BentoPDF'
    },
    {
      id: 'deskew',
      name: tr('自动倾斜校正', 'Auto Deskew'),
      desc: tr(
        '基于行投影方差分析自动检测倾斜角度，并将页面校正为水平',
        'Detect skew angle via row-projection variance analysis and straighten the page'
      ),
      category: 'effects',
      icon: Compass,
      color: 'from-teal-500 to-emerald-600',
      dialogTarget: 'deskew',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'grayscale',
      name: tr('灰度与反色', 'Grayscale / Invert'),
      desc: tr(
        '将彩色文档转为灰度以节省打印耗材，或反色为深色高对比阅读',
        'Convert color documents to grayscale to save ink, or invert colors for high-contrast dark reading'
      ),
      category: 'effects',
      icon: Contrast,
      color: 'from-slate-500 to-zinc-700',
      dialogTarget: 'grayscale',
      requireDoc: true
    },
    {
      id: 'repair',
      name: tr('修复损坏的 PDF', 'Repair PDF'),
      desc: tr(
        '容错加载并重建损坏的 XRef 交叉引用表与 Trailer 字典，尝试恢复无法打开的文档',
        'Load with error tolerance and rebuild broken XRef tables and trailer dictionaries to recover unreadable files'
      ),
      category: 'effects',
      icon: Wrench,
      color: 'from-blue-600 to-cyan-600',
      dialogTarget: 'compressRepair',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'overlay',
      name: tr('叠加 PDF 图层', 'Overlay PDFs'),
      desc: tr(
        '将当前文档叠加到背景模板之上（如信笺抬头、公章底稿）',
        'Overlay the current document onto a background template (e.g. letterhead or stamp sheet)'
      ),
      category: 'effects',
      icon: Layers2,
      color: 'from-purple-600 to-indigo-600',
      dialogTarget: 'overlay',
      requireDoc: true,
      badge: 'Stirling'
    },

    // ----------------- AUTOMATION & AI (自动化与智能体) -----------------
    {
      id: 'autoRename',
      name: tr('按标题自动重命名', 'Auto Rename'),
      desc: tr(
        '从首页文本或元数据中提取标题，去除特殊字符后生成规范的文件名',
        'Extract a title from the first page or metadata and turn it into a clean file name'
      ),
      category: 'automation',
      icon: FileSignature,
      color: 'from-emerald-600 to-teal-700',
      directAction: 'autoRename',
      requireDoc: true,
      badge: 'Stirling'
    },
    {
      id: 'form',
      name: tr('AcroForm 表单识别与填写', 'Fill AcroForms'),
      desc: tr(
        '自动识别文本框与复选框，在弹窗中可视化填写并写回文档',
        'Detect text fields and checkboxes, fill them in a dialog and write the values back'
      ),
      category: 'automation',
      icon: CheckSquare,
      color: 'from-blue-600 to-indigo-600',
      dialogTarget: 'form',
      requireDoc: true
    },
    {
      id: 'hotfolder',
      name: tr('Hot Folder 文件夹监听', 'Hot Folder'),
      desc: tr(
        '后台监听指定文件夹，有新 PDF 放入时自动触发批处理流水线',
        'Watch a folder in the background and run a batch pipeline automatically when new PDFs arrive'
      ),
      category: 'automation',
      icon: FolderSync,
      color: 'from-indigo-600 to-purple-600',
      dialogTarget: 'hotfolder'
    },
    {
      id: 'aiCopilot',
      name: tr('本地 AI Copilot 助手', 'Local AI Copilot'),
      desc: tr(
        '连接 Ollama 本地模型，用自然语言调用工具，长文档本地 RAG 问答并可跳转到出处',
        'Use local Ollama models to run tools with natural language, with local RAG Q&A that links back to sources'
      ),
      category: 'automation',
      icon: Bot,
      color: 'from-brand-600 to-indigo-600',
      directAction: 'openAI'
    },
    {
      id: 'workflowCanvas',
      name: tr('可视化工作流画布', 'Visual Workflow Canvas'),
      desc: tr(
        '拖拽连线，把 OCR、表格提取、水印等步骤串联为自动化流水线',
        'Drag and connect nodes to chain OCR, table extraction, watermarking and more into automated pipelines'
      ),
      category: 'automation',
      icon: Workflow,
      color: 'from-purple-600 to-pink-600',
      directAction: 'openWorkflow'
    }
  ]

  const tools = buildTools(tr)
  // 搜索索引：同时包含中英文名称、描述与徽章，与 tools 一一对应
  const searchIndex = buildTools((zh, en) => `${zh} ${en}`).map((t) =>
    `${t.id} ${t.name} ${t.desc} ${t.badge || ''}`.toLowerCase()
  )

  const categories = [
    { id: 'all', name: tr(`全部 (${tools.length})`, `All (${tools.length})`) },
    { id: 'recommended', name: tr('常用推荐', 'Recommended') },
    { id: 'convert', name: tr('格式转换', 'Convert') },
    { id: 'layout', name: tr('页面排版', 'Page Formatting') },
    { id: 'security', name: tr('安全与签署', 'Security & Signing') },
    { id: 'removal', name: tr('提取与清理', 'Extract & Remove') },
    { id: 'effects', name: tr('图像与修复', 'Visual & Repair') },
    { id: 'automation', name: tr('自动化与 AI', 'Automation & AI') }
  ]

  const query = searchQuery.trim().toLowerCase()
  const filteredTools = tools.filter((tool, i) => {
    const matchCat = selectedCategory === 'all' || tool.category === selectedCategory
    const matchSearch = !query || searchIndex[i].includes(query)
    return matchCat && matchSearch
  })

  const handleToolClick = async (tool: ToolItem) => {
    if (tool.requireDoc && !activeTab) {
      setFeedbackMsg({
        type: 'error',
        text: tr(`请先打开一份 PDF 文档，再使用【${tool.name}】`, `Open a PDF document first to use "${tool.name}".`)
      })
      return
    }

    if (tool.dialogTarget) {
      setActiveDialog(tool.dialogTarget)
      return
    }

    if (tool.directAction) {
      if (tool.directAction === 'openAI') {
        setActiveDialog('none')
        toggleAI()
        return
      }
      if (tool.directAction === 'openWorkflow') {
        setActiveDialog('none')
        toggleWorkflow()
        return
      }
      if (tool.directAction === 'editText') {
        setActiveDialog('none')
        setViewerMode('edit_text')
        return
      }

      // 执行无需对话框的直接处理操作
      if (!activeTab) return

      if (tool.directAction === 'validateSignatures') {
        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfValidateSignatures(activeTab.filePath)
          if (res.success) {
            if (res.hasSignatures) {
              const sigs = res.signatures || []
              if (!res.cryptoVerified) {
                setFeedbackMsg({
                  type: 'error',
                  text: tr(
                    `检测到 ${res.signatureCount} 个签名域，但未安装 pyHanko，无法进行密码学校验（pip install pyhanko）。`,
                    `Found ${res.signatureCount} signature field(s), but pyHanko is not installed so they cannot be verified (pip install pyhanko).`
                  )
                })
              } else {
                // 逐个签名给出：内容是否完整 / 签名值是否有效 / 证书是否受信任
                const lines = sigs.map((s, i) => {
                  const state = s.error
                    ? tr(`校验出错：${s.error}`, `verification error: ${s.error}`)
                    : !s.intact
                      ? tr('❌ 签名后文档已被修改', '❌ document modified after signing')
                      : !s.valid
                        ? tr('❌ 签名值无效', '❌ invalid signature value')
                        : s.trusted
                          ? tr('✅ 有效且证书受信任', '✅ valid, trusted certificate')
                          : tr('⚠️ 签名完整有效，但证书不受信任（如自签名）', '⚠️ intact and valid, but the certificate is not trusted (e.g. self-signed)')
                  const who = s.signer ? ` · ${s.signer.replace(/^Common Name:\s*/, '')}` : ''
                  const when = s.signingTime ? ` · ${new Date(s.signingTime).toLocaleString()}` : ''
                  const ts = s.hasTimestamp ? tr(' · 含时间戳', ' · timestamped') : ''
                  return `#${i + 1}${who}${when}${ts}${tr('：', ': ')}${state}`
                })
                const allGood = sigs.every((s) => s.intact && s.valid && !s.error)
                setFeedbackMsg({
                  type: allGood ? 'success' : 'error',
                  text: `${tr(`共 ${sigs.length} 个数字签名`, `${sigs.length} signature(s)`)}\n${lines.join('\n')}`
                })
              }
            } else {
              setFeedbackMsg({
                type: 'success',
                text: tr('【数字签名检测】该文档中没有数字签名域（未签名文档）。', 'No digital signature fields found in this document (unsigned).')
              })
            }
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('签名校验失败', 'Signature validation failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('签名校验出错', 'Error while validating signatures') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'pdfToWord') {
        const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '.docx')
        const savePath = await window.electronAPI.saveFileDialog({
          defaultPath: defaultOut,
          filters: [{ name: tr('Word 文档', 'Word Document'), extensions: ['docx'] }]
        })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfToWord(activeTab.filePath, savePath)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【Word 转换成功】已生成可编辑的 Word 文档（共 ${res.pageCount || 1} 页）。`,
                `Converted to an editable Word document (${res.pageCount || 1} page(s)).`
              )
            })
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('转换 Word 失败', 'Word conversion failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('导出 Word 出错', 'Error while exporting to Word') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'splitByBlank') {
        const dirRes = await window.electronAPI.openFileDialog({ openDirectory: true })
        // 用户取消选择目录时应中止操作，而不是静默写入源文件旁（或临时目录）
        if (!dirRes?.[0]) return
        const outDir = dirRes[0]

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfSplitByBlankPages(activeTab.filePath, outDir)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【按空白页拆分完成】检测到 ${res.blankPagesCount || 0} 个空白分隔页，共拆分为 ${res.partsCount || res.outputFiles?.length || 0} 份文档。`,
                `Split complete: found ${res.blankPagesCount || 0} blank separator page(s) and created ${res.partsCount || res.outputFiles?.length || 0} document(s).`
              )
            })
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('按空白页拆分失败', 'Split by blank pages failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('拆分出错', 'Error while splitting') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'autoRotate') {
        const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_autorotated.pdf')
        const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfAutoRotate(activeTab.filePath, savePath)
          if (res.success && res.outputPath) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【自动旋转完成】已扶正 ${res.count || res.rotatedPages?.length || 0} 页，并打开新文档。`,
                `Auto rotate complete: straightened ${res.count || res.rotatedPages?.length || 0} page(s). The new document is open.`
              )
            })
            await openDocument(res.outputPath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('自动旋转失败', 'Auto rotate failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('自动旋转出错', 'Error during auto rotate') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'splitByBarcode') {
        const dirRes = await window.electronAPI.openFileDialog({ openDirectory: true })
        if (!dirRes?.[0]) return
        const outDir = dirRes[0]

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfSplitByBarcode(activeTab.filePath, outDir)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【按条码拆分完成】检测到 ${res.barcodeCount || 0} 个有效条形码/二维码，共导出 ${res.count || res.outputFiles?.length || 0} 份文件。`,
                `Split complete: found ${res.barcodeCount || 0} valid barcode(s)/QR code(s) and exported ${res.count || res.outputFiles?.length || 0} file(s).`
              )
            })
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('按条码拆分失败', 'Split by barcode failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('按条码拆分出错', 'Error while splitting by barcode') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'convertToPdfA') {
        const params = await askForm({
          title: tr('转换为 PDF/A 归档格式', 'Convert to PDF/A'),
          description: tr(
            '含未嵌入字体（或 PDF/A-1 中含透明度）的页面会被栅格化，并保留隐形文字层以便搜索。',
            'Pages with non-embedded fonts (or transparency for PDF/A-1) are rasterized while keeping an invisible text layer for search.'
          ),
          fields: [
            {
              name: 'conformance',
              label: tr('合规级别', 'Conformance level'),
              type: 'segmented',
              defaultValue: '2b',
              options: [
                { value: '1b', label: 'PDF/A-1b', hint: tr('最严格，兼容最老的系统', 'Strictest, widest legacy support') },
                { value: '2b', label: 'PDF/A-2b', hint: tr('推荐：支持透明度与 JPEG2000', 'Recommended: allows transparency') },
                { value: '3b', label: 'PDF/A-3b', hint: tr('允许嵌入任意附件', 'Allows arbitrary attachments') }
              ]
            }
          ],
          confirmText: tr('选择保存位置', 'Choose output')
        })
        if (!params) return
        const level = params.conformance as '1b' | '2b' | '3b'

        const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, `_pdfa${level}.pdf`)
        const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfConvertToPdfA(activeTab.filePath, savePath, level)
          if (res.success && res.outputPath) {
            const failed = (res.checks || []).filter((c) => !c.ok)
            const raster = res.rasterizedPages?.length
              ? tr(`\n已栅格化第 ${res.rasterizedPages.join(', ')} 页（含未嵌入字体或透明度）。`, `\nRasterized page(s) ${res.rasterizedPages.join(', ')} (non-embedded fonts or transparency).`)
              : ''
            setFeedbackMsg({
              type: res.selfCheckPassed ? 'success' : 'error',
              text: res.selfCheckPassed
                ? tr(
                    `已生成 ${res.conformance}，内置自检全部通过。正式归档前建议使用 veraPDF 复核。`,
                    `${res.conformance} created and passed all built-in checks. Verify with veraPDF before formal archiving.`
                  ) + raster
                : tr('已生成文件，但以下自检项未通过：', 'File created, but these checks failed: ') +
                  failed.map((c) => `${c.item}${c.detail ? ` (${c.detail})` : ''}`).join(tr('；', '; ')) +
                  raster
            })
            await openDocument(res.outputPath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('PDF/A 转换失败', 'PDF/A conversion failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('PDF/A 转换出错', 'Error during PDF/A conversion') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'splitBySize') {
        const params = await askForm({
          title: tr('按文件大小拆分', 'Split by file size'),
          description: tr('每个分卷不超过设定大小（单页超过上限时会单独成卷）。', 'Each part stays under the limit (a single oversized page becomes its own part).'),
          fields: [
            {
              name: 'maxMB',
              label: tr('每卷大小上限', 'Maximum size per part'),
              type: 'number',
              defaultValue: 10,
              min: 0.1,
              max: 2048,
              step: 0.5,
              suffix: 'MB',
              hint: tr('常见邮件附件上限：10 MB / 20 MB / 25 MB', 'Common email limits: 10 / 20 / 25 MB')
            }
          ],
          confirmText: tr('选择输出文件夹', 'Choose output folder')
        })
        if (!params) return
        const maxMB = Number(params.maxMB)

        const dirRes = await window.electronAPI.openFileDialog({ openDirectory: true })
        if (!dirRes?.[0]) return
        const outDir = dirRes[0]

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfSplitBySize(activeTab.filePath, maxMB, outDir)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `已按每卷 ≤ ${maxMB} MB 拆分为 ${res.count || res.outputFiles?.length || 0} 个文件。`,
                `Split into ${res.count || res.outputFiles?.length || 0} part(s) of ≤ ${maxMB} MB each.`
              )
            })
            toast.success(tr('拆分完成', 'Split complete'), outDir, outDir)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('按大小拆分失败', 'Split by size failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('按大小拆分出错', 'Error while splitting by size') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'splitByBookmarks') {
        const dirRes = await window.electronAPI.openFileDialog({ openDirectory: true })
        if (!dirRes?.[0]) return
        const outDir = dirRes[0]

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfSplitByBookmarks(activeTab.filePath, outDir)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【按书签拆分完成】已按书签章节导出 ${res.count || res.outputFiles?.length || 0} 个文件。`,
                `Split complete: exported ${res.count || res.outputFiles?.length || 0} file(s) by bookmark chapter.`
              )
            })
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('按书签拆分失败', 'Split by bookmarks failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('按书签拆分出错', 'Error while splitting by bookmarks') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'scalePageSize') {
        const params = await askForm({
          title: tr('统一页面尺寸', 'Scale to a standard page size'),
          description: tr('所有页面将等比例缩放并居中到目标纸张。', 'Every page is scaled proportionally and centered on the target paper.'),
          fields: [
            {
              name: 'size',
              label: tr('目标纸张', 'Target paper size'),
              type: 'segmented',
              defaultValue: 'A4',
              options: [
                { value: 'A3', label: 'A3', hint: '297×420 mm' },
                { value: 'A4', label: 'A4', hint: '210×297 mm' },
                { value: 'A5', label: 'A5', hint: '148×210 mm' },
                { value: 'Letter', label: 'Letter', hint: '8.5×11 in' },
                { value: 'Legal', label: 'Legal', hint: '8.5×14 in' }
              ]
            }
          ],
          confirmText: tr('选择保存位置', 'Choose output')
        })
        if (!params) return
        const size = params.size as 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal'

        const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, `_scaled_${size}.pdf`)
        const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfScalePageSize(activeTab.filePath, size, savePath)
          if (res.success && res.outputPath) {
            setFeedbackMsg({
              type: 'success',
              text: tr(`所有页面已等比例适配至 ${size}，已打开新文档。`, `All pages scaled to ${size}. The new document is open.`)
            })
            await openDocument(res.outputPath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.message || tr('页面缩放失败', 'Page scaling failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('页面缩放出错', 'Error while scaling pages') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'textOrMdToPdf') {
        const selected = await window.electronAPI.openFileDialog({
          filters: [{ name: tr('Markdown / 文本', 'Markdown / Text'), extensions: ['md', 'markdown', 'txt'] }]
        })
        if (!selected || selected.length === 0) return
        const srcFile = selected[0]

        const defaultOut = srcFile.replace(/\.[^.]+$/i, '.pdf')
        const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfTextOrMarkdownToPdf(srcFile, savePath)
          if (res.success && res.outputPath) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【文本转 PDF 完成】已生成 ${res.pageCount || 1} 页 PDF 并打开。`,
                `Created a ${res.pageCount || 1}-page PDF and opened it.`
              )
            })
            await openDocument(res.outputPath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('文本转 PDF 失败', 'Text to PDF failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('转换出错', 'Conversion error') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'comicToPdf') {
        const selected = await window.electronAPI.openFileDialog({
          filters: [{ name: tr('漫画压缩包', 'Comic Book Archive'), extensions: ['cbz', 'zip', 'cbr'] }]
        })
        if (!selected || selected.length === 0) return
        const srcFile = selected[0]

        const defaultOut = srcFile.replace(/\.[^.]+$/i, '.pdf')
        const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfComicToPdf(srcFile, savePath)
          if (res.success && res.outputPath) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【漫画转 PDF 完成】已解包并合成为 ${res.pageCount || 1} 页 PDF。`,
                `Unpacked the comic and combined it into a ${res.pageCount || 1}-page PDF.`
              )
            })
            await openDocument(res.outputPath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('漫画转换失败', 'Comic conversion failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('转换出错', 'Conversion error') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'pdfToHtml') {
        const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '.html')
        const savePath = await window.electronAPI.saveFileDialog({
          defaultPath: defaultOut,
          filters: [{ name: tr('HTML 网页', 'HTML Webpage'), extensions: ['html', 'htm'] }]
        })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfToHtml(activeTab.filePath, savePath)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr('已生成独立 HTML 网页文件，可在浏览器中离线阅览。', 'A standalone HTML file was created and can be viewed offline in a browser.')
            })
            toast.success(tr('已导出 HTML', 'HTML exported'), savePath, savePath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('导出 HTML 失败', 'HTML export failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('导出 HTML 出错', 'Error while exporting HTML') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'pdfToPptx') {
        const params = await askForm({
          title: tr('PDF 转 PowerPoint', 'PDF to PowerPoint'),
          description: tr('每页渲染为一张幻灯片图片，分辨率越高越清晰、文件越大。', 'Each page becomes a slide image; higher resolution is sharper but larger.'),
          fields: [
            {
              name: 'dpi',
              label: tr('渲染分辨率', 'Render resolution'),
              type: 'segmented',
              defaultValue: '150',
              options: [
                { value: '96', label: '96 DPI', hint: tr('体积最小', 'Smallest') },
                { value: '150', label: '150 DPI', hint: tr('推荐', 'Recommended') },
                { value: '220', label: '220 DPI', hint: tr('高清', 'High quality') },
                { value: '300', label: '300 DPI', hint: tr('打印级', 'Print quality') }
              ]
            }
          ],
          confirmText: tr('选择保存位置', 'Choose output')
        })
        if (!params) return
        const pptxDpi = Number(params.dpi) || 150

        const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '.pptx')
        const savePath = await window.electronAPI.saveFileDialog({
          defaultPath: defaultOut,
          filters: [{ name: tr('PowerPoint 演示文稿', 'PowerPoint Presentation'), extensions: ['pptx'] }]
        })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfToPptx(activeTab.filePath, savePath, pptxDpi)
          if (res.success) {
            setFeedbackMsg({
              type: 'success',
              text: tr(`已导出 ${res.slideCount || 1} 张幻灯片（${pptxDpi} DPI）。`, `Exported ${res.slideCount || 1} slide(s) at ${pptxDpi} DPI.`)
            })
            toast.success(tr('已导出 PowerPoint', 'PowerPoint exported'), savePath, savePath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('导出 PPTX 失败', 'PPTX export failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('导出 PPTX 出错', 'Error while exporting PPTX') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'officeToPdf') {
        const selected = await window.electronAPI.openFileDialog({
          filters: [{ name: tr('Office 文档', 'Office Documents'), extensions: ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'] }]
        })
        if (!selected || selected.length === 0) return
        const srcFile = selected[0]

        const defaultOut = srcFile.replace(/\.[^.]+$/i, '.pdf')
        const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
        if (!savePath) return

        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfOfficeToPdf(srcFile, savePath)
          if (res.success && res.outputPath) {
            setFeedbackMsg({
              type: 'success',
              text: tr(
                `【Office 转换完成】已通过 ${res.engine || '内置引擎'} 导出 PDF 并打开。`,
                `Converted to PDF with ${res.engine || 'the built-in engine'} and opened it.`
              )
            })
            await openDocument(res.outputPath)
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('Office 转换失败', 'Office conversion failed') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('Office 转换出错', 'Error during Office conversion') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      if (tool.directAction === 'autoRename') {
        setIsProcessing(true)
        setFeedbackMsg(null)
        try {
          const res = await window.electronAPI.pdfAutoRename(activeTab.filePath)
          if (res.success && res.suggestedName) {
            setIsProcessing(false)
            // 让用户确认/修改建议的文件名，然后真正重命名磁盘上的原文件
            const params = await askForm({
              title: tr('智能重命名', 'Smart rename'),
              description: tr(
                `根据首页内容生成的建议文件名。将重命名：${activeTab.originalFilePath}`,
                `Suggested from the first page. This renames: ${activeTab.originalFilePath}`
              ),
              fields: [
                {
                  name: 'name',
                  label: tr('新文件名', 'New file name'),
                  type: 'text',
                  defaultValue: res.suggestedName.replace(/\.pdf$/i, ''),
                  suffix: '.pdf',
                  required: true,
                  validate: (v: string) =>
                    /[\\/:*?"<>|]/.test(v || '') ? tr('不能包含 \\ / : * ? " < > |', 'Cannot contain \\ / : * ? " < > |') : null
                }
              ],
              confirmText: tr('重命名', 'Rename')
            })
            if (!params) return

            const renameRes = await window.electronAPI.renameFile(activeTab.originalFilePath, String(params.name))
            if (renameRes.success && renameRes.newPath) {
              const newPath = renameRes.newPath
              const newName = newPath.split(/[/\\]/).pop() || newPath
              // 同步更新标签页：原路径变化；若工作副本就是原文件，也一并更新
              useDocumentStore.setState((s) => ({
                tabs: s.tabs.map((t) =>
                  t.id === activeTab.id
                    ? {
                        ...t,
                        originalFilePath: newPath,
                        filePath: t.filePath === activeTab.originalFilePath ? newPath : t.filePath,
                        // 编辑历史中指向旧文件名的条目也要同步，否则撤销到原始状态时会找不到文件
                        history: t.history.map((p) => (p === activeTab.originalFilePath ? newPath : p)),
                        fileName: newName
                      }
                    : t
                )
              }))
              setFeedbackMsg({ type: 'success', text: tr(`已重命名为 ${newName}`, `Renamed to ${newName}`) })
              toast.success(tr('已重命名', 'Renamed'), newName, newPath)
            } else {
              setFeedbackMsg({ type: 'error', text: renameRes.error || tr('重命名失败', 'Rename failed') })
            }
          } else {
            setFeedbackMsg({ type: 'error', text: res.error || tr('无法生成建议文件名', 'Could not suggest a file name') })
          }
        } catch (err: any) {
          setFeedbackMsg({ type: 'error', text: err.message || tr('操作出错', 'Operation failed') })
        } finally {
          setIsProcessing(false)
        }
        return
      }

      const defaultOutMap: Record<string, string> = {
        singleLargePage: (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_continuous_large.pdf'),
        removeAnnotations: (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_no_annots.pdf'),
        removeImages: (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_no_images.pdf')
      }

      const defaultOut = defaultOutMap[tool.directAction] || 'output.pdf'
      const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
      if (!savePath) return

      setIsProcessing(true)
      setFeedbackMsg(null)

      try {
        let res: any = null
        if (tool.directAction === 'singleLargePage') {
          res = await window.electronAPI.pdfToSingleContinuousPage(activeTab.filePath, savePath)
        } else if (tool.directAction === 'removeAnnotations') {
          res = await window.electronAPI.pdfRemoveAnnotations(activeTab.filePath, savePath)
        } else if (tool.directAction === 'removeImages') {
          res = await window.electronAPI.pdfRemoveImages(activeTab.filePath, savePath)
        }

        if (res && res.success && res.outputPath) {
          setFeedbackMsg({
            type: 'success',
            text: tr(`【${tool.name}】处理完成，已打开新文档。`, `"${tool.name}" finished. The new document is open.`)
          })
          await openDocument(res.outputPath)
        } else {
          setFeedbackMsg({ type: 'error', text: res?.message || tr('处理失败', 'Processing failed') })
        }
      } catch (err: any) {
        setFeedbackMsg({ type: 'error', text: err.message || tr('执行出错', 'Execution error') })
      } finally {
        setIsProcessing(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[86vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">
                  {tr('全能 PDF 工具箱', 'All-in-One PDF Toolbox')}
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 font-semibold shadow-sm">
                  {tr(`${tools.length} 款工具`, `${tools.length} tools`)}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 font-semibold shadow-sm">
                  {tr('Clean-Room 自研', 'Clean-Room')}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {tr(
                  '覆盖 Stirling-PDF、BentoPDF、PDFCraft 的常用功能，并支持正文原地编辑与深度学习双层 OCR',
                  'Covers the common features of Stirling-PDF, BentoPDF and PDFCraft, plus in-place text editing and deep-learning OCR'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* 即时搜索框 */}
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr('搜索工具（如：压缩、纠偏、拼版、OCR）...', 'Search tools (e.g. compress, deskew, N-up, OCR)...')}
                aria-label={tr('搜索工具', 'Search tools')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              onClick={() => setActiveDialog('none')}
              aria-label={tr('关闭', 'Close')}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 分类过滤器条 */}
        <div className="px-6 py-2.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center space-x-1.5 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white font-medium shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* 反馈通知条 */}
        {feedbackMsg && (
          <div
            className={`mx-6 mt-3 px-4 py-2 rounded-xl text-xs flex items-center justify-between border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                : 'bg-red-950/30 border-red-800/50 text-red-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400" />
              )}
              <span className="whitespace-pre-line select-text">{feedbackMsg.text}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 工具卡片网格区 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredTools.map((tool) => {
              const IconComp = tool.icon
              return (
                <div
                  key={tool.id}
                  onClick={() => handleToolClick(tool)}
                  className="group relative flex flex-col justify-between p-4 rounded-2xl bg-slate-950/40 hover:bg-slate-800/50 border border-slate-800/90 hover:border-slate-700 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center text-white shadow-md`}
                      >
                        <IconComp className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {tool.badge && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                            {tool.badge}
                          </span>
                        )}
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xs font-bold text-slate-200 group-hover:text-indigo-300 transition-colors">
                      {tool.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                      {tool.desc}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      {tool.requireDoc
                        ? activeTab
                          ? tr('当前文档就绪', 'Document ready')
                          : tr('需打开文档', 'Requires an open document')
                        : tr('无需打开文档', 'Works without a document')}
                    </span>
                    <span className="text-indigo-400 group-hover:underline font-medium">{tr('点击启动 →', 'Launch →')}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredTools.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-2">
              <Search className="w-8 h-8 opacity-40 text-slate-400" />
              <p className="text-xs">{tr(`未找到匹配“${searchQuery}”的工具`, `No tools match "${searchQuery}"`)}</p>
            </div>
          )}
        </div>

        {/* 底部状态提示条 */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              {tr('当前文档：', 'Current document: ')}
              <strong className="text-slate-200 font-mono">{activeTab ? activeTab.fileName : tr('暂无', 'None')}</strong>
              {activeTab && tr(` (${activeTab.pageCount} 页)`, ` (${activeTab.pageCount} page(s))`)}
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            {tr('全部功能均为 Clean-Room 自研实现', 'All features are clean-room implementations')}
          </div>
        </div>
      </div>
    </div>
  )
}
