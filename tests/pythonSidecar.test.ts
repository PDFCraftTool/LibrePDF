import fs from 'node:fs/promises'
import path from 'node:path'
import { PythonService } from '../src/main/services/pythonService'

async function runSidecarTests() {
  console.log('--- 🤖 Starting Python Intelligence Sidecar (RapidOCR & Table) Tests ---')
  const pythonService = new PythonService()
  const testDir = path.join(process.cwd(), 'tests', 'fixtures')
  const samplePath = path.join(testDir, 'sample_doc.pdf')

  // 1. 检查 Python 侧车环境与模型就绪状态
  console.log('[Sidecar Test 1] Checking Python environment and RapidOCR status...')
  const envStatus = await pythonService.checkEnvironment()
  if (!envStatus.ready) {
    throw new Error(`Python sidecar not ready: ${envStatus.error}`)
  }
  console.log(`✅ Python environment verified: Engine=${envStatus.engine}, Version=${envStatus.version}`)

  // 2. 测试制作双层可搜索可复制 Sandwich PDF
  console.log('[Sidecar Test 2] Testing RapidOCR Sandwich PDF generation...')
  const ocrOut = path.join(testDir, 'sample_sidecar_sandwich.pdf')
  const ocrRes = await pythonService.ocrToSearchablePDF(samplePath, ocrOut, 150)
  if (!ocrRes.success) {
    throw new Error(`OCR generation failed: ${ocrRes.error}`)
  }
  const stat = await fs.stat(ocrOut)
  if (stat.size <= 0) throw new Error('Generated OCR PDF is empty')
  console.log(`✅ RapidOCR Sandwich PDF created: Words=${ocrRes.totalWords}, OutputSize=${stat.size} bytes.`)

  // 3. 测试复杂表格提取与 Excel 格式化导出
  console.log('[Sidecar Test 3] Testing complex table extraction to Excel...')
  const excelOut = path.join(testDir, 'sample_sidecar_tables.xlsx')
  const tableRes = await pythonService.extractTables(samplePath, excelOut)
  if (!tableRes.success) {
    throw new Error(`Table extraction failed: ${tableRes.error}`)
  }
  const excelStat = await fs.stat(excelOut)
  if (excelStat.size <= 0) throw new Error('Generated Excel file is empty')
  console.log(`✅ Table extraction to Excel verified: Size=${excelStat.size} bytes.`)

  console.log('\n🎉 ALL PYTHON SIDECAR (RapidOCR + Table) TESTS PASSED SUCCESSFULLY! 🎉\n')
}

runSidecarTests().catch((err) => {
  console.error('❌ Sidecar test failed:', err)
  process.exit(1)
})
