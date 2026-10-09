export interface PDFMetadata {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  creator?: string
  producer?: string
  creationDate?: string
  modificationDate?: string
  pageCount: number
  fileSize: number
  isEncrypted: boolean
  pages: {
    pageNumber: number
    width: number
    height: number
    rotation: number
  }[]
}

export interface PDFPageOperationResult {
  success: boolean
  outputPath?: string
  message?: string
  error?: string
  pageCount?: number
  totalPages?: number
}

export type CompressLevel = 'low' | 'medium' | 'high'

export interface CompressResult extends PDFPageOperationResult {
  originalSize?: number
  compressedSize?: number
  ratio?: number
  optimized?: boolean
}

export interface RepairResult extends PDFPageOperationResult {
  wasDamaged?: boolean
  badPages?: number[]
}

export interface SanitizeResult extends PDFPageOperationResult {
  removed?: { metadataFields: string[]; embeddedFiles: number; javascript: boolean }
}

export interface SignP12Options {
  reason?: string
  location?: string
  tsaUrl?: string
  /** 可见签名所在页（从 1 开始） */
  page?: number
  /** 可见签名区域，PDF 坐标系 [x1, y1, x2, y2]（左下角原点）；省略则为不可见签名 */
  rect?: number[]
}

export interface SignP12Result {
  success: boolean
  outputPath?: string
  signer?: string
  reason?: string
  hasTimestamp?: boolean
  visible?: boolean
  page?: number
  warning?: string
  error?: string
}

export interface SignatureInfo {
  name: string
  /** 文档内容自签名后未被篡改 */
  intact: boolean
  /** 签名值通过证书公钥验证 */
  valid: boolean
  /** 证书链可追溯到受信任根证书 */
  trusted: boolean
  signer?: string
  issuer?: string
  signingTime?: string | null
  hasTimestamp?: boolean
  coverage?: string
  error?: string
  page?: number
  value?: string
}

export interface SignatureValidationResult {
  success: boolean
  hasSignatures?: boolean
  signatureCount?: number
  signatures?: SignatureInfo[]
  /** false 表示未安装 pyHanko，仅枚举了签名域 */
  cryptoVerified?: boolean
  note?: string
  error?: string
}

export interface PdfAResult {
  success: boolean
  outputPath?: string
  conformance?: string
  pageCount?: number
  rasterizedPages?: number[]
  removedAnnotations?: number
  checks?: { item: string; ok: boolean; detail?: string }[]
  selfCheckPassed?: boolean
  error?: string
}

export interface WatermarkOptions {
  text: string
  fontSize?: number
  opacity?: number // 0.0 - 1.0
  rotation?: number // in degrees e.g. 45
  color?: string // hex e.g. '#ff0000'
  position?: 'center' | 'tiled' | 'header' | 'footer'
  pages?: number[] // all if omitted
}

export interface EncryptionOptions {
  userPassword?: string
  ownerPassword?: string
  permissions?: {
    printing?: 'highResolution' | 'lowResolution' | false
    modifying?: boolean
    copying?: boolean
    annotating?: boolean
    fillingForms?: boolean
    contentAccessibility?: boolean
    documentAssembly?: boolean
  }
}

export interface BatesOptions {
  prefix?: string
  suffix?: string
  startNumber: number
  digits: number
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center'
  fontSize?: number
  color?: string
}

export interface FormFieldDefinition {
  type: 'text' | 'checkbox' | 'radio' | 'dropdown'
  name: string
  page: number
  x: number
  y: number
  width: number
  height: number
  value?: string
  optionValue?: string
  options?: string[]
}

// AI Agent Types
export type AIProvider = 'ollama' | 'lmstudio' | 'openai' | 'claude' | 'deepseek' | 'gemini'

export interface AIConfig {
  provider: AIProvider
  baseUrl: string
  apiKey?: string // Encrypted on local machine
  model: string
  temperature?: number
  privacySanitizeRequired?: boolean
}

export interface AgentAction {
  id: string
  toolName: string
  title: string
  parameters: Record<string, any>
  privacyAuditRequired: boolean
  sanitizedSummary?: string
  status: 'pending' | 'reviewing' | 'executing' | 'completed' | 'failed'
  result?: any
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  actions?: AgentAction[]
  citations?: { page: number; text: string; score: number }[]
}

// Electron IPC API definition
export interface IElectronAPI {
  // File dialogs
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[]; multiSelections?: boolean; openDirectory?: boolean }) => Promise<string[] | null>
  saveFileDialog: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  readPDFFile: (filePath: string) => Promise<{ data: Uint8Array; metadata: PDFMetadata }>
  
  // PDF Operations
  mergePDFs: (filePaths: string[], outputPath: string) => Promise<PDFPageOperationResult>
  splitPDF: (filePath: string, ranges: { start: number; end: number }[], outputDir: string) => Promise<PDFPageOperationResult>
  rotatePages: (filePath: string, pages: number[], angle: number, outputPath: string) => Promise<PDFPageOperationResult>
  extractPages: (filePath: string, pages: number[], outputPath: string) => Promise<PDFPageOperationResult>
  deletePages: (filePath: string, pages: number[], outputPath: string) => Promise<PDFPageOperationResult>
  reorderPages: (filePath: string, newOrder: number[], outputPath: string) => Promise<PDFPageOperationResult>
  insertBlankPage: (filePath: string, targetIndex: number, width?: number, height?: number, outputPath?: string) => Promise<PDFPageOperationResult>
  addWatermark: (filePath: string, options: WatermarkOptions, outputPath: string) => Promise<PDFPageOperationResult>
  encryptPDF: (filePath: string, options: EncryptionOptions, outputPath: string) => Promise<PDFPageOperationResult>
  applyBatesNumbering: (filePath: string, options: BatesOptions, outputPath: string) => Promise<PDFPageOperationResult>
  
  // Poppler Tools
  popplerExtractText: (filePath: string, options?: { layout?: boolean; pageStart?: number; pageEnd?: number }) => Promise<{ success: boolean; text?: string; error?: string }>
  popplerExtractImages: (filePath: string, outputDir: string) => Promise<{ success: boolean; imagePaths?: string[]; count?: number; error?: string }>
  popplerGetInfo: (filePath: string) => Promise<{ success: boolean; info?: Record<string, string>; error?: string }>

  // Security & Keychain
  saveSecureKey: (service: string, key: string, value: string) => Promise<boolean>
  getSecureKey: (service: string, key: string) => Promise<string | null>
  
  // AI Agent & Ollama
  checkOllamaStatus: (baseUrl?: string) => Promise<{ running: boolean; models: string[] }>
  callAIModel: (config: AIConfig, messages: { role: string; content: string }[]) => Promise<{ text: string; error?: string }>

  // AcroForms
  pdfGetFormFields: (filePath: string) => Promise<{ success: boolean; fields?: { name: string; type: string; value?: string }[]; error?: string }>
  pdfFillFormFields: (filePath: string, fieldValues: Record<string, string>, outputPath: string) => Promise<PDFPageOperationResult>
  pdfFlattenForm: (filePath: string, outputPath: string) => Promise<PDFPageOperationResult>

  // Python Intelligence Sidecar (RapidOCR, Text Edit, Redaction, Annotations, RAG)
  pythonCheckEnv: () => Promise<{ ready: boolean; engine?: string; version?: string; error?: string }>
  pythonOcrSandwich: (inputPath: string, outputPath: string, dpi?: number) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; totalWords?: number; error?: string }>
  pythonExtractTables: (inputPath: string, outputPath: string, pages?: number[]) => Promise<{ success: boolean; outputPath?: string; tableCount?: number; markdown?: string; error?: string }>
  pythonGetTextBlocks: (inputPath: string, pageNum: number) => Promise<{ success: boolean; blocks?: any[]; pageWidth?: number; pageHeight?: number; error?: string }>
  pythonEditText: (inputPath: string, outputPath: string, pageNum: number, rect: number[], newText: string, fontSize?: number) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  pythonRedact: (inputPath: string, outputPath: string, pageNum?: number, rects?: number[][], pattern?: string, fillColor?: number[]) => Promise<{ success: boolean; outputPath?: string; redactedCount?: number; error?: string }>
  pythonAddAnnotation: (inputPath: string, outputPath: string, pageNum: number, annotType: string, options: { rect?: number[]; points?: number[][]; color?: number[]; content?: string }) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  pythonQueryRAG: (inputPath: string, query: string) => Promise<{ success: boolean; citations?: { page: number; text: string; score: number }[]; error?: string }>

  // 页面拼印与排版 (Bento & Stirling)
  pdfNUp: (filePath: string, n: 2 | 4 | 9, drawBorder: boolean, outputPath: string) => Promise<PDFPageOperationResult>
  pdfPosterize: (filePath: string, pageNumber: number, rows: number, cols: number, outputPath: string) => Promise<PDFPageOperationResult>
  pdfBooklet: (filePath: string, outputPath: string) => Promise<PDFPageOperationResult>
  pdfSanitize: (filePath: string, outputPath: string) => Promise<SanitizeResult>
  pdfUpdateMetadata: (
    filePath: string,
    metadata: { title?: string; author?: string; subject?: string; keywords?: string[]; creator?: string },
    outputPath: string
  ) => Promise<PDFPageOperationResult>
  pdfCropOrMargin: (filePath: string, margins: { top: number; right: number; bottom: number; left: number }, mode: 'crop' | 'pad', outputPath: string) => Promise<PDFPageOperationResult>
  imagesToPDF: (imagePaths: string[], pageSize: 'fit' | 'A4', outputPath: string) => Promise<PDFPageOperationResult>

  // 图像增强与特效 (Python 侧车)
  pythonScannerEffect: (inputPath: string, outputPath: string, dpi?: number, noise?: number, angle?: number) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pythonAutoDeskew: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pythonRemoveBlankPages: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; removedPages?: number[]; remainingPages?: number; error?: string }>
  pythonGrayscaleInvert: (inputPath: string, outputPath: string, mode?: 'grayscale' | 'invert') => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pythonComparePDFs: (inputPath1: string, inputPath2: string, outputPath: string, dpi?: number) => Promise<{ success: boolean; outputPath?: string; totalPages?: number; diffCount?: number; diffPages?: number[]; error?: string }>

  // 高阶增量工具 (Stirling 完整矩阵对标)
  pdfCompress: (filePath: string, outputPath: string, level?: CompressLevel) => Promise<CompressResult>
  pdfRepair: (filePath: string, outputPath: string) => Promise<RepairResult>
  pdfOverlay: (foregroundPath: string, backgroundPath: string, outputPath: string) => Promise<PDFPageOperationResult>
  pdfAddPageNumbers: (filePath: string, options: { format?: string; position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'; startPage?: number; fontSize?: number; color?: string; skipFirstPage?: boolean }, outputPath: string) => Promise<PDFPageOperationResult>
  pdfToSingleContinuousPage: (filePath: string, outputPath: string) => Promise<PDFPageOperationResult>
  pdfRemoveAnnotations: (filePath: string, outputPath: string) => Promise<PDFPageOperationResult>
  pdfRemoveImages: (filePath: string, outputPath: string) => Promise<PDFPageOperationResult>
  pdfAddStampOrSignature: (filePath: string, imagePath: string, options: { pageNumber: number; x: number; y: number; width?: number; height?: number }, outputPath: string) => Promise<PDFPageOperationResult>
  pdfAutoRename: (filePath: string) => Promise<{ success: boolean; suggestedName?: string; error?: string }>

  // 全量高级特性 (Word互转、TOC目录编辑、空白页拆分、自动整页旋转、网页转PDF、解密、附件、签名校验)
  pdfToWord: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pdfGetToc: (inputPath: string) => Promise<{ success: boolean; toc?: { level: number; title: string; page: number }[]; totalPages?: number; error?: string }>
  pdfSetToc: (inputPath: string, outputPath: string, tocData: { level: number; title: string; page: number }[]) => Promise<{ success: boolean; outputPath?: string; itemCount?: number; error?: string }>
  pdfSplitByBlankPages: (inputPath: string, outputDir: string) => Promise<{ success: boolean; outputFiles?: string[]; partsCount?: number; blankPagesCount?: number; error?: string }>
  pdfAutoRotate: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; rotatedPages?: number[]; count?: number; error?: string }>
  pdfRemovePassword: (inputPath: string, password: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; error?: string }>
  pdfAddAttachment: (inputPath: string, attachFile: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; fileName?: string; error?: string }>
  pdfExtractAttachments: (inputPath: string, outputDir: string) => Promise<{ success: boolean; files?: string[]; count?: number; error?: string }>
  pdfValidateSignatures: (inputPath: string) => Promise<SignatureValidationResult>
  htmlToPdf: (source: { url?: string; html?: string }, outputPath: string, options?: { landscape?: boolean; pageSize?: 'A4' | 'A3' | 'Letter'; printBackground?: boolean }) => Promise<{ success: boolean; outputPath?: string; error?: string }>

  // 旗舰级扩展 (条形码拆分、表单设计器、P12数字签名、PDF/A归档)
  pdfSplitByBarcode: (inputPath: string, outputDir: string) => Promise<{ success: boolean; outputFiles?: string[]; count?: number; barcodeCount?: number; error?: string }>
  pdfSignP12: (inputPath: string, p12Path: string, password: string, outputPath: string, options?: SignP12Options) => Promise<SignP12Result>
  pdfConvertToPdfA: (inputPath: string, outputPath: string, conformance?: '1b' | '2b' | '3b') => Promise<PdfAResult>
  pdfAddFormFields: (filePath: string, fields: FormFieldDefinition[], outputPath: string) => Promise<PDFPageOperationResult>

  // 全满贯扩展 (按大小/书签拆分、画幅缩放、Markdown/文本/漫画/Office转PDF、PDF转HTML/PPTX)
  pdfSplitBySize: (filePath: string, maxSizeMB: number, outputDir: string) => Promise<{ success: boolean; outputFiles?: string[]; count?: number; error?: string }>
  pdfScalePageSize: (filePath: string, targetStandard: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal', outputPath: string) => Promise<PDFPageOperationResult>
  pdfSplitByBookmarks: (inputPath: string, outputDir: string) => Promise<{ success: boolean; outputFiles?: { title: string; startPage: number; endPage: number; filePath: string }[]; count?: number; error?: string }>
  pdfTextOrMarkdownToPdf: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pdfComicToPdf: (comicPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pdfToHtml: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; pageCount?: number; error?: string }>
  pdfToPptx: (inputPath: string, outputPath: string, dpi?: number) => Promise<{ success: boolean; outputPath?: string; slideCount?: number; error?: string }>
  pdfOfficeToPdf: (inputPath: string, outputPath: string) => Promise<{ success: boolean; outputPath?: string; engine?: string; error?: string }>
  pdfToImages: (inputPath: string, outputDir: string, options?: { format?: 'png' | 'jpg' | 'webp' | 'tiff'; dpi?: number; pages?: number[] }) => Promise<{ success: boolean; outputFiles?: string[]; count?: number; outputDir?: string; format?: string; dpi?: number; error?: string }>

  // Hot Folder
  hotFolderStart: (config: any) => Promise<{ success: boolean; message: string }>
  hotFolderStop: () => Promise<{ success: boolean }>
  hotFolderGetStatus: () => Promise<{ isRunning: boolean; config: any }>
  onHotFolderLog?: (callback: (log: string) => void) => () => void
  // File Management Helpers
  getTempPdfPath: (prefix?: string) => Promise<string>
  saveCurrentFile: (tempPath: string, targetPath: string) => Promise<{ success: boolean; error?: string }>
  writeTextFile: (targetPath: string, contents: string) => Promise<{ success: boolean; error?: string }>
  getDroppedFilePath: (file: File) => string
  showItemInFolder: (targetPath: string) => Promise<boolean>
  getPdfjsAsset: (kind: 'cmaps' | 'standard_fonts', name: string) => Promise<Uint8Array>
  getSystemPath: (name: 'documents' | 'downloads' | 'desktop' | 'home') => Promise<string>
  renameFile: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  onOcrProgress: (callback: (progress: { page: number; totalPages: number; percent: number }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}

