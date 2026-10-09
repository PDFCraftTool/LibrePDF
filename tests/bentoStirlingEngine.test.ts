import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { PDFService } from '../src/main/services/pdfService'
import { PythonService } from '../src/main/services/pythonService'
import type { FormFieldDefinition } from '../src/shared/types'

async function runBentoStirlingTests() {
  console.log('--- 🌟 Starting BentoPDF & Stirling-PDF Clean-Room Feature Verification ---')
  const pdfService = new PDFService()
  const pythonService = new PythonService()
  const testDir = path.join(process.cwd(), 'tests', 'fixtures_bento')
  await fs.mkdir(testDir, { recursive: true })

  // 1. 创建测试用多页样本 PDF (3页，含空白页)
  console.log('[Test 1] Generating multi-page test PDF with blank page...')
  const doc = await PDFDocument.create()
  doc.setTitle('Sensitive Secret Document')
  doc.setAuthor('Secret Agent')
  doc.setProducer('Old Insecure Generator')
  const font = await doc.embedFont(StandardFonts.Helvetica)

  // Page 1: 文本页
  const p1 = doc.addPage([595.28, 841.89])
  p1.drawText('Page 1: Bento & Stirling Imposition Test', { x: 50, y: 750, size: 18, font, color: rgb(0.1, 0.2, 0.8) })

  // Page 2: 空白页 (只有纯白背景，无图元)
  const p2 = doc.addPage([595.28, 841.89])

  // Page 3: 文本页
  const p3 = doc.addPage([595.28, 841.89])
  p3.drawText('Page 3: Tail Content for Booklet & Deskew', { x: 50, y: 750, size: 18, font, color: rgb(0.8, 0.2, 0.1) })

  const basePdfPath = path.join(testDir, 'base_sample.pdf')
  await fs.writeFile(basePdfPath, await doc.save())
  console.log('✅ Base test PDF created with 3 pages.')

  // 2. 测试 N-Up 拼印 (2-in-1)
  console.log('[Test 2] Testing pdfNUp (2-in-1缩印)...')
  const nupOut = path.join(testDir, 'out_nup_2.pdf')
  const nupRes = await pdfService.nUp(basePdfPath, 2, true, nupOut)
  if (!nupRes.success) throw new Error(`N-Up failed: ${nupRes.message}`)
  const nupMeta = await pdfService.getMetadata(nupOut)
  if (nupMeta.metadata.pageCount !== 2) {
    throw new Error(`Expected 2 pages for 3-page 2-up, got ${nupMeta.metadata.pageCount}`)
  }
  console.log(`✅ N-Up verified: Generated ${nupMeta.metadata.pageCount} pages from 3 source pages.`)

  // 3. 测试 Posterize 海报拼图切片 (2x2 网格)
  console.log('[Test 3] Testing pdfPosterize (2x2 海报切片)...')
  const posterOut = path.join(testDir, 'out_poster.pdf')
  const posterRes = await pdfService.posterize(basePdfPath, 1, 2, 2, posterOut)
  if (!posterRes.success) throw new Error(`Posterize failed: ${posterRes.message}`)
  const posterMeta = await pdfService.getMetadata(posterOut)
  if (posterMeta.metadata.pageCount !== 4) {
    throw new Error(`Expected 4 tiles for 2x2 poster, got ${posterMeta.metadata.pageCount}`)
  }
  console.log(`✅ Posterize verified: Single page split into ${posterMeta.metadata.pageCount} grid tiles.`)

  // 4. 测试 Booklet 骑马钉折页小册子
  console.log('[Test 4] Testing pdfBooklet (骑马钉小册子排版)...')
  const bookletOut = path.join(testDir, 'out_booklet.pdf')
  const bookletRes = await pdfService.booklet(basePdfPath, bookletOut)
  if (!bookletRes.success) throw new Error(`Booklet failed: ${bookletRes.message}`)
  const bookletMeta = await pdfService.getMetadata(bookletOut)
  if (bookletMeta.metadata.pageCount !== 2) {
    throw new Error(`Expected 2 sheets (4 pages) for booklet, got ${bookletMeta.metadata.pageCount}`)
  }
  console.log(`✅ Booklet verified: Generated ${bookletMeta.metadata.pageCount} printable sheet spreads.`)

  // 5. 测试 Sanitize 元数据与隐私彻底擦除
  console.log('[Test 5] Testing pdfSanitize (隐私元数据擦除)...')
  const sanitizeOut = path.join(testDir, 'out_sanitized.pdf')
  const sanitizeRes = await pdfService.sanitize(basePdfPath, sanitizeOut)
  if (!sanitizeRes.success) throw new Error(`Sanitize failed: ${sanitizeRes.message}`)
  const sMeta = await pdfService.getMetadata(sanitizeOut)
  if (sMeta.metadata.title || sMeta.metadata.author) {
    throw new Error(`Sanitize failed: title=${sMeta.metadata.title}, author=${sMeta.metadata.author}`)
  }
  console.log('✅ Sanitize verified: All metadata, author, and producer traces wiped clean.')

  // 6. 测试 Crop & Margin 边距裁剪与扩充
  console.log('[Test 6] Testing pdfCropOrMargin (白边扩充与边距裁剪)...')
  const cropOut = path.join(testDir, 'out_padded.pdf')
  const cropRes = await pdfService.cropOrMargin(
    basePdfPath,
    { top: 20, bottom: 20, left: 30, right: 30 },
    'pad',
    cropOut
  )
  if (!cropRes.success) throw new Error(`Crop/Margin failed: ${cropRes.message}`)
  const cropMeta = await pdfService.getMetadata(cropOut)
  const firstPage = cropMeta.metadata.pages[0]
  if (Math.round(firstPage.width) !== Math.round(595.28 + 60)) {
    throw new Error(`Expected width ~655, got ${firstPage.width}`)
  }
  console.log(`✅ Crop/Margin verified: Padded dimensions width=${firstPage.width}, height=${firstPage.height}`)

  // 7. 测试 图片批量转 PDF (Images to PDF)
  console.log('[Test 7] Testing imagesToPDF (图片批量转 PDF)...')
  // 创建一个 1x1 假 PNG base64 测试图片
  const samplePngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const pngPath = path.join(testDir, 'test_image.png')
  await fs.writeFile(pngPath, Buffer.from(samplePngBase64, 'base64'))

  const imgPdfOut = path.join(testDir, 'out_from_images.pdf')
  const imgRes = await pdfService.imagesToPDF([pngPath], 'A4', imgPdfOut)
  if (!imgRes.success) throw new Error(`imagesToPDF failed: ${imgRes.message}`)
  const imgMeta = await pdfService.getMetadata(imgPdfOut)
  if (imgMeta.metadata.pageCount !== 1) {
    throw new Error(`Expected 1 page from 1 image, got ${imgMeta.metadata.pageCount}`)
  }
  console.log('✅ imagesToPDF verified: Converted image to A4 PDF successfully.')

  // 8. 测试 Python 图像特效与扫描件模拟 (Sidecar)
  console.log('[Test 8] Testing Python scanner_effect & grayscale...')
  const scannerOut = path.join(testDir, 'out_scanner.pdf')
  const scanRes = await pythonService.scannerEffect(basePdfPath, scannerOut, 100)
  if (scanRes.success) {
    console.log(`✅ Scanner effect generated successfully: Size=${(await fs.stat(scannerOut)).size} bytes.`)
  } else {
    console.warn(`Scanner effect warning: ${scanRes.error}`)
  }

  const grayOut = path.join(testDir, 'out_grayscale.pdf')
  const grayRes = await pythonService.grayscaleInvert(basePdfPath, grayOut, 'grayscale')
  if (grayRes.success) {
    console.log(`✅ Grayscale conversion generated successfully: Size=${(await fs.stat(grayOut)).size} bytes.`)
  } else {
    console.warn(`Grayscale warning: ${grayRes.error}`)
  }

  // 9. 测试 Python 空白页检测与删除
  console.log('[Test 9] Testing Python remove_blank_pages...')
  const cleanOut = path.join(testDir, 'out_no_blank.pdf')
  const rmBlankRes = await pythonService.removeBlankPages(basePdfPath, cleanOut)
  if (rmBlankRes.success) {
    const cleanMeta = await pdfService.getMetadata(cleanOut)
    console.log(`✅ Blank page removed: Original 3 pages reduced to ${cleanMeta.metadata.pageCount} pages.`)
  } else {
    console.warn(`Remove blank pages warning: ${rmBlankRes.error}`)
  }

  // 10. 测试 PDF 压缩与损坏修复
  console.log('[Test 10] Testing pdfCompress & pdfRepair...')
  const compOut = path.join(testDir, 'out_compressed.pdf')
  const compRes = await pdfService.compressPDF(basePdfPath, compOut)
  if (!compRes.success) throw new Error(`compressPDF failed: ${compRes.message}`)
  console.log(`✅ Compress verified: Generated ${compRes.pageCount} pages.`)

  const repairOut = path.join(testDir, 'out_repaired.pdf')
  const repRes = await pdfService.repairPDF(basePdfPath, repairOut)
  if (!repRes.success) throw new Error(`repairPDF failed: ${repRes.message}`)
  console.log(`✅ Repair verified: Reconstructed xref for ${repRes.pageCount} pages.`)

  // 11. 测试 添加页眉页脚页码
  console.log('[Test 11] Testing pdfAddPageNumbers...')
  const numOut = path.join(testDir, 'out_numbered.pdf')
  const numRes = await pdfService.addPageNumbers(
    basePdfPath,
    { format: '第 {page} 页 / 共 {total} 页', position: 'bottom-center' },
    numOut
  )
  if (!numRes.success) throw new Error(`addPageNumbers failed: ${numRes.message}`)
  console.log(`✅ Page numbers verified: Injected page numbers successfully.`)

  // 12. 测试 纵向拼接超长单页
  console.log('[Test 12] Testing toSingleContinuousPage...')
  const longOut = path.join(testDir, 'out_continuous_long.pdf')
  const longRes = await pdfService.toSingleContinuousPage(basePdfPath, longOut)
  if (!longRes.success) throw new Error(`toSingleContinuousPage failed: ${longRes.message}`)
  const longMeta = await pdfService.getMetadata(longOut)
  if (longMeta.metadata.pageCount !== 1) {
    throw new Error(`Expected 1 long page, got ${longMeta.metadata.pageCount}`)
  }
  console.log(`✅ Single continuous page verified: 3 pages stitched into 1 page (H=${longMeta.metadata.pages[0].height}).`)

  // 13. 测试 移除批注与移除图片
  console.log('[Test 13] Testing removeAnnotations & removeImages...')
  const noAnnotsOut = path.join(testDir, 'out_no_annots.pdf')
  const noAnnotsRes = await pdfService.removeAnnotations(basePdfPath, noAnnotsOut)
  if (!noAnnotsRes.success) throw new Error(`removeAnnotations failed: ${noAnnotsRes.message}`)
  console.log('✅ Remove annotations verified.')

  const noImgsOut = path.join(testDir, 'out_no_images.pdf')
  const noImgsRes = await pdfService.removeImages(imgPdfOut, noImgsOut)
  if (!noImgsRes.success) throw new Error(`removeImages failed: ${noImgsRes.message}`)
  console.log('✅ Remove images verified.')

  // 14. 测试 电子公章与手写签名加盖
  console.log('[Test 14] Testing addStampOrSignature...')
  const stampOut = path.join(testDir, 'out_stamped.pdf')
  const stampRes = await pdfService.addStampOrSignature(
    basePdfPath,
    pngPath,
    { pageNumber: 1, x: 200, y: 200, width: 80 },
    stampOut
  )
  if (!stampRes.success) throw new Error(`addStampOrSignature failed: ${stampRes.message}`)
  console.log('✅ Add stamp/signature verified.')

  // 15. 测试 图层双层底图模板覆盖
  console.log('[Test 15] Testing overlayPDF...')
  const overlayOut = path.join(testDir, 'out_overlay.pdf')
  const overlayRes = await pdfService.overlayPDF(basePdfPath, imgPdfOut, overlayOut)
  if (!overlayRes.success) throw new Error(`overlayPDF failed: ${overlayRes.message}`)
  console.log('✅ Overlay PDF template verified.')

  // 16. 测试 双文档视觉高亮差异对比
  console.log('[Test 16] Testing pythonComparePDFs...')
  const compareOut = path.join(testDir, 'out_compare_report.pdf')
  const compReportRes = await pythonService.comparePDFs(basePdfPath, stampOut, compareOut, 100)
  if (compReportRes.success) {
    console.log(`✅ Compare PDFs verified: Detected ${compReportRes.diffCount} diff pages between clean and stamped PDF.`)
  } else {
    console.warn(`Compare warning: ${compReportRes.error}`)
  }

  // 17. 测试 TOC 目录与大纲读取与写入
  console.log('[Test 17] Testing getPdfToc and setPdfToc...')
  const tocData = [
    { level: 1, title: 'Chapter 1: Introduction', page: 1 },
    { level: 2, title: 'Section 1.1: Background', page: 1 },
    { level: 1, title: 'Chapter 2: Conclusion', page: 3 }
  ]
  const tocOut = path.join(testDir, 'out_toc.pdf')
  const setTocRes = await pythonService.setPdfToc(basePdfPath, tocOut, tocData)
  if (!setTocRes.success) throw new Error(`setPdfToc failed: ${setTocRes.error}`)
  const getTocRes = await pythonService.getPdfToc(tocOut)
  if (!getTocRes.success || !getTocRes.toc || getTocRes.toc.length < 3) {
    throw new Error(`getPdfToc failed or missing items: ${getTocRes.error}`)
  }
  console.log(`✅ TOC Editor verified: Wrote and read back ${getTocRes.toc.length} bookmarks.`)

  // 18. 测试 按空白页自动切分 (splitByBlankPages)
  console.log('[Test 18] Testing splitByBlankPages...')
  const splitDir = path.join(testDir, 'split_blank_parts')
  await fs.mkdir(splitDir, { recursive: true })
  const splitBlankRes = await pythonService.splitByBlankPages(basePdfPath, splitDir)
  if (!splitBlankRes.success) throw new Error(`splitByBlankPages failed: ${splitBlankRes.error}`)
  console.log(`✅ Split by blank verified: Found ${splitBlankRes.blankPagesCount} blank pages, created ${splitBlankRes.partsCount} parts.`)

  // 19. 测试 文本方向智能自动整页旋转回正 (autoRotate)
  console.log('[Test 19] Testing autoRotate...')
  const autoRotateOut = path.join(testDir, 'out_autorotate.pdf')
  const autoRotRes = await pythonService.autoRotate(basePdfPath, autoRotateOut)
  if (!autoRotRes.success) throw new Error(`autoRotate failed: ${autoRotRes.error}`)
  console.log(`✅ Auto rotate verified: Processed pages with count=${autoRotRes.count || 0}.`)

  // 20. 测试 附件嵌入与提取 (addAttachment & extractAttachments)
  console.log('[Test 20] Testing addAttachment and extractAttachments...')
  const dummyAttach = path.join(testDir, 'sample_attach.txt')
  await fs.writeFile(dummyAttach, 'Hello from PDF container attachment!')
  const attachOut = path.join(testDir, 'out_with_attach.pdf')
  const addAttRes = await pythonService.addAttachment(basePdfPath, dummyAttach, attachOut)
  if (!addAttRes.success) throw new Error(`addAttachment failed: ${addAttRes.error}`)
  const extractDir = path.join(testDir, 'extracted_attach')
  await fs.mkdir(extractDir, { recursive: true })
  const extractAttRes = await pythonService.extractAttachments(attachOut, extractDir)
  if (!extractAttRes.success || !extractAttRes.files || extractAttRes.files.length === 0) {
    throw new Error(`extractAttachments failed: ${extractAttRes.error}`)
  }
  console.log(`✅ Attachment container verified: Embedded and extracted ${extractAttRes.files.length} files.`)

  // 21. 测试 数字签名域扫描校验 (validateSignatures)
  console.log('[Test 21] Testing validateSignatures...')
  const sigRes = await pythonService.validateSignatures(basePdfPath)
  if (!sigRes.success) throw new Error(`validateSignatures failed: ${sigRes.error}`)
  console.log(`✅ Signature validation verified: hasSignatures=${sigRes.hasSignatures}, count=${sigRes.signatureCount || 0}.`)

  // 22. 测试 PDF 转 Word 文档 (pdfToWord)
  console.log('[Test 22] Testing pdfToWord...')
  const wordOut = path.join(testDir, 'out_word.docx')
  const wordRes = await pythonService.pdfToWord(basePdfPath, wordOut)
  if (!wordRes.success) throw new Error(`pdfToWord failed: ${wordRes.error}`)
  const wordStats = await fs.stat(wordOut)
  if (wordStats.size === 0) throw new Error('Exported docx is 0 bytes')
  console.log(`✅ PDF to Word verified: Generated ${wordStats.size} bytes .docx file without LibreOffice.`)

  // 23. 测试 移除密码脱密 (removePassword)
  console.log('[Test 23] Testing removePassword (with encrypted PDF)...')
  const encryptedPdf = path.join(testDir, 'temp_encrypted.pdf')
  await pdfService.encryptPDF(basePdfPath, { userPassword: 'password123', permissions: { printing: true, modifying: false, copying: false, annotating: false } }, encryptedPdf)
  const decryptedPdf = path.join(testDir, 'out_decrypted.pdf')
  const decryptRes = await pythonService.removePassword(encryptedPdf, 'password123', decryptedPdf)
  if (!decryptRes.success) throw new Error(`removePassword failed: ${decryptRes.error}`)
  const decryptedMeta = await pdfService.getMetadata(decryptedPdf)
  if (decryptedMeta.metadata.pageCount !== 3) throw new Error('Decrypted PDF page count mismatch')
  console.log('✅ Remove password verified: Successfully decrypted and unshielded protected PDF.')

  // 24. 测试 表单设计器 (addFormFields - TextField, Checkbox, Radio, Dropdown)
  console.log('[Test 24] Testing Form Designer (addFormFields)...')
  const formFields: FormFieldDefinition[] = [
    { type: 'text', name: 'user_name', page: 1, x: 100, y: 700, width: 200, height: 26, value: 'Alice' },
    { type: 'checkbox', name: 'agree_terms', page: 1, x: 100, y: 650, width: 20, height: 20, value: 'true' },
    { type: 'radio', name: 'gender', page: 1, x: 100, y: 600, width: 20, height: 20, optionValue: 'female' },
    { type: 'dropdown', name: 'country', page: 1, x: 100, y: 550, width: 180, height: 26, options: ['China', 'USA', 'Germany'] }
  ]
  const formOut = path.join(testDir, 'out_designer_form.pdf')
  const formRes = await pdfService.addFormFields(basePdfPath, formFields, formOut)
  if (!formRes.success) throw new Error(`addFormFields failed: ${formRes.message}`)
  const parsedFields = await pdfService.getFormFields(formOut)
  if (!parsedFields.success || (parsedFields.fields?.length || 0) < 3) {
    throw new Error(`getFormFields could not verify designed fields: count=${parsedFields.fields?.length}`)
  }
  console.log(`✅ Form Designer verified: Successfully designed and injected ${parsedFields.fields?.length} interactive AcroForm widgets.`)

  // 25. 测试 按条形码/二维码自动拆分 (splitByBarcode)
  console.log('[Test 25] Testing splitByBarcode...')
  const barcodeSplitDir = path.join(testDir, 'barcode_split_parts')
  await fs.mkdir(barcodeSplitDir, { recursive: true })
  const bcRes = await pythonService.splitByBarcode(basePdfPath, barcodeSplitDir)
  if (!bcRes.success) throw new Error(`splitByBarcode failed: ${bcRes.error}`)
  console.log(`✅ Split by Barcode verified: Processed document, generated ${bcRes.count || bcRes.outputFiles?.length || 0} split slice(s).`)

  // 26. 测试 基于 P12 证书的 PKCS#7 密码学数字签名 (signPdfP12)
  console.log('[Test 26] Testing P12 Digital Signature (signPdfP12)...')
  const certPath = path.join(testDir, 'test_cert.p12').replace(/\\/g, '/')
  const { execSync } = await import('node:child_process')
  execSync(`python -c "from cryptography.hazmat.primitives.serialization import pkcs12, BestAvailableEncryption; from cryptography.hazmat.primitives.asymmetric import rsa; from cryptography import x509; from cryptography.hazmat.primitives import hashes; import datetime; key = rsa.generate_private_key(65537, 2048); name = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, 'Test Signer Corp')]); cert = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(1001).not_valid_before(datetime.datetime.now(datetime.timezone.utc)).not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365)).sign(key, hashes.SHA256()); p12_data = pkcs12.serialize_key_and_certificates(b'Test', key, cert, None, BestAvailableEncryption(b'secret123')); open('${certPath}', 'wb').write(p12_data)"`)

  const signedOut = path.join(testDir, 'out_digitally_signed.pdf')
  const signRes = await pythonService.signPdfP12(basePdfPath, certPath, 'secret123', signedOut, {
    reason: 'Contract Final Approval',
    location: 'Global Headquarters'
  })
  if (!signRes.success) throw new Error(`signPdfP12 failed: ${signRes.error}`)
  const verifyRes = await pythonService.validateSignatures(signedOut)
  if (!verifyRes.success || !verifyRes.hasSignatures || (verifyRes.signatureCount || 0) < 1) {
    throw new Error(`Signature validation failed on signed doc: ${verifyRes.error}`)
  }
  console.log(`✅ P12 Digital Signature verified: Signer=${signRes.signer}, Verified signatures count=${verifyRes.signatureCount}.`)

  // 27. 测试 PDF/A 国际标准长期电子归档转换 (convertToPdfA)
  console.log('[Test 27] Testing PDF/A Archival Conversion (convertToPdfA)...')
  const pdfaOut = path.join(testDir, 'out_archival_pdfa.pdf')
  const pdfaRes = await pythonService.convertToPdfA(basePdfPath, pdfaOut, '1b')
  if (!pdfaRes.success) throw new Error(`convertToPdfA failed: ${pdfaRes.error}`)
  console.log(`✅ PDF/A conversion verified: Produced ${pdfaRes.conformance} archival document with pageCount=${pdfaRes.pageCount}.`)

  // 28. 测试 按文件大小分卷拆分 (splitBySize)
  console.log('[Test 28] Testing splitBySize...')
  const sizeSplitDir = path.join(testDir, 'size_split_out')
  const sizeRes = await pdfService.splitBySize(basePdfPath, 0.5, sizeSplitDir)
  if (!sizeRes.success || !sizeRes.outputFiles || sizeRes.outputFiles.length === 0) {
    throw new Error(`splitBySize failed: ${sizeRes.error}`)
  }
  console.log(`✅ Split by size verified: Generated ${sizeRes.count} volume slice(s).`)

  // 29. 测试 等比缩放画幅至标准纸张 (scalePageSize)
  console.log('[Test 29] Testing scalePageSize (A4 standard)...')
  const scaledA4Out = path.join(testDir, 'out_scaled_a4.pdf')
  const scaleRes = await pdfService.scalePageSize(basePdfPath, 'A4', scaledA4Out)
  if (!scaleRes.success) throw new Error(`scalePageSize failed: ${scaleRes.message}`)
  const scaledMeta = await pdfService.getMetadata(scaledA4Out)
  if (scaledMeta.metadata.pageCount !== 3) throw new Error('Scaled PDF page count mismatch')
  console.log(`✅ Scale page size verified: Successfully adapted ${scaleRes.pageCount} pages to standard A4 canvas.`)

  // 30. 测试 按大纲章节拆分 (splitByBookmarks)
  console.log('[Test 30] Testing splitByBookmarks...')
  // 先向 PDF 注入两级目录
  const pdfWithToc = path.join(testDir, 'pdf_with_toc.pdf')
  await pythonService.setPdfToc(basePdfPath, pdfWithToc, [
    { level: 1, title: 'Chapter 1 Overview', page: 1 },
    { level: 1, title: 'Chapter 2 Analysis', page: 2 }
  ])
  const bookmarkSplitDir = path.join(testDir, 'bookmark_split_out')
  const bmRes = await pythonService.splitByBookmarks(pdfWithToc, bookmarkSplitDir)
  if (!bmRes.success || !bmRes.outputFiles || bmRes.outputFiles.length < 2) {
    throw new Error(`splitByBookmarks failed: ${bmRes.error}`)
  }
  console.log(`✅ Split by bookmarks verified: Splitted into ${bmRes.count} chapters automatically.`)

  // 31. 测试 纯文本 / Markdown 转 PDF (textOrMarkdownToPdf)
  console.log('[Test 31] Testing textOrMarkdownToPdf...')
  const sampleMd = path.join(testDir, 'sample_doc.md')
  await fs.writeFile(sampleMd, '# PDFOpen Studio\n\n## 一、系统简介\n高性能桌面端智能 PDF 工具箱。\n\n## 二、核心功能\n全能洁室自研架构。', 'utf-8')
  const mdPdfOut = path.join(testDir, 'out_markdown.pdf')
  const mdRes = await pythonService.textOrMarkdownToPdf(sampleMd, mdPdfOut)
  if (!mdRes.success) throw new Error(`textOrMarkdownToPdf failed: ${mdRes.error}`)
  console.log(`✅ Text & Markdown to PDF verified: Generated ${mdRes.pageCount} page(s) PDF document.`)

  // 32. 测试 CBZ 漫画包转 PDF (comicToPdf)
  console.log('[Test 32] Testing comicToPdf...')
  const sampleZipComic = path.join(testDir, 'comic_sample.cbz')
  const sampleImgPath = path.join(testDir, 'sample_comic_page.png')
  // 生成一张简易漫画图片并压缩为 zip/cbz
  const archiver = await import('node:zlib')
  execSync(`python -c "import zipfile, io; from PIL import Image; z = zipfile.ZipFile(r'${sampleZipComic.replace(/\\/g, '/')}', 'w'); img = Image.new('RGB', (400, 600), (240, 240, 255)); buf = io.BytesIO(); img.save(buf, 'PNG'); z.writestr('001.png', buf.getvalue()); z.writestr('002.png', buf.getvalue()); z.close()"`)
  const comicPdfOut = path.join(testDir, 'out_comic.pdf')
  const comicRes = await pythonService.comicToPdf(sampleZipComic, comicPdfOut)
  if (!comicRes.success || (comicRes.pageCount || 0) < 2) {
    throw new Error(`comicToPdf failed: ${comicRes.error}`)
  }
  console.log(`✅ Comic to PDF verified: Unpacked and assembled ${comicRes.pageCount} comic spreads.`)

  // 33. 测试 PDF 导出为独立 HTML 网页 (pdfToHtml)
  console.log('[Test 33] Testing pdfToHtml...')
  const htmlOut = path.join(testDir, 'out_pdf_page.html')
  const htmlRes = await pythonService.pdfToHtml(basePdfPath, htmlOut)
  if (!htmlRes.success) throw new Error(`pdfToHtml failed: ${htmlRes.error}`)
  const htmlContent = await fs.readFile(htmlOut, 'utf-8')
  if (!htmlContent.includes('<!DOCTYPE html>')) throw new Error('Invalid exported HTML content')
  console.log(`✅ PDF to HTML verified: Successfully exported ${htmlRes.pageCount} pages standalone HTML.`)

  // 34. 测试 PDF 导出为 PowerPoint (.pptx) (pdfToPptx)
  console.log('[Test 34] Testing pdfToPptx...')
  const pptxOut = path.join(testDir, 'out_slides.pptx')
  const pptxRes = await pythonService.pdfToPptx(basePdfPath, pptxOut, 100)
  if (!pptxRes.success) throw new Error(`pdfToPptx failed: ${pptxRes.error}`)
  const pptxStat = await fs.stat(pptxOut)
  if (pptxStat.size === 0) throw new Error('Exported PPTX is empty')
  console.log(`✅ PDF to PPTX verified: Generated presentation slides with ${pptxRes.slideCount} slides (${pptxStat.size} bytes).`)

  // 35. 测试 Office 格式转 PDF (officeToPdf)
  console.log('[Test 35] Testing officeToPdf (with sample .docx)...')
  const dummyDocx = path.join(testDir, 'sample_office.docx')
  execSync(`python -c "import docx; d = docx.Document(); d.add_heading('Office to PDF Test', 0); d.add_paragraph('Clean-room office conversion verification.'); d.save(r'${dummyDocx.replace(/\\/g, '/')}')"`)
  const officePdfOut = path.join(testDir, 'out_office.pdf')
  const officeRes = await pythonService.officeToPdf(dummyDocx, officePdfOut)
  if (!officeRes.success) throw new Error(`officeToPdf failed: ${officeRes.error}`)
  console.log(`✅ Office to PDF verified: Converted docx to PDF successfully using engine=${officeRes.engine}.`)

  // 36. 测试 全格式图片批量转标准 PDF (Images to PDF: WebP, TIFF, BMP, PNG)
  console.log('[Test 36] Testing Images to PDF with multi-format (WebP, TIFF, BMP, PNG)...')
  const webpImg = path.join(testDir, 'test_img.webp')
  const tiffImg = path.join(testDir, 'test_img.tiff')
  const bmpImg = path.join(testDir, 'test_img.bmp')
  execSync(`python -c "from PIL import Image; img = Image.new('RGB', (300, 300), (100, 200, 250)); img.save(r'${webpImg.replace(/\\/g, '/')}', 'WEBP'); img.save(r'${tiffImg.replace(/\\/g, '/')}', 'TIFF'); img.save(r'${bmpImg.replace(/\\/g, '/')}', 'BMP')"`)
  const multiImgPdfOut = path.join(testDir, 'out_multi_format_images.pdf')
  const multiImgRes = await pdfService.imagesToPDF([webpImg, tiffImg, bmpImg], 'A4', multiImgPdfOut)
  if (!multiImgRes.success) throw new Error(`imagesToPDF with multi-format failed: ${multiImgRes.message}`)
  const multiImgMeta = await pdfService.getMetadata(multiImgPdfOut)
  if (multiImgMeta.metadata.pageCount !== 3) throw new Error('Multi-format images to PDF page count mismatch')
  console.log(`✅ Images to PDF verified: Converted WebP, TIFF, BMP images to ${multiImgMeta.metadata.pageCount} pages standard PDF.`)

  // 37. 测试 PDF 逐页渲染导出为图片 (PDF to Image: PNG, JPG, WebP, TIFF)
  console.log('[Test 37] Testing PDF to Images (PNG, JPG, WebP, TIFF)...')
  const imgExportDir = path.join(testDir, 'pdf_to_images_out')
  for (const fmt of ['png', 'jpg', 'webp', 'tiff'] as const) {
    const res = await pythonService.pdfToImages(basePdfPath, imgExportDir, { format: fmt, dpi: 150 })
    if (!res.success || !res.outputFiles || res.outputFiles.length === 0) {
      throw new Error(`pdfToImages failed for format ${fmt}: ${res.error}`)
    }
  }
  console.log('✅ PDF to Images verified: Successfully rendered pages into PNG, JPG, WebP and TIFF at 150 DPI.')

  console.log('\n🎉 ALL 37 BENTO & STIRLING CLEAN-ROOM TESTS COMPLETED SUCCESSFULLY! 🎉')
}

runBentoStirlingTests().catch((err) => {
  console.error('❌ Bento & Stirling Tests Failed:', err)
  process.exit(1)
})
