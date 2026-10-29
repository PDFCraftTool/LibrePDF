import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'

async function createSamplePdf() {
  const pdfDoc = await PDFDocument.create()
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)

  // Page 1: Executive Summary
  const page1 = pdfDoc.addPage([595.28, 841.89]) // A4
  const { width, height } = page1.getSize()

  // Top header banner
  page1.drawRectangle({
    x: 0,
    y: height - 8,
    width: width,
    height: 8,
    color: rgb(0.08, 0.45, 0.58)
  })

  // Document Badge
  page1.drawRectangle({
    x: 50,
    y: height - 60,
    width: 140,
    height: 22,
    color: rgb(0.92, 0.95, 0.98)
  })
  page1.drawText('CONFIDENTIAL REPORT', {
    x: 58,
    y: height - 52,
    size: 9,
    font: fontBold,
    color: rgb(0.08, 0.45, 0.58)
  })

  // Title
  page1.drawText('Q4 Strategic Financial &', {
    x: 50,
    y: height - 100,
    size: 26,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.2)
  })
  page1.drawText('Operations Performance Review', {
    x: 50,
    y: height - 132,
    size: 26,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.2)
  })

  page1.drawText('Enterprise Business Analytics & Global Architecture Planning', {
    x: 50,
    y: height - 158,
    size: 12,
    font: fontOblique,
    color: rgb(0.38, 0.45, 0.55)
  })

  // Divider line
  page1.drawLine({
    start: { x: 50, y: height - 175 },
    end: { x: width - 50, y: height - 175 },
    thickness: 1,
    color: rgb(0.85, 0.88, 0.92)
  })

  // 3 Metric Cards
  const cardY = height - 265
  const cardW = 150
  const cardH = 75
  const metrics = [
    { label: 'Total Revenue', value: '$128.4M', change: '+24.6% YoY', color: rgb(0.05, 0.6, 0.4) },
    { label: 'Gross Margin', value: '72.8%', change: '+3.8% QoQ', color: rgb(0.08, 0.45, 0.58) },
    { label: 'Cloud Workloads', value: '94.2%', change: 'Target Exceeded', color: rgb(0.4, 0.25, 0.7) }
  ]

  metrics.forEach((m, i) => {
    const cx = 50 + i * (cardW + 22)
    page1.drawRectangle({
      x: cx,
      y: cardY,
      width: cardW,
      height: cardH,
      color: rgb(0.96, 0.97, 0.99),
      borderColor: rgb(0.88, 0.9, 0.94),
      borderWidth: 1
    })
    page1.drawText(m.label, { x: cx + 14, y: cardY + 52, size: 10, font: fontHelvetica, color: rgb(0.4, 0.45, 0.52) })
    page1.drawText(m.value, { x: cx + 14, y: cardY + 28, size: 18, font: fontBold, color: rgb(0.09, 0.13, 0.2) })
    page1.drawText(m.change, { x: cx + 14, y: cardY + 12, size: 9, font: fontBold, color: m.color })
  })

  // Executive Narrative
  page1.drawText('1. Executive Summary & Market Trajectory', {
    x: 50,
    y: height - 305,
    size: 14,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.2)
  })

  const paragraph1 = [
    'During the fourth quarter, global operations demonstrated exceptional resilience and accelerating growth.',
    'Consolidated net revenue expanded by 24.6% year-over-year, propelled by sustained enterprise customer adoption',
    'and accelerated migration toward native, high-efficiency digital workflows. Operating margins remained',
    'highly disciplined while research, product development, and infrastructure investments continued at scale.',
    '',
    'Key organizational pillars including security, regulatory compliance, and cross-border data sovereignty',
    'have achieved 100% adherence to modern governance frameworks without impacting operational latency.'
  ]

  let textY = height - 330
  for (const line of paragraph1) {
    if (line) {
      page1.drawText(line, {
        x: 50,
        y: textY,
        size: 10,
        font: fontHelvetica,
        color: rgb(0.25, 0.3, 0.38)
      })
    }
    textY -= 16
  }

  // Structured Table
  page1.drawText('2. Key Performance Indicators by Department', {
    x: 50,
    y: textY - 20,
    size: 14,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.2)
  })

  const tableY = textY - 45
  page1.drawRectangle({
    x: 50,
    y: tableY - 100,
    width: width - 100,
    height: 120,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1
  })

  // Header row
  page1.drawRectangle({
    x: 50,
    y: tableY,
    width: width - 100,
    height: 20,
    color: rgb(0.93, 0.95, 0.98)
  })

  const cols = [
    { title: 'Business Unit', x: 65 },
    { title: 'Target (USD)', x: 200 },
    { title: 'Actual (USD)', x: 310 },
    { title: 'Attainment', x: 420 },
    { title: 'Status', x: 500 }
  ]

  for (const col of cols) {
    page1.drawText(col.title, {
      x: col.x,
      y: tableY + 5,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.25, 0.35)
    })
  }

  const rows = [
    ['Enterprise Cloud Solutions', '$45,000,000', '$48,250,000', '107.2%', 'Exceeded'],
    ['AI Workflow Automation', '$32,000,000', '$36,800,000', '115.0%', 'Exceeded'],
    ['Security & Compliance', '$24,000,000', '$24,950,000', '103.9%', 'On Track'],
    ['Professional Services', '$18,000,000', '$18,400,000', '102.2%', 'On Track']
  ]

  rows.forEach((r, idx) => {
    const rowY = tableY - 24 * (idx + 1)
    page1.drawLine({
      start: { x: 50, y: rowY + 20 },
      end: { x: width - 50, y: rowY + 20 },
      thickness: 0.5,
      color: rgb(0.9, 0.92, 0.95)
    })
    r.forEach((val, ci) => {
      page1.drawText(val, {
        x: cols[ci].x,
        y: rowY + 5,
        size: 9,
        font: ci === 0 ? fontBold : fontHelvetica,
        color: ci === 4 ? rgb(0.05, 0.55, 0.35) : rgb(0.25, 0.3, 0.38)
      })
    })
  })

  // Footer
  page1.drawText('LibrePDF Studio Sample Document • For Demonstration Purposes Only • Page 1 of 3', {
    x: 50,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.6, 0.65, 0.72)
  })

  // Page 2: Architecture & Workflow
  const page2 = pdfDoc.addPage([595.28, 841.89])
  page2.drawRectangle({ x: 0, y: height - 8, width: width, height: 8, color: rgb(0.08, 0.45, 0.58) })
  page2.drawText('Section II: Enterprise Document Pipeline Architecture', {
    x: 50,
    y: height - 60,
    size: 18,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.2)
  })
  page2.drawText('End-to-end workflow processing from ingestion to archival verification', {
    x: 50,
    y: height - 85,
    size: 11,
    font: fontOblique,
    color: rgb(0.4, 0.45, 0.52)
  })

  const p2Lines = [
    'Enterprise document management mandates strict separation of confidential data and external network boundaries.',
    'By leveraging client-side WebAssembly and local ONNX neural network execution, documents undergo extraction,',
    'bates numbering, watermark sealing, and deep PDF/A archival compliance entirely on physical workstation nodes.',
    '',
    '• Stage A: High-throughput ingestion of multi-format scanned documentation (PDF, TIFF, Scan RAW).',
    '• Stage B: Neural OCR text sandwich generation with spatial layout bounding-box alignment.',
    '• Stage C: Automated PII redaction and sensitive information pattern masking.',
    '• Stage D: Cryptographic P12 digital signing with timestamped PKI certificate validation.'
  ]
  let p2Y = height - 130
  for (const l of p2Lines) {
    if (l) page2.drawText(l, { x: 50, y: p2Y, size: 10, font: fontHelvetica, color: rgb(0.25, 0.3, 0.38) })
    p2Y -= 20
  }

  page2.drawText('LibrePDF Studio Sample Document • For Demonstration Purposes Only • Page 2 of 3', {
    x: 50,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.6, 0.65, 0.72)
  })

  // Page 3: Compliance & Sign-off
  const page3 = pdfDoc.addPage([595.28, 841.89])
  page3.drawRectangle({ x: 0, y: height - 8, width: width, height: 8, color: rgb(0.08, 0.45, 0.58) })
  page3.drawText('Section III: Governance Sign-Off & Verification', {
    x: 50,
    y: height - 60,
    size: 18,
    font: fontBold,
    color: rgb(0.09, 0.13, 0.2)
  })

  page3.drawText('This document has been reviewed and approved in accordance with ISO 32000-1 standards.', {
    x: 50,
    y: height - 100,
    size: 10,
    font: fontHelvetica,
    color: rgb(0.25, 0.3, 0.38)
  })

  // Signature Box
  page3.drawRectangle({
    x: 50,
    y: height - 220,
    width: 240,
    height: 90,
    color: rgb(0.97, 0.98, 1),
    borderColor: rgb(0.8, 0.85, 0.92),
    borderWidth: 1
  })
  page3.drawText('Approved by Chief Technical Officer:', { x: 62, y: height - 150, size: 9, font: fontBold, color: rgb(0.2, 0.25, 0.35) })
  page3.drawText('Dr. Eleanor Vance, Ph.D.', { x: 62, y: height - 175, size: 13, font: fontBold, color: rgb(0.08, 0.45, 0.58) })
  page3.drawText('Digital Signature Valid • Verified Timestamp 2026-10-29', { x: 62, y: height - 200, size: 8, font: fontHelvetica, color: rgb(0.4, 0.45, 0.52) })

  page3.drawText('LibrePDF Studio Sample Document • For Demonstration Purposes Only • Page 3 of 3', {
    x: 50,
    y: 35,
    size: 8,
    font: fontHelvetica,
    color: rgb(0.6, 0.65, 0.72)
  })

  const outDir = path.resolve(process.cwd(), 'tests/fixtures')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const pdfBytes = await pdfDoc.save()
  const outPath = path.join(outDir, 'sample_demo_report.pdf')
  fs.writeFileSync(outPath, pdfBytes)
  console.log('Sample demo PDF successfully created at:', outPath)
}

createSamplePdf().catch(console.error)
