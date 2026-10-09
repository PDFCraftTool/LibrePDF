import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IElectronAPI } from '../shared/types'

const electronAPI: IElectronAPI = {
  // File dialogs
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  readPDFFile: (filePath) => ipcRenderer.invoke('pdf:read', filePath),
  getTempPdfPath: (prefix) => ipcRenderer.invoke('file:getTempPdfPath', prefix),
  saveCurrentFile: (tempPath, targetPath) => ipcRenderer.invoke('file:saveCurrentFile', tempPath, targetPath),
  writeTextFile: (targetPath, contents) => ipcRenderer.invoke('file:writeText', targetPath, contents),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  getPdfjsAsset: (kind, name) => ipcRenderer.invoke('pdfjs:asset', kind, name),
  getSystemPath: (name) => ipcRenderer.invoke('app:getPath', name),
  renameFile: (oldPath, newName) => ipcRenderer.invoke('file:rename', oldPath, newName),
  onOcrProgress: (callback) => {
    const handler = (_: any, progress: { page: number; totalPages: number; percent: number }) => callback(progress)
    ipcRenderer.on('python:ocrProgress', handler)
    return () => ipcRenderer.removeListener('python:ocrProgress', handler)
  },

  // PDF Operations
  mergePDFs: (filePaths, outputPath) => ipcRenderer.invoke('pdf:merge', filePaths, outputPath),
  splitPDF: (filePath, ranges, outputDir) => ipcRenderer.invoke('pdf:split', filePath, ranges, outputDir),
  rotatePages: (filePath, pages, angle, outputPath) => ipcRenderer.invoke('pdf:rotate', filePath, pages, angle, outputPath),
  extractPages: (filePath, pages, outputPath) => ipcRenderer.invoke('pdf:extract', filePath, pages, outputPath),
  deletePages: (filePath, pages, outputPath) => ipcRenderer.invoke('pdf:deletePages', filePath, pages, outputPath),
  reorderPages: (filePath, newOrder, outputPath) => ipcRenderer.invoke('pdf:reorder', filePath, newOrder, outputPath),
  insertBlankPage: (filePath, targetIndex, width, height, outputPath) =>
    ipcRenderer.invoke('pdf:insertBlankPage', filePath, targetIndex, width, height, outputPath),
  addWatermark: (filePath, options, outputPath) => ipcRenderer.invoke('pdf:watermark', filePath, options, outputPath),
  encryptPDF: (filePath, options, outputPath) => ipcRenderer.invoke('pdf:encrypt', filePath, options, outputPath),
  applyBatesNumbering: (filePath, options, outputPath) => ipcRenderer.invoke('pdf:bates', filePath, options, outputPath),

  // Poppler
  popplerExtractText: (filePath, options) => ipcRenderer.invoke('poppler:extractText', filePath, options),
  popplerExtractImages: (filePath, outputDir) => ipcRenderer.invoke('poppler:extractImages', filePath, outputDir),
  popplerGetInfo: (filePath) => ipcRenderer.invoke('poppler:getInfo', filePath),

  // Security
  saveSecureKey: (service, key, value) => ipcRenderer.invoke('security:saveKey', service, key, value),
  getSecureKey: (service, key) => ipcRenderer.invoke('security:getKey', service, key),

  // AI
  checkOllamaStatus: (baseUrl) => ipcRenderer.invoke('ai:checkOllama', baseUrl),
  callAIModel: (config, messages) => ipcRenderer.invoke('ai:callModel', config, messages),

  // Python Intelligence Sidecar
  pythonCheckEnv: () => ipcRenderer.invoke('python:checkEnv'),
  pythonOcrSandwich: (inputPath, outputPath, dpi) => ipcRenderer.invoke('python:ocrSandwich', inputPath, outputPath, dpi),
  pythonExtractTables: (inputPath, outputPath, pages) => ipcRenderer.invoke('python:extractTables', inputPath, outputPath, pages),
  pythonGetTextBlocks: (inputPath, pageNum) => ipcRenderer.invoke('python:getTextBlocks', inputPath, pageNum),
  pythonEditText: (inputPath, outputPath, pageNum, rect, newText, fontSize) =>
    ipcRenderer.invoke('python:editText', inputPath, outputPath, pageNum, rect, newText, fontSize),
  pythonRedact: (inputPath, outputPath, pageNum, rects, pattern, fillColor) =>
    ipcRenderer.invoke('python:redact', inputPath, outputPath, pageNum, rects, pattern, fillColor),
  pythonAddAnnotation: (inputPath, outputPath, pageNum, annotType, options) =>
    ipcRenderer.invoke('python:addAnnotation', inputPath, outputPath, pageNum, annotType, options),
  pythonQueryRAG: (inputPath, query) => ipcRenderer.invoke('python:queryRAG', inputPath, query),

  // AcroForms
  pdfGetFormFields: (filePath) => ipcRenderer.invoke('pdf:getFormFields', filePath),
  pdfFillFormFields: (filePath, fieldValues, outputPath) =>
    ipcRenderer.invoke('pdf:fillFormFields', filePath, fieldValues, outputPath),
  pdfFlattenForm: (filePath, outputPath) => ipcRenderer.invoke('pdf:flattenForm', filePath, outputPath),

  // 页面拼印与排版 (Bento & Stirling)
  pdfNUp: (filePath, n, drawBorder, outputPath) =>
    ipcRenderer.invoke('pdf:nUp', filePath, n, drawBorder, outputPath),
  pdfPosterize: (filePath, pageNumber, rows, cols, outputPath) =>
    ipcRenderer.invoke('pdf:posterize', filePath, pageNumber, rows, cols, outputPath),
  pdfBooklet: (filePath, outputPath) =>
    ipcRenderer.invoke('pdf:booklet', filePath, outputPath),
  pdfSanitize: (filePath, outputPath) =>
    ipcRenderer.invoke('pdf:sanitize', filePath, outputPath),
  pdfUpdateMetadata: (filePath, metadata, outputPath) =>
    ipcRenderer.invoke('pdf:updateMetadata', filePath, metadata, outputPath),
  pdfCropOrMargin: (filePath, margins, mode, outputPath) =>
    ipcRenderer.invoke('pdf:cropOrMargin', filePath, margins, mode, outputPath),
  imagesToPDF: (imagePaths, pageSize, outputPath) =>
    ipcRenderer.invoke('pdf:imagesToPDF', imagePaths, pageSize, outputPath),

  // 图像增强与特效 (Python 侧车)
  pythonScannerEffect: (inputPath, outputPath, dpi, noise, angle) =>
    ipcRenderer.invoke('python:scannerEffect', inputPath, outputPath, dpi, noise, angle),
  pythonAutoDeskew: (inputPath, outputPath) =>
    ipcRenderer.invoke('python:autoDeskew', inputPath, outputPath),
  pythonRemoveBlankPages: (inputPath, outputPath) =>
    ipcRenderer.invoke('python:removeBlankPages', inputPath, outputPath),
  pythonGrayscaleInvert: (inputPath, outputPath, mode) =>
    ipcRenderer.invoke('python:grayscaleInvert', inputPath, outputPath, mode),
  pythonComparePDFs: (inputPath1, inputPath2, outputPath, dpi) =>
    ipcRenderer.invoke('python:comparePDFs', inputPath1, inputPath2, outputPath, dpi),

  // 高阶增量工具 (Stirling 完整矩阵对标)
  pdfCompress: (filePath, outputPath, level) =>
    ipcRenderer.invoke('pdf:compress', filePath, outputPath, level),
  pdfRepair: (filePath, outputPath) =>
    ipcRenderer.invoke('pdf:repair', filePath, outputPath),
  pdfOverlay: (foregroundPath, backgroundPath, outputPath) =>
    ipcRenderer.invoke('pdf:overlay', foregroundPath, backgroundPath, outputPath),
  pdfAddPageNumbers: (filePath, options, outputPath) =>
    ipcRenderer.invoke('pdf:addPageNumbers', filePath, options, outputPath),
  pdfToSingleContinuousPage: (filePath, outputPath) =>
    ipcRenderer.invoke('pdf:toSingleContinuousPage', filePath, outputPath),
  pdfRemoveAnnotations: (filePath, outputPath) =>
    ipcRenderer.invoke('pdf:removeAnnotations', filePath, outputPath),
  pdfRemoveImages: (filePath, outputPath) =>
    ipcRenderer.invoke('pdf:removeImages', filePath, outputPath),
  pdfAddStampOrSignature: (filePath, imagePath, options, outputPath) =>
    ipcRenderer.invoke('pdf:addStampOrSignature', filePath, imagePath, options, outputPath),
  pdfAutoRename: (filePath) =>
    ipcRenderer.invoke('pdf:autoRename', filePath),

  // 全量高级特性 (Word互转、TOC目录编辑、空白页拆分、自动整页旋转、网页转PDF、解密、附件、签名校验)
  pdfToWord: (inputPath, outputPath) =>
    ipcRenderer.invoke('pdf:toWord', inputPath, outputPath),
  pdfGetToc: (inputPath) =>
    ipcRenderer.invoke('pdf:getToc', inputPath),
  pdfSetToc: (inputPath, outputPath, tocData) =>
    ipcRenderer.invoke('pdf:setToc', inputPath, outputPath, tocData),
  pdfSplitByBlankPages: (inputPath, outputDir) =>
    ipcRenderer.invoke('pdf:splitByBlankPages', inputPath, outputDir),
  pdfAutoRotate: (inputPath, outputPath) =>
    ipcRenderer.invoke('pdf:autoRotate', inputPath, outputPath),
  pdfRemovePassword: (inputPath, password, outputPath) =>
    ipcRenderer.invoke('pdf:removePassword', inputPath, password, outputPath),
  pdfAddAttachment: (inputPath, attachFile, outputPath) =>
    ipcRenderer.invoke('pdf:addAttachment', inputPath, attachFile, outputPath),
  pdfExtractAttachments: (inputPath, outputDir) =>
    ipcRenderer.invoke('pdf:extractAttachments', inputPath, outputDir),
  pdfValidateSignatures: (inputPath) =>
    ipcRenderer.invoke('pdf:validateSignatures', inputPath),
  htmlToPdf: (source, outputPath, options) =>
    ipcRenderer.invoke('pdf:htmlToPdf', source, outputPath, options),

  // 旗舰级扩展 (条码拆分、P12签名、PDF/A归档、表单设计器)
  pdfSplitByBarcode: (inputPath, outputDir) =>
    ipcRenderer.invoke('pdf:splitByBarcode', inputPath, outputDir),
  pdfSignP12: (inputPath, p12Path, password, outputPath, options) =>
    ipcRenderer.invoke('pdf:signP12', inputPath, p12Path, password, outputPath, options),
  pdfConvertToPdfA: (inputPath, outputPath, conformance) =>
    ipcRenderer.invoke('pdf:convertToPdfA', inputPath, outputPath, conformance),
  pdfAddFormFields: (filePath, fields, outputPath) =>
    ipcRenderer.invoke('pdf:addFormFields', filePath, fields, outputPath),

  // 全满贯扩展 (按大小/书签拆分、画幅缩放、Markdown/文本/漫画/Office转PDF、PDF转HTML/PPTX)
  pdfSplitBySize: (filePath, maxSizeMB, outputDir) =>
    ipcRenderer.invoke('pdf:splitBySize', filePath, maxSizeMB, outputDir),
  pdfScalePageSize: (filePath, targetStandard, outputPath) =>
    ipcRenderer.invoke('pdf:scalePageSize', filePath, targetStandard, outputPath),
  pdfSplitByBookmarks: (inputPath, outputDir) =>
    ipcRenderer.invoke('pdf:splitByBookmarks', inputPath, outputDir),
  pdfTextOrMarkdownToPdf: (inputPath, outputPath) =>
    ipcRenderer.invoke('pdf:textOrMarkdownToPdf', inputPath, outputPath),
  pdfComicToPdf: (comicPath, outputPath) =>
    ipcRenderer.invoke('pdf:comicToPdf', comicPath, outputPath),
  pdfToHtml: (inputPath, outputPath) =>
    ipcRenderer.invoke('pdf:pdfToHtml', inputPath, outputPath),
  pdfToPptx: (inputPath, outputPath, dpi) =>
    ipcRenderer.invoke('pdf:pdfToPptx', inputPath, outputPath, dpi),
  pdfOfficeToPdf: (inputPath, outputPath) =>
    ipcRenderer.invoke('pdf:officeToPdf', inputPath, outputPath),
  pdfToImages: (inputPath, outputDir, options) =>
    ipcRenderer.invoke('pdf:toImages', inputPath, outputDir, options),

  // Hot Folder
  hotFolderStart: (config) => ipcRenderer.invoke('hotfolder:start', config),
  hotFolderStop: () => ipcRenderer.invoke('hotfolder:stop'),
  hotFolderGetStatus: () => ipcRenderer.invoke('hotfolder:getStatus'),
  onHotFolderLog: (callback) => {
    const handler = (_: any, log: string) => callback(log)
    ipcRenderer.on('hotfolder:log', handler)
    return () => ipcRenderer.removeListener('hotfolder:log', handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
console.log('[Preload] contextBridge exposed electronAPI successfully')
