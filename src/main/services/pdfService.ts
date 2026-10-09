import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, degrees, rgb, StandardFonts, PDFPage, PDFName, PDFDict, PDFStream } from 'pdf-lib'
import type {
  PDFMetadata,
  PDFPageOperationResult,
  WatermarkOptions,
  EncryptionOptions,
  BatesOptions,
  FormFieldDefinition
} from '../../shared/types'
import { PythonService } from './pythonService'

/** pdf-lib 标准字体使用 WinAnsi 编码，超出 Latin-1 范围的字符（中文、日文等）无法绘制 */
const needsUnicodeFont = (text: string | undefined) => /[^\x00-\xFF]/.test(text || '')

export class PDFService {
  /**
   * 确保页面拥有合法的 Contents 流，避免 pdf-lib embedPage 在遇到完全空白页时报错
   */
  private ensurePageHasContents(page: PDFPage) {
    if (!page.node.Contents()) {
      page.drawLine({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, opacity: 0 })
    }
  }
  /**
   * 读取 PDF 元数据及基本页面几何信息
   */
  async getMetadata(filePath: string): Promise<{ data: Uint8Array; metadata: PDFMetadata }> {
    const fileBuffer = await fs.readFile(filePath)
    const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true })
    const stat = await fs.stat(filePath)
    
    const pageCount = pdfDoc.getPageCount()
    const pagesInfo = []

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i)
      const { width, height } = page.getSize()
      const rotation = page.getRotation().angle
      pagesInfo.push({
        pageNumber: i + 1,
        width,
        height,
        rotation
      })
    }

    const metadata: PDFMetadata = {
      title: pdfDoc.getTitle(),
      author: pdfDoc.getAuthor(),
      subject: pdfDoc.getSubject(),
      keywords: pdfDoc.getKeywords() ? pdfDoc.getKeywords()?.split(';') : [],
      creator: pdfDoc.getCreator(),
      producer: pdfDoc.getProducer(),
      creationDate: pdfDoc.getCreationDate()?.toISOString(),
      modificationDate: pdfDoc.getModificationDate()?.toISOString(),
      pageCount,
      fileSize: stat.size,
      isEncrypted: pdfDoc.isEncrypted,
      pages: pagesInfo
    }

    return {
      data: new Uint8Array(fileBuffer),
      metadata
    }
  }

  /**
   * 合并多个 PDF 文件
   */
  async mergePDFs(filePaths: string[], outputPath: string): Promise<PDFPageOperationResult> {
    try {
      // 空输入直接报错，避免生成 0 页的“成功”PDF
      if (!filePaths || filePaths.length === 0) {
        return {
          success: false,
          message: '没有可合并的 PDF 文件',
          error: '没有可合并的 PDF 文件'
        }
      }

      const mergedPdf = await PDFDocument.create()

      for (const filePath of filePaths) {
        const fileBytes = await fs.readFile(filePath)
        const pdf = await PDFDocument.load(fileBytes)
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
        copiedPages.forEach((page) => mergedPdf.addPage(page))
      }

      // 所有输入均无法读取到有效页面时同样视为失败
      if (mergedPdf.getPageCount() === 0) {
        return {
          success: false,
          message: '没有可合并的 PDF 文件',
          error: '没有可合并的 PDF 文件'
        }
      }

      const mergedPdfBytes = await mergedPdf.save()
      await fs.writeFile(outputPath, mergedPdfBytes)

      return {
        success: true,
        outputPath,
        pageCount: mergedPdf.getPageCount()
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '合并 PDF 失败'
      }
    }
  }

  /**
   * 按页码区间拆分 PDF
   */
  async splitPDF(
    filePath: string,
    ranges: { start: number; end: number }[],
    outputDir: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const srcPdf = await PDFDocument.load(fileBytes)
      const totalPages = srcPdf.getPageCount()
      const baseName = path.basename(filePath, path.extname(filePath))
      await fs.mkdir(outputDir, { recursive: true })

      let written = 0
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]
        const start = Math.max(1, Math.min(range.start, range.end))
        const end = Math.min(totalPages, Math.max(range.start, range.end))
        if (start > end) continue
        written++

        const newPdf = await PDFDocument.create()
        const pageIndices = []
        for (let p = start - 1; p < end; p++) {
          pageIndices.push(p)
        }

        const copiedPages = await newPdf.copyPages(srcPdf, pageIndices)
        copiedPages.forEach((page) => newPdf.addPage(page))

        const outPath = path.join(outputDir, `${baseName}_part_${written}_p${start}-p${end}.pdf`)
        const bytes = await newPdf.save()
        await fs.writeFile(outPath, bytes)
      }

      if (written === 0) {
        return { success: false, message: '没有有效的页码区间可拆分' }
      }

      return {
        success: true,
        outputPath: outputDir,
        pageCount: written,
        message: `已拆分为 ${written} 个文件`
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '拆分 PDF 失败'
      }
    }
  }

  /**
   * 旋转指定页面
   */
  async rotatePages(
    filePath: string,
    pages: number[],
    angle: number,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const totalPages = pdfDoc.getPageCount()

      const targetPages = pages.length > 0 ? pages : Array.from({ length: totalPages }, (_, i) => i + 1)

      for (const pageNum of targetPages) {
        if (pageNum >= 1 && pageNum <= totalPages) {
          const page = pdfDoc.getPage(pageNum - 1)
          const currentRotation = page.getRotation().angle
          // 归一化到 0/90/180/270，避免逆时针旋转产生负数 /Rotate
          page.setRotation(degrees((((currentRotation + angle) % 360) + 360) % 360))
        }
      }

      const bytes = await pdfDoc.save()
      await fs.writeFile(outputPath, bytes)

      return {
        success: true,
        outputPath,
        pageCount: totalPages
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '旋转页面失败'
      }
    }
  }

  /**
   * 提取指定页码集合为新文档
   */
  async extractPages(
    filePath: string,
    pages: number[],
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const srcPdf = await PDFDocument.load(fileBytes)
      const totalPages = srcPdf.getPageCount()

      const newPdf = await PDFDocument.create()
      const validIndices = pages
        .filter((p) => p >= 1 && p <= totalPages)
        .map((p) => p - 1)

      // 页码全部越界时报错，避免输出 0 页的“成功”PDF；部分越界则跳过并保持宽容
      if (validIndices.length === 0) {
        return {
          success: false,
          message: '指定的页码均超出文档范围',
          error: '指定的页码均超出文档范围'
        }
      }

      const copiedPages = await newPdf.copyPages(srcPdf, validIndices)
      copiedPages.forEach((page) => newPdf.addPage(page))

      const bytes = await newPdf.save()
      await fs.writeFile(outputPath, bytes)

      return {
        success: true,
        outputPath,
        pageCount: newPdf.getPageCount()
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '提取页面失败'
      }
    }
  }

  /**
   * 删除指定页码
   */
  async deletePages(
    filePath: string,
    pages: number[],
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const totalPages = pdfDoc.getPageCount()

      const pagesToRemove = new Set(pages.filter((p) => p >= 1 && p <= totalPages))
      if (pagesToRemove.size >= totalPages) {
        return { success: false, message: '不能删除所有页面，PDF 必须至少保留一页。' }
      }

      // 在原文档上直接删除（从后往前），保留书签、元数据、表单等文档级结构
      const sorted = Array.from(pagesToRemove).sort((a, b) => b - a)
      for (const p of sorted) pdfDoc.removePage(p - 1)

      const bytes = await pdfDoc.save()
      await fs.writeFile(outputPath, bytes)

      return {
        success: true,
        outputPath,
        pageCount: pdfDoc.getPageCount()
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '删除页面失败'
      }
    }
  }

  /**
   * 重新排列页面顺序
   */
  async reorderPages(
    filePath: string,
    newOrder: number[], // 1-based page numbers
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const srcPdf = await PDFDocument.load(fileBytes)
      const totalPages = srcPdf.getPageCount()

      const indices = newOrder
        .filter((p) => p >= 1 && p <= totalPages)
        .map((p) => p - 1)
      if (indices.length === 0) {
        return { success: false, message: '页面顺序为空' }
      }

      // 无重复页时在原文档内移动页面对象，书签/链接/表单引用依然有效
      if (new Set(indices).size === indices.length) {
        const pageObjs = srcPdf.getPages()
        for (let i = totalPages - 1; i >= 0; i--) srcPdf.removePage(i)
        indices.forEach((idx, pos) => srcPdf.insertPage(pos, pageObjs[idx]))
        const bytes = await srcPdf.save()
        await fs.writeFile(outputPath, bytes)
        return { success: true, outputPath, pageCount: srcPdf.getPageCount() }
      }

      // 含重复页（如“复制页面”）时，同一页面对象不能在页树中出现两次，改为复制到新文档
      const newPdf = await PDFDocument.create()
      const copiedPages = await newPdf.copyPages(srcPdf, indices)
      copiedPages.forEach((page) => newPdf.addPage(page))

      const bytes = await newPdf.save()
      await fs.writeFile(outputPath, bytes)

      return {
        success: true,
        outputPath,
        pageCount: newPdf.getPageCount()
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '重排页面失败'
      }
    }
  }

  /**
   * 插入空白页
   */
  async insertBlankPage(
    filePath: string,
    targetIndex: number, // 0-based insertion point
    width = 595.28, // Standard A4 width
    height = 841.89, // Standard A4 height
    outputPath?: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const totalPages = pdfDoc.getPageCount()

      const safeIndex = Math.max(0, Math.min(totalPages, targetIndex))
      pdfDoc.insertPage(safeIndex, [width, height])

      const bytes = await pdfDoc.save()
      const targetOut = outputPath || filePath
      await fs.writeFile(targetOut, bytes)

      return {
        success: true,
        outputPath: targetOut,
        pageCount: pdfDoc.getPageCount()
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '插入空白页失败'
      }
    }
  }

  /**
   * 添加文本水印
   */
  async addWatermark(
    filePath: string,
    options: WatermarkOptions,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      // 标准字体只支持 WinAnsi，中文等字符交给 PyMuPDF（内置 CJK 字体）绘制
      if (needsUnicodeFont(options.text)) {
        const res = await this.pythonService.textWatermark(filePath, outputPath, { ...options })
        return res.success ? { success: true, outputPath, pageCount: res.pageCount } : { success: false, message: res.error, error: res.error }
      }
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      
      const totalPages = pdfDoc.getPageCount()
      const fontSize = options.fontSize || 48
      const opacity = options.opacity !== undefined ? options.opacity : 0.25
      const rotationDeg = options.rotation !== undefined ? options.rotation : 45
      const position = options.position || 'center'
      
      const targetPages = options.pages && options.pages.length > 0
        ? options.pages.filter(p => p >= 1 && p <= totalPages).map(p => p - 1)
        : Array.from({ length: totalPages }, (_, i) => i)

      let markColor = rgb(0.6, 0.6, 0.6)
      if (options.color && typeof options.color === 'string') {
        const hex = options.color.replace('#', '')
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16) / 255
          const g = parseInt(hex.substring(2, 4), 16) / 255
          const b = parseInt(hex.substring(4, 6), 16) / 255
          markColor = rgb(r, g, b)
        }
      }

      for (const pageIdx of targetPages) {
        const page = pdfDoc.getPage(pageIdx)
        const { width, height } = page.getSize()
        const textWidth = font.widthOfTextAtSize(options.text, fontSize)
        const textHeight = font.heightAtSize(fontSize)

        if (position === 'center') {
          page.drawText(options.text, {
            x: (width - textWidth) / 2,
            y: (height - textHeight) / 2,
            size: fontSize,
            font,
            color: markColor,
            opacity,
            rotate: degrees(rotationDeg)
          })
        } else if (position === 'tiled') {
          // 平铺水印
          const stepX = textWidth + 120
          const stepY = textHeight + 120
          for (let x = -width; x < width * 2; x += stepX) {
            for (let y = -height; y < height * 2; y += stepY) {
              page.drawText(options.text, {
                x,
                y,
                size: fontSize * 0.7,
                font,
                color: markColor,
                opacity: opacity * 0.8,
                rotate: degrees(rotationDeg)
              })
            }
          }
        } else if (position === 'header') {
          page.drawText(options.text, {
            x: (width - textWidth) / 2,
            y: height - 40,
            size: 14,
            font,
            color: markColor,
            opacity
          })
        } else if (position === 'footer') {
          page.drawText(options.text, {
            x: (width - textWidth) / 2,
            y: 30,
            size: 14,
            font,
            color: markColor,
            opacity
          })
        }
      }

      const bytes = await pdfDoc.save()
      await fs.writeFile(outputPath, bytes)

      return {
        success: true,
        outputPath,
        pageCount: totalPages
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '添加水印失败'
      }
    }
  }

  /**
   * 应用贝茨编号 (Bates Numbering)
   */
  async applyBatesNumbering(
    filePath: string,
    options: BatesOptions,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const totalPages = pdfDoc.getPageCount()

      const prefix = options.prefix || ''
      const suffix = options.suffix || ''
      const digits = options.digits || 6
      const fontSize = options.fontSize || 10
      const position = options.position || 'bottom-right'

      // 前后缀含中文等字符时交给 PyMuPDF 绘制
      if (needsUnicodeFont(prefix + suffix)) {
        const items = Array.from({ length: totalPages }, (_, i) => ({
          page: i + 1,
          text: `${prefix}${String(options.startNumber + i).padStart(digits, '0')}${suffix}`
        }))
        const res = await this.pythonService.stampPageTexts(filePath, outputPath, {
          items, position, fontSize, color: options.color || '#333333', margin: 30
        })
        return res.success ? { success: true, outputPath, pageCount: totalPages } : { success: false, message: res.error, error: res.error }
      }
      const font = await pdfDoc.embedFont(StandardFonts.CourierBold)

      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.getPage(i)
        const { width, height } = page.getSize()
        const currentNum = options.startNumber + i
        const numStr = String(currentNum).padStart(digits, '0')
        const fullText = `${prefix}${numStr}${suffix}`

        const textWidth = font.widthOfTextAtSize(fullText, fontSize)
        let x = width - textWidth - 36
        let y = 24

        if (position === 'bottom-left') {
          x = 36
          y = 24
        } else if (position === 'bottom-center') {
          x = (width - textWidth) / 2
          y = 24
        } else if (position === 'top-right') {
          x = width - textWidth - 36
          y = height - 30
        } else if (position === 'top-left') {
          x = 36
          y = height - 30
        }

        page.drawText(fullText, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2)
        })
      }

      const bytes = await pdfDoc.save()
      await fs.writeFile(outputPath, bytes)

      return {
        success: true,
        outputPath,
        pageCount: totalPages
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '应用贝茨编号失败'
      }
    }
  }

  /**
   * 读取 PDF 交互式表单 (AcroForms) 控件列表
   */
  async getFormFields(filePath: string): Promise<{ success: boolean; fields?: { name: string; type: string; value?: string }[]; error?: string }> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const form = pdfDoc.getForm()
      const rawFields = form.getFields()

      const fields = rawFields.map((f) => {
        let value = ''
        try {
          // 尝试读取文本域内容
          const textField = form.getTextField(f.getName())
          value = textField.getText() || ''
        } catch {
          try {
            const checkField = form.getCheckBox(f.getName())
            value = checkField.isChecked() ? 'true' : 'false'
          } catch {}
        }

        return {
          name: f.getName(),
          type: f.constructor.name,
          value
        }
      })

      return { success: true, fields }
    } catch (err: any) {
      return { success: false, error: err.message || '读取表单失败' }
    }
  }

  /**
   * 填充表单字段并保存
   */
  async fillFormFields(
    filePath: string,
    fieldValues: Record<string, string>,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const form = pdfDoc.getForm()

      for (const [fieldName, val] of Object.entries(fieldValues)) {
        try {
          const tf = form.getTextField(fieldName)
          tf.setText(val)
        } catch {
          try {
            const cb = form.getCheckBox(fieldName)
            if (val === 'true' || val === '1') cb.check()
            else cb.uncheck()
          } catch {}
        }
      }

      const bytes = await pdfDoc.save()
      await fs.writeFile(outputPath, bytes)

      return { success: true, outputPath }
    } catch (err: any) {
      return { success: false, message: err.message || '填充表单失败' }
    }
  }

  /**
   * 表单扁平化 (Flatten Form)：将所有交互控件固化为静态不可篡改内容
   */
  async flattenForm(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes)
      const form = pdfDoc.getForm()

      form.flatten()

      const bytes = await pdfDoc.save()
      await fs.writeFile(outputPath, bytes)

      return { success: true, outputPath }
    } catch (err: any) {
      return { success: false, message: err.message || '表单扁平化失败' }
    }
  }

  /**
   * N-Up 缩印拼版 (2/4/9 页并在单张 A4 纸上)
   */
  async nUp(
    filePath: string,
    n: 2 | 4 | 9,
    drawBorder: boolean,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const srcDoc = await PDFDocument.load(srcBytes)
      const pageCount = srcDoc.getPageCount()
      if (pageCount === 0) throw new Error('源文档无有效页面')
      srcDoc.getPages().forEach((p) => this.ensurePageHasContents(p))

      const outDoc = await PDFDocument.create()
      const isLandscape = n === 2
      const targetW = isLandscape ? 841.89 : 595.28
      const targetH = isLandscape ? 595.28 : 841.89
      const cols = n === 2 ? 2 : n === 4 ? 2 : 3
      const rows = n === 2 ? 1 : n === 4 ? 2 : 3

      const margin = 20
      const availW = targetW - margin * 2
      const availH = targetH - margin * 2
      const cellW = availW / cols
      const cellH = availH / rows

      for (let i = 0; i < pageCount; i += n) {
        const outPage = outDoc.addPage([targetW, targetH])

        for (let slot = 0; slot < n; slot++) {
          const pageIdx = i + slot
          if (pageIdx >= pageCount) break

          const embedded = await outDoc.embedPage(srcDoc.getPage(pageIdx))
          const { width: origW, height: origH } = embedded

          const scale = Math.min((cellW - 8) / origW, (cellH - 8) / origH)
          const renderW = origW * scale
          const renderH = origH * scale

          const col = slot % cols
          const row = Math.floor(slot / cols)

          const cellLeft = margin + col * cellW
          const cellBottom = targetH - margin - (row + 1) * cellH

          const renderX = cellLeft + (cellW - renderW) / 2
          const renderY = cellBottom + (cellH - renderH) / 2

          outPage.drawPage(embedded, {
            x: renderX,
            y: renderY,
            width: renderW,
            height: renderH
          })

          if (drawBorder) {
            outPage.drawRectangle({
              x: renderX - 1,
              y: renderY - 1,
              width: renderW + 2,
              height: renderH + 2,
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 0.5
            })
          }
        }
      }

      const outBytes = await outDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, totalPages: outDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || 'N-Up 拼版处理失败' }
    }
  }

  /**
   * Posterize 海报拼图打印切片 (将指定大页面切分为多个网格，跨多张 A4 打印拼接)
   */
  async posterize(
    filePath: string,
    pageNumber: number,
    rows: number,
    cols: number,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const srcDoc = await PDFDocument.load(srcBytes)
      const pageIndex = Math.max(0, pageNumber - 1)
      if (pageIndex >= srcDoc.getPageCount()) throw new Error('指定页码超出范围')

      const srcPage = srcDoc.getPage(pageIndex)
      this.ensurePageHasContents(srcPage)
      const { width: origW, height: origH } = srcPage.getSize()

      const outDoc = await PDFDocument.create()
      const a4W = 595.28
      const a4H = 841.89

      const cellW = origW / cols
      const cellH = origH / rows

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const outPage = outDoc.addPage([a4W, a4H])
          const embedded = await outDoc.embedPage(srcPage)

          const margin = 20
          const scale = Math.min((a4W - margin * 2) / cellW, (a4H - margin * 2) / cellH)

          const totalW = origW * scale
          const totalH = origH * scale

          const offsetX = margin - c * cellW * scale
          const offsetY = margin - (rows - 1 - r) * cellH * scale

          outPage.drawPage(embedded, {
            x: offsetX,
            y: offsetY,
            width: totalW,
            height: totalH
          })

          outPage.setCropBox(0, 0, a4W, a4H)
        }
      }

      const outBytes = await outDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, totalPages: outDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || '海报打印切片失败' }
    }
  }

  /**
   * Booklet 骑马钉折页小册子装订排版
   */
  async booklet(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const srcDoc = await PDFDocument.load(srcBytes)
      const origCount = srcDoc.getPageCount()
      if (origCount === 0) throw new Error('源文档无有效页面')
      srcDoc.getPages().forEach((p) => this.ensurePageHasContents(p))

      const totalPages = Math.ceil(origCount / 4) * 4
      const outDoc = await PDFDocument.create()
      const sheets = totalPages / 4
      const sheetW = 841.89
      const sheetH = 595.28
      const halfW = sheetW / 2

      for (let s = 0; s < sheets; s++) {
        const frontLeft = totalPages - 2 * s
        const frontRight = 2 * s + 1
        const backLeft = 2 * s + 2
        const backRight = totalPages - 2 * s - 1

        const pairs = [
          { left: frontLeft, right: frontRight },
          { left: backLeft, right: backRight }
        ]

        for (const pair of pairs) {
          const outPage = outDoc.addPage([sheetW, sheetH])

          if (pair.left <= origCount) {
            const embLeft = await outDoc.embedPage(srcDoc.getPage(pair.left - 1))
            const scale = Math.min((halfW - 20) / embLeft.width, (sheetH - 20) / embLeft.height)
            const rw = embLeft.width * scale
            const rh = embLeft.height * scale
            outPage.drawPage(embLeft, {
              x: (halfW - rw) / 2,
              y: (sheetH - rh) / 2,
              width: rw,
              height: rh
            })
          }

          if (pair.right <= origCount) {
            const embRight = await outDoc.embedPage(srcDoc.getPage(pair.right - 1))
            const scale = Math.min((halfW - 20) / embRight.width, (sheetH - 20) / embRight.height)
            const rw = embRight.width * scale
            const rh = embRight.height * scale
            outPage.drawPage(embRight, {
              x: halfW + (halfW - rw) / 2,
              y: (sheetH - rh) / 2,
              width: rw,
              height: rh
            })
          }

          outPage.drawLine({
            start: { x: halfW, y: 10 },
            end: { x: halfW, y: sheetH - 10 },
            thickness: 0.5,
            color: rgb(0.85, 0.85, 0.85),
            dashArray: [4, 4]
          })
        }
      }

      const outBytes = await outDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, totalPages: outDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || '小册子排版失败' }
    }
  }

  /**
   * 彻底抹除元数据与痕迹 (Sanitize / Wipe Metadata)
   */
  async sanitize(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes)

      pdfDoc.setTitle('')
      pdfDoc.setAuthor('')
      pdfDoc.setSubject('')
      pdfDoc.setKeywords([])
      pdfDoc.setProducer('PDFOpen Studio Sanitizer')
      pdfDoc.setCreator('PDFOpen Studio')
      pdfDoc.setCreationDate(new Date(0))
      pdfDoc.setModificationDate(new Date(0))

      const context = pdfDoc.context
      const catalog = pdfDoc.catalog
      catalog.delete(context.obj('Metadata'))
      catalog.delete(context.obj('PieceInfo'))
      catalog.delete(context.obj('OpenAction'))

      const outBytes = await pdfDoc.save({ useObjectStreams: false })
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath }
    } catch (err: any) {
      return { success: false, message: err.message || '元数据清除失败' }
    }
  }

  /**
   * 更新/自定义编辑元数据 (Update / Edit Metadata)
   */
  async updateMetadata(
    filePath: string,
    metadata: { title?: string; author?: string; subject?: string; keywords?: string[]; creator?: string },
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes)
      if (metadata.title !== undefined) pdfDoc.setTitle(metadata.title)
      if (metadata.author !== undefined) pdfDoc.setAuthor(metadata.author)
      if (metadata.subject !== undefined) pdfDoc.setSubject(metadata.subject)
      if (metadata.keywords !== undefined) pdfDoc.setKeywords(metadata.keywords)
      if (metadata.creator !== undefined) pdfDoc.setCreator(metadata.creator)
      pdfDoc.setModificationDate(new Date())

      const outBytes = await pdfDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath }
    } catch (err: any) {
      return { success: false, message: err.message || '更新元数据失败' }
    }
  }

  /**
   * 页面裁剪与边距扩充 (Crop / Margin Padding)
   */
  async cropOrMargin(
    filePath: string,
    margins: { top: number; right: number; bottom: number; left: number },
    mode: 'crop' | 'pad',
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes)
      const pageCount = pdfDoc.getPageCount()
      pdfDoc.getPages().forEach((p) => this.ensurePageHasContents(p))

      if (mode === 'crop') {
        for (let i = 0; i < pageCount; i++) {
          const page = pdfDoc.getPage(i)
          const { width, height } = page.getSize()
          const newX = margins.left
          const newY = margins.bottom
          const newW = Math.max(10, width - margins.left - margins.right)
          const newH = Math.max(10, height - margins.top - margins.bottom)
          page.setCropBox(newX, newY, newW, newH)
        }
        const outBytes = await pdfDoc.save()
        await fs.writeFile(outputPath, outBytes)
        return { success: true, outputPath }
      } else {
        const outDoc = await PDFDocument.create()
        for (let i = 0; i < pageCount; i++) {
          const emb = await outDoc.embedPage(pdfDoc.getPage(i))
          const newW = emb.width + margins.left + margins.right
          const newH = emb.height + margins.top + margins.bottom
          const outPage = outDoc.addPage([newW, newH])
          outPage.drawPage(emb, {
            x: margins.left,
            y: margins.bottom,
            width: emb.width,
            height: emb.height
          })
        }
        const outBytes = await outDoc.save()
        await fs.writeFile(outputPath, outBytes)
        return { success: true, outputPath }
      }
    } catch (err: any) {
      return { success: false, message: err.message || '裁剪/边距调整失败' }
    }
  }

  private pythonService = new PythonService()

  /**
   * 图片批量转 PDF (Images to PDF: 支持 JPG, PNG, WebP, TIFF, GIF, BMP 全格式)
   */
  async imagesToPDF(
    imagePaths: string[],
    pageSize: 'fit' | 'A4',
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      // 检查是否包含非 png/jpg 格式 (WebP, TIFF, GIF, BMP 等)
      const hasOtherFormats = imagePaths.some((p) => {
        const ext = path.extname(p).toLowerCase()
        return !['.png', '.jpg', '.jpeg'].includes(ext)
      })

      if (hasOtherFormats) {
        const pyRes = await this.pythonService.imagesToPdf(imagePaths, outputPath, pageSize)
        if (pyRes.success && pyRes.outputPath) {
          return { success: true, outputPath, totalPages: pyRes.pageCount }
        }
      }

      const outDoc = await PDFDocument.create()

      for (const imgPath of imagePaths) {
        const imgBytes = await fs.readFile(imgPath)
        const isPng = imgPath.toLowerCase().endsWith('.png')
        const img = isPng ? await outDoc.embedPng(imgBytes) : await outDoc.embedJpg(imgBytes)

        const imgW = img.width
        const imgH = img.height

        if (pageSize === 'A4') {
          const a4W = 595.28
          const a4H = 841.89
          const margin = 20
          const scale = Math.min((a4W - margin * 2) / imgW, (a4H - margin * 2) / imgH)
          const rw = imgW * scale
          const rh = imgH * scale
          const outPage = outDoc.addPage([a4W, a4H])
          outPage.drawImage(img, {
            x: (a4W - rw) / 2,
            y: (a4H - rh) / 2,
            width: rw,
            height: rh
          })
        } else {
          const outPage = outDoc.addPage([imgW, imgH])
          outPage.drawImage(img, {
            x: 0,
            y: 0,
            width: imgW,
            height: imgH
          })
        }
      }

      const outBytes = await outDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, totalPages: outDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || '图片转 PDF 失败' }
    }
  }

  /**
   * PDF 压缩与体积瘦身 (Compress PDF)
   */
  async compressPDF(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
      
      const outBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50
      })
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: pdfDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || '压缩处理失败' }
    }
  }

  /**
   * PDF 结构与交叉引用表修复 (Repair PDF)
   */
  async repairPDF(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes, { 
        ignoreEncryption: true,
        parseSpeed: 1,
        throwOnInvalidObject: false
      })
      
      const outBytes = await pdfDoc.save({ useObjectStreams: false })
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: pdfDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || '修复文档失败' }
    }
  }

  /**
   * PDF 双层图层叠加覆盖 (Overlay / Underlay PDF，如公司红头信笺底图、公章模板)
   */
  async overlayPDF(
    foregroundPath: string,
    backgroundPath: string,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fgBytes = await fs.readFile(foregroundPath)
      const bgBytes = await fs.readFile(backgroundPath)
      const fgDoc = await PDFDocument.load(fgBytes)
      const bgDoc = await PDFDocument.load(bgBytes)

      const outDoc = await PDFDocument.create()
      const totalPages = fgDoc.getPageCount()
      const bgPageCount = bgDoc.getPageCount()

      for (let i = 0; i < totalPages; i++) {
        const fgPage = fgDoc.getPage(i)
        this.ensurePageHasContents(fgPage)
        const { width, height } = fgPage.getSize()
        const outPage = outDoc.addPage([width, height])

        if (bgPageCount > 0) {
          const bgPageIdx = Math.min(i, bgPageCount - 1)
          const bgPage = bgDoc.getPage(bgPageIdx)
          this.ensurePageHasContents(bgPage)
          const embBg = await outDoc.embedPage(bgPage)
          outPage.drawPage(embBg, { x: 0, y: 0, width, height })
        }

        const embFg = await outDoc.embedPage(fgPage)
        outPage.drawPage(embFg, { x: 0, y: 0, width, height })
      }

      const outBytes = await outDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: totalPages }
    } catch (err: any) {
      return { success: false, message: err.message || '图层叠加失败' }
    }
  }

  /**
   * 自动添加页眉页脚页码 (Add Page Numbers)
   */
  async addPageNumbers(
    filePath: string,
    options: {
      format?: string
      position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
      startPage?: number
      fontSize?: number
      color?: string
      skipFirstPage?: boolean
    },
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes)
      const totalPages = pdfDoc.getPageCount()

      const formatStr = options.format || 'Page {page} of {total}'
      const position = options.position || 'bottom-center'
      const startPage = options.startPage || 1
      const fontSize = options.fontSize || 10
      const skipFirstPage = options.skipFirstPage || false

      // 此前含中文的格式（如“第 {page} 页”）会被静默删掉中文；现在交给 PyMuPDF 用 CJK 字体如实绘制
      if (needsUnicodeFont(formatStr)) {
        const shownTotal = skipFirstPage ? totalPages - 1 : totalPages
        const items = []
        for (let i = skipFirstPage ? 1 : 0; i < totalPages; i++) {
          const pageNum = startPage + (skipFirstPage ? i - 1 : i)
          items.push({
            page: i + 1,
            text: formatStr.replace('{page}', String(pageNum)).replace('{total}', String(shownTotal))
          })
        }
        const res = await this.pythonService.stampPageTexts(filePath, outputPath, {
          items, position, fontSize, color: options.color || '#404040', margin: 22
        })
        return res.success ? { success: true, outputPath, pageCount: totalPages } : { success: false, message: res.error, error: res.error }
      }
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

      let numColor = rgb(0.25, 0.25, 0.25)
      if (options.color && typeof options.color === 'string') {
        const hex = options.color.replace('#', '')
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16) / 255
          const g = parseInt(hex.substring(2, 4), 16) / 255
          const b = parseInt(hex.substring(4, 6), 16) / 255
          numColor = rgb(r, g, b)
        }
      }

      for (let i = 0; i < totalPages; i++) {
        if (skipFirstPage && i === 0) continue

        const page = pdfDoc.getPage(i)
        const { width, height } = page.getSize()
        const pageNum = startPage + (skipFirstPage ? i - 1 : i)

        const text = formatStr
          .replace('{page}', String(pageNum))
          .replace('{total}', String(skipFirstPage ? totalPages - 1 : totalPages))

        const textWidth = font.widthOfTextAtSize(text, fontSize)
        let x = (width - textWidth) / 2
        let y = 20

        if (position === 'bottom-left') {
          x = 36
          y = 20
        } else if (position === 'bottom-right') {
          x = width - textWidth - 36
          y = 20
        } else if (position === 'top-center') {
          x = (width - textWidth) / 2
          y = height - 25
        } else if (position === 'top-left') {
          x = 36
          y = height - 25
        } else if (position === 'top-right') {
          x = width - textWidth - 36
          y = height - 25
        }

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: numColor
        })
      }

      const outBytes = await pdfDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: totalPages }
    } catch (err: any) {
      return { success: false, message: err.message || '注入页码失败' }
    }
  }

  /**
   * PDF 纵向无缝拼接为单张超长连续大页面 (PDF to Single Large Page)
   */
  async toSingleContinuousPage(
    filePath: string,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const srcDoc = await PDFDocument.load(srcBytes)
      const pageCount = srcDoc.getPageCount()
      if (pageCount === 0) throw new Error('文档无有效页面')

      srcDoc.getPages().forEach((p) => this.ensurePageHasContents(p))

      let maxWidth = 0
      let totalHeight = 0
      const pageSizes: { width: number; height: number }[] = []

      for (let i = 0; i < pageCount; i++) {
        const p = srcDoc.getPage(i)
        const sz = p.getSize()
        pageSizes.push(sz)
        maxWidth = Math.max(maxWidth, sz.width)
        totalHeight += sz.height
      }

      const outDoc = await PDFDocument.create()
      const longPage = outDoc.addPage([maxWidth, totalHeight])

      let currentTop = totalHeight
      for (let i = 0; i < pageCount; i++) {
        const p = srcDoc.getPage(i)
        const emb = await outDoc.embedPage(p)
        const sz = pageSizes[i]
        currentTop -= sz.height

        const offsetX = (maxWidth - sz.width) / 2
        longPage.drawPage(emb, {
          x: offsetX,
          y: currentTop,
          width: sz.width,
          height: sz.height
        })
      }

      const outBytes = await outDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: 1 }
    } catch (err: any) {
      return { success: false, message: err.message || '拼接连续单页长图失败' }
    }
  }

  /**
   * 移除全部批注与高亮图层 (Remove Annotations)
   */
  async removeAnnotations(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes)
      const totalPages = pdfDoc.getPageCount()

      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.getPage(i)
        page.node.delete(PDFName.of('Annots'))
      }

      const outBytes = await pdfDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: totalPages }
    } catch (err: any) {
      return { success: false, message: err.message || '移除批注失败' }
    }
  }

  /**
   * 移除全部内嵌图片以实现极限瘦身 (Remove Images)
   */
  async removeImages(filePath: string, outputPath: string): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes)
      const totalPages = pdfDoc.getPageCount()

      let removedCount = 0
      for (let i = 0; i < totalPages; i++) {
        const page = pdfDoc.getPage(i)
        const resources = page.node.Resources()
        if (!resources) continue
        // XObject 字典本身也可能是间接引用，需要通过 context.lookup 解析
        const xObject = pdfDoc.context.lookup(resources.get(PDFName.of('XObject')))
        if (!(xObject instanceof PDFDict)) continue
        for (const key of xObject.keys()) {
          // 图片 XObject 几乎总是间接对象（PDFRef），且实际类型为 PDFRawStream 而非 PDFDict
          const obj = pdfDoc.context.lookup(xObject.get(key))
          const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null
          if (dict && dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
            xObject.delete(key)
            removedCount++
          }
        }
      }

      const outBytes = await pdfDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: totalPages, message: `已移除 ${removedCount} 处图片引用` }
    } catch (err: any) {
      return { success: false, message: err.message || '移除图片失败' }
    }
  }

  /**
   * 添加电子图章公章或手写签名 (Add Stamp / Sign)
   */
  async addStampOrSignature(
    filePath: string,
    imagePath: string,
    options: {
      pageNumber: number
      x: number
      y: number
      width?: number
      height?: number
    },
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const imgBytes = await fs.readFile(imagePath)
      const pdfDoc = await PDFDocument.load(srcBytes)
      const pageIndex = Math.max(0, options.pageNumber - 1)
      if (pageIndex >= pdfDoc.getPageCount()) throw new Error('指定页码不存在')

      const page = pdfDoc.getPage(pageIndex)
      const isPng = imagePath.toLowerCase().endsWith('.png')
      const img = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)

      const targetW = options.width || 120
      const targetH = options.height || (img.height / img.width) * targetW

      page.drawImage(img, {
        x: options.x,
        y: options.y,
        width: targetW,
        height: targetH
      })

      const outBytes = await pdfDoc.save()
      await fs.writeFile(outputPath, outBytes)
      return { success: true, outputPath, pageCount: pdfDoc.getPageCount() }
    } catch (err: any) {
      return { success: false, message: err.message || '添加图章或签名失败' }
    }
  }

  /**
   * 自动智能重命名 (Auto Rename based on first-page title/content)
   */
  async autoRename(filePath: string): Promise<{ success: boolean; suggestedName?: string; error?: string }> {
    try {
      const srcBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
      
      let candidate = pdfDoc.getTitle()?.trim()
      if (!candidate || candidate.length < 2) {
        const base = path.basename(filePath, path.extname(filePath))
        candidate = base.replace(/[_-]+/g, ' ').trim()
      }

      candidate = candidate.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim()
      if (!candidate.toLowerCase().endsWith('.pdf')) {
        candidate = `${candidate}.pdf`
      }

      return { success: true, suggestedName: candidate }
    } catch (err: any) {
      return { success: false, error: err.message || '自动提取命名失败' }
    }
  }

  /**
   * PDF 密码安全加密与权限控制 (AES-256)
   */
  async encryptPDF(
    filePath: string,
    options: EncryptionOptions,
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const res = await this.pythonService.encryptPDF(filePath, options, outputPath)
      if (res.success && res.outputPath) {
        return {
          success: true,
          outputPath: res.outputPath,
          pageCount: res.pageCount
        }
      }
      return {
        success: false,
        message: res.error || '加密 PDF 失败'
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '加密 PDF 遇到未知异常'
      }
    }
  }

  /**
   * 表单设计器：在页面上添加交互式表单控件 (TextField, Checkbox, Radio, Dropdown)
   */
  async addFormFields(
    filePath: string,
    fields: FormFieldDefinition[],
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true })
      const form = pdfDoc.getForm()
      const totalPages = pdfDoc.getPageCount()

      for (const field of fields) {
        const pageIdx = Math.max(0, Math.min(totalPages - 1, (field.page || 1) - 1))
        const page = pdfDoc.getPage(pageIdx)

        if (field.type === 'text') {
          const tf = form.createTextField(field.name)
          if (field.value) tf.setText(field.value)
          tf.addToPage(page, {
            x: field.x,
            y: field.y,
            width: field.width || 160,
            height: field.height || 26,
            borderWidth: 1,
            borderColor: rgb(0.2, 0.4, 0.8),
            backgroundColor: rgb(0.96, 0.97, 1.0)
          })
        } else if (field.type === 'checkbox') {
          const cb = form.createCheckBox(field.name)
          if (field.value === 'true' || field.value === '1') cb.check()
          cb.addToPage(page, {
            x: field.x,
            y: field.y,
            width: field.width || 20,
            height: field.height || 20,
            borderWidth: 1,
            borderColor: rgb(0.2, 0.4, 0.8)
          })
        } else if (field.type === 'radio') {
          let rg: any
          try {
            rg = form.getRadioGroup(field.name)
          } catch {
            rg = form.createRadioGroup(field.name)
          }
          rg.addOptionToPage(field.optionValue || 'Option 1', page, {
            x: field.x,
            y: field.y,
            width: field.width || 20,
            height: field.height || 20,
            borderWidth: 1,
            borderColor: rgb(0.2, 0.4, 0.8)
          })
        } else if (field.type === 'dropdown') {
          const dd = form.createDropdown(field.name)
          dd.addOptions(field.options && field.options.length > 0 ? field.options : ['选项 1', '选项 2'])
          dd.addToPage(page, {
            x: field.x,
            y: field.y,
            width: field.width || 160,
            height: field.height || 26,
            borderWidth: 1,
            borderColor: rgb(0.2, 0.4, 0.8)
          })
        }
      }

      const outBytes = await pdfDoc.save()
      await fs.writeFile(outputPath, outBytes)

      return {
        success: true,
        outputPath,
        pageCount: pdfDoc.getPageCount()
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '添加表单控件失败'
      }
    }
  }

  /**
   * 按最大文件大小拆分 PDF (Split by File Size)
   */
  async splitBySize(
    filePath: string,
    maxSizeMB: number,
    outputDir: string
  ): Promise<{ success: boolean; outputFiles?: string[]; count?: number; error?: string }> {
    try {
      const fileBytes = await fs.readFile(filePath)
      const srcPdf = await PDFDocument.load(fileBytes)
      const totalPages = srcPdf.getPageCount()
      const baseName = path.basename(filePath, path.extname(filePath))
      const maxSizeBytes = Math.max(0.5, maxSizeMB) * 1024 * 1024

      await fs.mkdir(outputDir, { recursive: true })

      // 第一遍：用单页文档估算每页体积（单页 save 成本低，避免每加一页就对整卷 save 导致 O(n²) 卡死）
      const pageSizes: number[] = []
      for (let i = 0; i < totalPages; i++) {
        const probeDoc = await PDFDocument.create()
        const [probePage] = await probeDoc.copyPages(srcPdf, [i])
        probeDoc.addPage(probePage)
        const probeBytes = await probeDoc.save({ useObjectStreams: true })
        pageSizes.push(probeBytes.length)
      }

      // 按估算体积贪心划分分卷边界（单页超限时单独成卷，与原语义一致）
      const volumes: number[][] = []
      let currentPages: number[] = []
      let currentSize = 0
      for (let i = 0; i < totalPages; i++) {
        if (currentPages.length > 0 && currentSize + pageSizes[i] > maxSizeBytes) {
          volumes.push(currentPages)
          currentPages = []
          currentSize = 0
        }
        currentPages.push(i + 1)
        currentSize += pageSizes[i]
      }
      if (currentPages.length > 0) {
        volumes.push(currentPages)
      }

      // 第二遍：按边界组装每个分卷，每卷只 save 一次
      const outputFiles: string[] = []
      for (let v = 0; v < volumes.length; v++) {
        const volumePages = volumes[v]
        const volumeDoc = await PDFDocument.create()
        const copiedPages = await volumeDoc.copyPages(
          srcPdf,
          volumePages.map((p) => p - 1)
        )
        copiedPages.forEach((p) => volumeDoc.addPage(p))

        const outPath = path.join(
          outputDir,
          `${baseName}_part_${v + 1}_p${volumePages[0]}-p${volumePages[volumePages.length - 1]}.pdf`
        )
        await fs.writeFile(outPath, await volumeDoc.save({ useObjectStreams: true }))
        outputFiles.push(outPath)
      }

      return {
        success: true,
        outputFiles,
        count: outputFiles.length
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || '按大小拆分 PDF 失败'
      }
    }
  }

  /**
   * 等比缩放页面尺寸至标准画幅 (Scale Page Size: A4, A3, A5, Letter, Legal)
   */
  async scalePageSize(
    filePath: string,
    targetStandard: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal',
    outputPath: string
  ): Promise<PDFPageOperationResult> {
    try {
      const standardDimensions: Record<string, [number, number]> = {
        A4: [595.28, 841.89],
        A3: [841.89, 1190.55],
        A5: [419.53, 595.28],
        Letter: [612.0, 792.0],
        Legal: [612.0, 1008.0]
      }

      const [targetW, targetH] = standardDimensions[targetStandard] || standardDimensions['A4']
      const fileBytes = await fs.readFile(filePath)
      const srcPdf = await PDFDocument.load(fileBytes)
      const outPdf = await PDFDocument.create()
      const totalPages = srcPdf.getPageCount()

      for (let i = 0; i < totalPages; i++) {
        const srcPage = srcPdf.getPage(i)
        this.ensurePageHasContents(srcPage)
        const [embedded] = await outPdf.embedPages([srcPage])
        const origW = srcPage.getWidth()
        const origH = srcPage.getHeight()

        // 判断横纵朝向并自适应目标纸张
        const isLandscape = origW > origH
        const pageW = isLandscape ? Math.max(targetW, targetH) : Math.min(targetW, targetH)
        const pageH = isLandscape ? Math.min(targetW, targetH) : Math.max(targetW, targetH)

        const scale = Math.min(pageW / origW, pageH / origH)
        const scaledW = origW * scale
        const scaledH = origH * scale
        const offsetX = (pageW - scaledW) / 2
        const offsetY = (pageH - scaledH) / 2

        const newPage = outPdf.addPage([pageW, pageH])
        newPage.drawPage(embedded, {
          x: offsetX,
          y: offsetY,
          xScale: scale,
          yScale: scale
        })
      }

      const outBytes = await outPdf.save()
      await fs.writeFile(outputPath, outBytes)

      return {
        success: true,
        outputPath,
        pageCount: totalPages
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '缩放页面尺寸失败'
      }
    }
  }
}
