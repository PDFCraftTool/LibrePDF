import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PythonService } from '../src/main/services/pythonService'
import type { TextEditItem } from '../src/shared/types'

const execFileAsync = promisify(execFile)

/** 直接跑一段 Python 代码（用于构造 fixture 与像素级断言），返回 stdout */
async function runPython(code: string): Promise<string> {
  const { stdout } = await execFileAsync('python', ['-c', code], { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 })
  return stdout.trim()
}

/** 从 stdout 中提取最后一行 JSON（与 PythonService.extractJsonFromStdout 同策略） */
function parseLastJson(stdout: string): any {
  const lines = stdout.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        return JSON.parse(line)
      } catch {
        continue
      }
    }
  }
  throw new Error(`无法从 Python 输出解析 JSON: ${stdout.slice(0, 300)}`)
}

/** 直接调用 bridge.py（用于绕过 TS 映射层、投递畸形编辑项） */
async function runBridge(args: string[]): Promise<any> {
  const bridgePath = path.join(process.cwd(), 'python', 'bridge.py')
  const { stdout } = await execFileAsync('python', [bridgePath, ...args], {
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024
  })
  return parseLastJson(stdout)
}

/** 当前 os.tmpdir() 中 pdfopen_*.pdf 临时文件快照（用于分批链路残留检测） */
function snapshotTempFiles(): Set<string> {
  return new Set(fsSync.readdirSync(os.tmpdir()).filter((n) => /^pdfopen_.*\.pdf$/.test(n)))
}

async function runEditTextBatchTests() {
  console.log('--- ✏️ Starting Edit-Text Batch & Fidelity Tests ---')
  const pythonService = new PythonService()
  const testDir = path.join(process.cwd(), 'tests', 'fixtures')
  await fs.mkdir(testDir, { recursive: true })
  const fixPath = path.join(testDir, 'sample_edit_batch.pdf').replace(/\\/g, '/')
  const outPath = path.join(testDir, 'sample_edit_batch_out.pdf').replace(/\\/g, '/')
  const created: string[] = [fixPath, outPath]

  try {
    // 1. 构造 fixture：页1 红底白字 14pt；页2 普通文本 + 图片；页3 普通文本
    console.log('[EditBatch Test 1] Building fixture with colored background and image...')
    await runPython(`
import pymupdf
doc = pymupdf.open()
p1 = doc.new_page(width=595, height=842)
p1.draw_rect(pymupdf.Rect(50, 60, 400, 120), color=None, fill=(0.8, 0.1, 0.1))
p1.insert_text((60, 95), "SECRET RED BACKGROUND", fontsize=14, color=(1, 1, 1), fontname="helv")
p2 = doc.new_page(width=595, height=842)
p2.insert_text((60, 95), "Normal black text line", fontsize=12, fontname="helv")
pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 64, 64), 1)
pix.clear_with(120)
p2.insert_image(pymupdf.Rect(60, 150, 124, 214), pixmap=pix)
p3 = doc.new_page(width=595, height=842)
p3.insert_text((60, 95), "Page three editable text", fontsize=12, fontname="helv")
doc.save("${fixPath}")
doc.close()
print("fixture-ok")
`)

    // 2. 属性提取：真实字号/颜色/无子集前缀字体名/稳定 ID
    console.log('[EditBatch Test 2] Verifying span-level attribute extraction...')
    const r1 = await pythonService.getTextBlocks(fixPath, 1)
    const r2 = await pythonService.getTextBlocks(fixPath, 1)
    if (!r1.success || !r1.blocks) throw new Error(`getTextBlocks failed: ${r1.error}`)
    const b1 = r1.blocks.find((b: any) => b.text.includes('SECRET RED'))
    if (!b1) throw new Error('red-background block not found')
    if (Math.abs((b1 as any).fontSize - 14) >= 0.5) throw new Error(`fontSize should be ~14, got ${(b1 as any).fontSize}`)
    const col = (b1 as any).color as number[]
    if (!(col[0] > 0.9 && col[1] > 0.9 && col[2] > 0.9)) throw new Error(`white text color expected, got ${JSON.stringify(col)}`)
    if (String((b1 as any).fontName).includes('+')) throw new Error(`subset prefix not stripped: ${(b1 as any).fontName}`)
    const ids1 = r1.blocks.map((b: any) => b.id).sort().join(',')
    const ids2 = (r2.blocks || []).map((b: any) => b.id).sort().join(',')
    if (ids1 !== ids2) throw new Error('block ids are not stable across extractions')
    console.log(`✅ Attrs verified: fontSize=${(b1 as any).fontSize}, color=${JSON.stringify(col)}, fontName=${(b1 as any).fontName}, id=${(b1 as any).id}`)

    // 3. 批量编辑：2 成功 + 1 越界失败（部分失败不中断）
    console.log('[EditBatch Test 3] Running edit_text_batch with partial failure...')
    const r2blocks = await pythonService.getTextBlocks(fixPath, 2)
    const b2 = (r2blocks.blocks || []).find((b: any) => b.text.includes('Normal'))
    if (!b2) throw new Error('page-2 block not found')
    const edits: TextEditItem[] = [
      { page: 1, blockId: (b1 as any).id, rect: (b1 as any).rect, oldText: (b1 as any).text, newText: 'REPLACED ON RED', fontName: (b1 as any).fontName, fontSize: (b1 as any).fontSize, color: [1, 1, 1] },
      { page: 2, blockId: (b2 as any).id, rect: (b2 as any).rect, oldText: (b2 as any).text, newText: 'EDITED PAGE TWO', fontName: null, fontSize: null, color: null },
      { page: 3, blockId: 'synthetic-oob', rect: [9999, 9999, 10001, 10001], oldText: '', newText: 'SHOULD FAIL', fontName: null, fontSize: null, color: null }
    ]
    const res = await pythonService.editTextBatch(fixPath, outPath, edits)
    if (!res.success || !res.results) throw new Error(`editTextBatch failed: ${res.error}`)
    const byIdx = new Map(res.results.map((r) => [r.index, r]))
    if (!byIdx.get(0)?.ok || !byIdx.get(1)?.ok) throw new Error(`expected edits 0,1 ok: ${JSON.stringify(res.results)}`)
    if (byIdx.get(2)?.ok !== false) throw new Error('out-of-page rect edit should fail')
    if (!String(byIdx.get(2)?.error || '').includes('矩形超出页面范围')) {
      throw new Error(`expected out-of-page error message, got: ${byIdx.get(2)?.error}`)
    }

    // 4. 输出验证：文本替换、红底保留、图片保留、页数不变
    console.log('[EditBatch Test 4] Verifying output fidelity (text / background / image)...')
    const verdict = await runPython(`
import pymupdf, json
d = pymupdf.open("${outPath}")
t1 = d[0].get_text()
pix = d[0].get_pixmap(clip=pymupdf.Rect(52, 62, 58, 68), dpi=72)
px = pix.pixel(pix.width // 2, pix.height // 2)
out = {
  "replaced": "REPLACED ON RED" in t1 and "SECRET RED BACKGROUND" not in t1,
  "page2": "EDITED PAGE TWO" in d[1].get_text(),
  "bgRed": px[0] > 140 and px[1] < 110 and px[2] < 110,
  "imgKept": len(d[1].get_images()) >= 1,
  "pages": len(d),
}
d.close()
print(json.dumps(out))
`)
    const v = JSON.parse(verdict)
    if (!v.replaced) throw new Error('text not replaced on page 1')
    if (!v.page2) throw new Error('text not replaced on page 2')
    if (!v.bgRed) throw new Error('red background was painted over')
    if (!v.imgKept) throw new Error('image on page 2 was removed')
    if (v.pages !== 3) throw new Error(`page count changed: ${v.pages}`)
    console.log('✅ Edit-text batch verified: attrs extracted, 2 edits applied, 1 rejected, background & image preserved.')

    // 5. 畸形属性项隔离：短 color 数组 + 字符串条目 → 逐块失败不拖垮整批
    // 说明：字符串条目会被 TS 侧 wire 映射剥成 {}，无法通过 editTextBatch 原样送达，
    // 因此本用例直接调用 bridge.py --action edit_text_batch 验证 Python 侧的隔离逻辑。
    console.log('[EditBatch Test 5] Verifying malformed-item isolation (bad color / string item)...')
    const out5 = path.join(testDir, 'sample_edit_batch_malformed_out.pdf').replace(/\\/g, '/')
    created.push(out5)
    const badEdits = [
      { page: 3, rect: [60, 200, 300, 220], newText: 'STILL WORKS', fontName: null, fontSize: null, color: null },
      { page: 3, rect: [60, 300, 300, 320], newText: 'BAD COLOR', fontName: null, fontSize: null, color: [0.5] },
      'abc'
    ]
    const res5 = await runBridge([
      '--action', 'edit_text_batch',
      '--input', fixPath,
      '--output', out5,
      '--edits', JSON.stringify(badEdits)
    ])
    if (!res5.success || !Array.isArray(res5.results)) throw new Error(`malformed batch should still succeed overall: ${JSON.stringify(res5)}`)
    const by5 = new Map<number, any>(res5.results.map((r: any) => [r.index, r]))
    if (by5.get(0)?.ok !== true) throw new Error(`normal item should be ok: ${JSON.stringify(res5.results)}`)
    const err1 = String(by5.get(1)?.error || '')
    if (by5.get(1)?.ok !== false || !err1.includes('属性字段无效')) {
      throw new Error(`short color array item should fail with 属性字段无效, got: ${JSON.stringify(by5.get(1))}`)
    }
    const err2 = String(by5.get(2)?.error || '')
    if (by5.get(2)?.ok !== false || !err2.includes('编辑项格式无效')) {
      throw new Error(`string item should fail with 编辑项格式无效, got: ${JSON.stringify(by5.get(2))}`)
    }
    console.log('✅ Malformed items isolated: normal ok, bad color → 属性字段无效, string → 编辑项格式无效.')

    // 6. 溢出缩字号 warning：小矩形 + 相对过长文本 → ok:true 且 warning 含"缩小字号"
    console.log('[EditBatch Test 6] Verifying overflow shrink-to-fit warning...')
    const out6 = path.join(testDir, 'sample_edit_batch_shrink_out.pdf').replace(/\\/g, '/')
    created.push(out6)
    const shrinkEdits: TextEditItem[] = [
      { page: 3, blockId: 'synthetic-shrink', rect: [60, 400, 160, 415], oldText: '', newText: 'SHRINK ME', fontName: null, fontSize: 14, color: null }
    ]
    const res6 = await pythonService.editTextBatch(fixPath, out6, shrinkEdits)
    if (!res6.success || !res6.results) throw new Error(`shrink batch failed: ${res6.error}`)
    const r6 = res6.results[0]
    if (!r6?.ok) throw new Error(`shrink edit should be ok: ${JSON.stringify(res6.results)}`)
    if (!String(r6.warning || '').includes('缩小字号')) {
      throw new Error(`expected shrink warning, got: ${JSON.stringify(r6.warning)}`)
    }
    console.log(`✅ Overflow shrink warning verified: ${r6.warning}`)

    // 7. 同页双块背景互不污染：红底块 + 蓝底块同批编辑，各自背景保留原色系
    console.log('[EditBatch Test 7] Verifying dual-block same-page background isolation...')
    const bgFix = path.join(testDir, 'sample_edit_batch_bg.pdf').replace(/\\/g, '/')
    const bgOut = path.join(testDir, 'sample_edit_batch_bg_out.pdf').replace(/\\/g, '/')
    created.push(bgFix, bgOut)
    await runPython(`
import pymupdf
doc = pymupdf.open()
p = doc.new_page(width=595, height=842)
p.draw_rect(pymupdf.Rect(50, 60, 280, 120), color=None, fill=(0.8, 0.1, 0.1))
p.insert_text((60, 95), "RED BLOCK TEXT", fontsize=12, color=(1, 1, 1), fontname="helv")
p.draw_rect(pymupdf.Rect(310, 60, 545, 120), color=None, fill=(0.1, 0.1, 0.8))
p.insert_text((320, 95), "BLUE BLOCK TEXT", fontsize=12, color=(1, 1, 1), fontname="helv")
doc.save("${bgFix}")
doc.close()
print("bg-fixture-ok")
`)
    const bgBlocks = await pythonService.getTextBlocks(bgFix, 1)
    if (!bgBlocks.success || !bgBlocks.blocks) throw new Error(`getTextBlocks(bg) failed: ${bgBlocks.error}`)
    const bRed = bgBlocks.blocks.find((b: any) => b.text.includes('RED BLOCK'))
    const bBlue = bgBlocks.blocks.find((b: any) => b.text.includes('BLUE BLOCK'))
    if (!bRed || !bBlue) throw new Error('red/blue blocks not found on shared page')
    const bgEdits: TextEditItem[] = [
      { page: 1, blockId: (bRed as any).id, rect: (bRed as any).rect, oldText: (bRed as any).text, newText: 'RED NEW TEXT', fontName: null, fontSize: 12, color: [1, 1, 1] },
      { page: 1, blockId: (bBlue as any).id, rect: (bBlue as any).rect, oldText: (bBlue as any).text, newText: 'BLUE NEW TEXT', fontName: null, fontSize: 12, color: [1, 1, 1] }
    ]
    const resBg = await pythonService.editTextBatch(bgFix, bgOut, bgEdits)
    if (!resBg.success || !resBg.results || resBg.results.some((r) => !r.ok)) {
      throw new Error(`dual-block batch failed: ${JSON.stringify(resBg)}`)
    }
    const bgVerdict = JSON.parse(await runPython(`
import pymupdf, json
d = pymupdf.open("${bgOut}")
pix = d[0].get_pixmap(dpi=72)
r = pix.pixel(150, 112)
b = pix.pixel(450, 112)
t = d[0].get_text()
out = {
  "redKept": r[0] > 140 and r[1] < 110 and r[2] < 110,
  "blueKept": b[2] > 140 and b[0] < 110 and b[1] < 110,
  "redText": "RED NEW TEXT" in t,
  "blueText": "BLUE NEW TEXT" in t,
  "oldGone": "RED BLOCK TEXT" not in t and "BLUE BLOCK TEXT" not in t,
}
d.close()
print(json.dumps(out))
`))
    if (!bgVerdict.redKept) throw new Error('red region background was polluted')
    if (!bgVerdict.blueKept) throw new Error('blue region background was polluted')
    if (!bgVerdict.redText || !bgVerdict.blueText) throw new Error(`dual-block text not replaced: ${JSON.stringify(bgVerdict)}`)
    if (!bgVerdict.oldGone) throw new Error('old dual-block text was not erased')
    console.log('✅ Same-page dual blocks edited without cross-contaminating backgrounds.')

    // 8. 加密文档：整体 success:false 且错误信息含"加密"
    console.log('[EditBatch Test 8] Verifying encrypted-document rejection...')
    const encFix = path.join(testDir, 'sample_edit_batch_enc.pdf').replace(/\\/g, '/')
    const encOut = path.join(testDir, 'sample_edit_batch_enc_out.pdf').replace(/\\/g, '/')
    created.push(encFix, encOut)
    await runPython(`
import pymupdf
d = pymupdf.open("${fixPath}")
d.save("${encFix}", encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="secret", user_pw="secret")
d.close()
print("enc-fixture-ok")
`)
    const encEdits: TextEditItem[] = [
      { page: 1, blockId: 'synthetic-enc', rect: [60, 80, 300, 100], oldText: '', newText: 'NOPE', fontName: null, fontSize: null, color: null }
    ]
    const resEnc = await pythonService.editTextBatch(encFix, encOut, encEdits)
    if (resEnc.success) throw new Error('encrypted document should not succeed')
    if (!String(resEnc.error || '').includes('加密')) {
      throw new Error(`expected encryption error message, got: ${resEnc.error}`)
    }
    console.log(`✅ Encrypted document rejected: ${resEnc.error}`)

    // 9. 分批链路：201 条小编辑（超条目数与字节数双上限）→ 全局索引连续、输出落盘、临时文件零残留
    console.log('[EditBatch Test 9] Verifying chunked batch chain (201 edits, global index remap)...')
    const chunkFix = path.join(testDir, 'sample_edit_batch_chunked.pdf').replace(/\\/g, '/')
    const chunkOut = path.join(testDir, 'sample_edit_batch_chunked_out.pdf').replace(/\\/g, '/')
    created.push(chunkFix, chunkOut)
    await runPython(`
import pymupdf
doc = pymupdf.open()
for i in range(1, 202):
    p = doc.new_page(width=595, height=842)
    p.insert_text((60, 95), f"Page {i} original text", fontsize=12, fontname="helv")
doc.save("${chunkFix}")
doc.close()
print("chunk-fixture-ok")
`)
    const chunkEdits: TextEditItem[] = []
    for (let i = 1; i <= 201; i++) {
      chunkEdits.push({
        page: i,
        blockId: `synthetic-${i}`,
        rect: [60, 82, 300, 100],
        oldText: `Page ${i} original text`,
        newText: `EDITED PAGE ${i}`,
        fontName: null,
        fontSize: 12,
        color: null
      })
    }
    // 预检：序列化载荷确实超出单批字节预算，必然触发分批
    const wireBytes = chunkEdits.reduce(
      (acc, e) => acc + JSON.stringify({ page: e.page, rect: e.rect, newText: e.newText, fontName: e.fontName, fontSize: e.fontSize, color: e.color }).length + 1,
      2
    )
    if (wireBytes <= PythonService.EDIT_BATCH_BYTES || chunkEdits.length <= PythonService.EDIT_BATCH_LIMIT) {
      throw new Error(`test payload must exceed chunk limits: bytes=${wireBytes}, items=${chunkEdits.length}`)
    }
    const tmpBefore = snapshotTempFiles()
    const resChunk = await pythonService.editTextBatch(chunkFix, chunkOut, chunkEdits)
    const tmpAfter = snapshotTempFiles()
    if (!resChunk.success || !resChunk.results) throw new Error(`chunked batch failed: ${resChunk.error}`)
    if (resChunk.results.length !== chunkEdits.length) {
      throw new Error(`expected ${chunkEdits.length} results, got ${resChunk.results.length}`)
    }
    const indices = resChunk.results.map((r) => r.index)
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== i) throw new Error(`results indices must be globally sequential 0..n-1, broke at position ${i}: got ${indices[i]}`)
    }
    const failedItems = resChunk.results.filter((r) => !r.ok)
    if (failedItems.length > 0) throw new Error(`all chunked edits should be ok, failed: ${JSON.stringify(failedItems.slice(0, 5))}`)
    const outStat = await fs.stat(chunkOut)
    if (outStat.size <= 0) throw new Error('chunked output file missing or empty')
    const leftovers = [...tmpAfter].filter((n) => !tmpBefore.has(n))
    if (leftovers.length > 0) throw new Error(`temp files leaked in os.tmpdir(): ${leftovers.join(', ')}`)
    const chunkVerdict = JSON.parse(await runPython(`
import pymupdf, json
d = pymupdf.open("${chunkOut}")
t_first = d[0].get_text()
t_last = d[200].get_text()
out = {"pages": len(d), "first": "EDITED PAGE 1" in t_first, "last": "EDITED PAGE 201" in t_last}
d.close()
print(json.dumps(out))
`))
    if (chunkVerdict.pages !== 201) throw new Error(`chunked output page count changed: ${chunkVerdict.pages}`)
    if (!chunkVerdict.first || !chunkVerdict.last) throw new Error(`chunk chain lost edits: ${JSON.stringify(chunkVerdict)}`)
    console.log(`✅ Chunked chain verified: ${indices.length} results with sequential global indices, wireBytes=${wireBytes}, no temp-file leftovers.`)
  } finally {
    for (const f of created) {
      await fs.unlink(f).catch(() => {})
    }
  }

  console.log('\n🎉 ALL EDIT-TEXT BATCH & FIDELITY TESTS PASSED SUCCESSFULLY! 🎉\n')
}

runEditTextBatchTests().catch((err) => {
  console.error('❌ Edit-text batch test failed:', err)
  process.exit(1)
})
