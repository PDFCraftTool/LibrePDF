import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { PDFService } from '../src/main/services/pdfService'

async function runTests() {
  console.log('--- 🚀 Starting PDFOpen Studio Core Engine Tests ---')
  const pdfService = new PDFService()
  const testDir = path.join(process.cwd(), 'tests', 'fixtures')
  await fs.mkdir(testDir, { recursive: true })

  const samplePath = path.join(testDir, 'sample_doc.pdf')

  // 1. 生成测试样本 PDF (3页)
  console.log('[Test 1] Generating sample 3-page PDF...')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595.28, 841.89])
    page.drawText(`PDFOpen Studio Test Document - Page ${i}`, {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0.1, 0.2, 0.8)
    })
  }
  const sampleBytes = await doc.save()
  await fs.writeFile(samplePath, sampleBytes)
  console.log('✅ Sample PDF created successfully.')

  // 2. 测试元数据读取
  console.log('[Test 2] Reading PDF metadata...')
  const { metadata } = await pdfService.getMetadata(samplePath)
  if (metadata.pageCount !== 3) {
    throw new Error(`Expected 3 pages, got ${metadata.pageCount}`)
  }
  console.log(`✅ Metadata verified: PageCount = ${metadata.pageCount}`)

  // 3. 测试水印添加
  console.log('[Test 3] Testing addWatermark (tiled & confidential)...')
  const watermarkOut = path.join(testDir, 'sample_watermarked.pdf')
  const wmRes = await pdfService.addWatermark(
    samplePath,
    { text: 'CONFIDENTIAL', position: 'tiled', opacity: 0.3 },
    watermarkOut
  )
  if (!wmRes.success) throw new Error(`Watermark failed: ${wmRes.message}`)
  const wmMeta = await pdfService.getMetadata(watermarkOut)
  if (wmMeta.metadata.pageCount !== 3) throw new Error('Watermark altered page count')
  console.log('✅ Watermark applied and verified.')

  // 4. 测试页面旋转
  console.log('[Test 4] Testing rotatePages (Page 1 by 90 deg)...')
  const rotateOut = path.join(testDir, 'sample_rotated.pdf')
  const rotRes = await pdfService.rotatePages(samplePath, [1], 90, rotateOut)
  if (!rotRes.success) throw new Error(`Rotate failed: ${rotRes.message}`)
  const rotMeta = await pdfService.getMetadata(rotateOut)
  if (rotMeta.metadata.pages[0].rotation !== 90) {
    throw new Error(`Expected page 1 rotation 90, got ${rotMeta.metadata.pages[0].rotation}`)
  }
  console.log('✅ Page rotation verified: Page 1 is 90 degrees.')

  // 5. 测试贝茨编号
  console.log('[Test 5] Testing applyBatesNumbering...')
  const batesOut = path.join(testDir, 'sample_bates.pdf')
  const batesRes = await pdfService.applyBatesNumbering(
    samplePath,
    { prefix: 'TEST-', startNumber: 101, digits: 6, position: 'bottom-right' },
    batesOut
  )
  if (!batesRes.success) throw new Error(`Bates numbering failed: ${batesRes.message}`)
  console.log('✅ Bates numbering applied successfully.')

  // 6. 测试拆分
  console.log('[Test 6] Testing splitPDF...')
  const splitDir = path.join(testDir, 'splits')
  await fs.mkdir(splitDir, { recursive: true })
  const splitRes = await pdfService.splitPDF(
    samplePath,
    [{ start: 1, end: 1 }, { start: 2, end: 3 }],
    splitDir
  )
  if (!splitRes.success) throw new Error(`Split failed: ${splitRes.message}`)
  const splitFiles = await fs.readdir(splitDir)
  if (splitFiles.length < 2) throw new Error(`Expected at least 2 split files, got ${splitFiles.length}`)
  console.log(`✅ PDF Split verified: Generated ${splitFiles.length} files.`)

  // 7. 测试合并
  console.log('[Test 7] Testing mergePDFs...')
  const mergeOut = path.join(testDir, 'sample_remerged.pdf')
  const filesToMerge = splitFiles.map((f) => path.join(splitDir, f))
  const mergeRes = await pdfService.mergePDFs(filesToMerge, mergeOut)
  if (!mergeRes.success) throw new Error(`Merge failed: ${mergeRes.message}`)
  const mergedMeta = await pdfService.getMetadata(mergeOut)
  if (mergedMeta.metadata.pageCount !== 3) {
    throw new Error(`Expected merged doc to have 3 pages, got ${mergedMeta.metadata.pageCount}`)
  }
  console.log(`✅ PDF Merge verified: Total pages re-assembled = ${mergedMeta.metadata.pageCount}`)

  console.log('\n🎉 ALL 7 CORE ENGINE AUTOMATED TESTS PASSED SUCCESSFULLY! 🎉\n')
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err)
  process.exit(1)
})
