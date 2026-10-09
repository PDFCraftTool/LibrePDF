# 正文编辑批量队列 + 保真度优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把正文编辑从「每块一次子进程 + 全文档重载」改为前端待应用队列 + 一次批量 Python action，并让回写文字使用真实字体名/字号/颜色、背景色采样保护、图片像素级保护。

**Architecture:** bridge.py 升级 `get_page_text_blocks`（span 级真实属性 + 稳定坐标键 ID）并新增 `edit_text_batch` action（背景采样 → 采样色 redact → 真实属性回写，逐块结果）；pythonService 新增 `editTextBatch`（>200 项自动分批串联）；useDocumentStore 新增 `pendingEdits` 队列与 `applyPendingEdits`（一次批量 = 一条 undo 历史）；PDFViewer 改为瞬时入队交互 + 应用按钮 + 进度遮罩 + Esc/完成退出。

**Tech Stack:** Python 3.12 + PyMuPDF 1.28（numpy 已有）、Electron IPC、React 19 + Zustand 5、tsx 直跑测试。

**Spec:** `docs/superpowers/specs/2026-10-09-edit-text-ux-design.md`

**命名说明:** IPC 通道采用 `python:editTextBatch`（与现有 `python:getTextBlocks`/`python:editText` 命名一致，取代 spec §4.3 中写的 `pdf:editTextBatch`）。

**注意事项:**
- 本项目当前**没有 git 仓库**，Task 0 先初始化，之后每个 Task 结束都提交。
- bridge.py 顶部的 `import re`、`import numpy as np` 已存在，直接使用。
- `python/bridge.py` 中 argparse 的 `--fontSize` 参数已存在（edit_text 在用），不要重复添加。

---

### Task 0: 初始化 git 基线

**Files:**
- Create: `.gitignore`

- [x] **Step 1: 写 .gitignore**

```gitignore
node_modules/
dist/
dist-electron/
release/
__pycache__/
*.pyc
*.log
*.tsbuildinfo
.DS_Store
tests/fixtures/
!tests/fixtures/.gitkeep
```

注意：`tests/fixtures/` 下有测试自生成的样例文件，整体忽略后补一个空占位：`touch tests/fixtures/.gitkeep`（Windows 下 `type nul > tests/fixtures/.gitkeep`）。

- [x] **Step 2: 初始化并提交基线**

```bash
git init
git add .gitignore README.md package.json pnpm-lock.yaml electron-builder.json5 index.html postcss.config.js tailwind.config.js vite.config.ts tsconfig.json tsconfig.node.json .npmrc docs python src tests/*.ts tests/fixtures/.gitkeep
git commit -m "chore: baseline before edit-text batch/fidelity feature"
```

预期：`git log --oneline` 显示 1 条提交；`git status` 无已跟踪文件改动。

---

### Task 1: bridge.py 升级 get_page_text_blocks（span 级真实属性 + 稳定 ID）

**Files:**
- Modify: `python/bridge.py`（`get_page_text_blocks`，约 263-310 行）

- [x] **Step 1: 写失败测试脚本**

创建 `tests/tmp_check_blocks.py`（临时文件，Task 结束时删除）：

```python
import subprocess, sys, json, os
import pymupdf

FIX = "tests/fixtures/sample_edit_blocks.pdf"
doc = pymupdf.open()
p = doc.new_page(width=595, height=842)
p.insert_text((60, 95), "Alpha Bravo Charlie", fontsize=14, color=(0.8, 0.1, 0.1), fontname="helv")
doc.save(FIX); doc.close()

def blocks():
    r = subprocess.run([sys.executable, "python/bridge.py", "--action", "get_text_blocks",
                        "--input", FIX, "--page", "1"], capture_output=True, text=True, encoding="utf-8")
    out = r.stdout[r.stdout.index("{"): r.stdout.rindex("}") + 1]
    return json.loads(out)

res1, res2 = blocks(), blocks()
assert res1["success"], res1
b = [x for x in res1["blocks"] if "Alpha Bravo" in x["text"]][0]
assert abs(b["fontSize"] - 14) < 0.5, f"fontSize={b['fontSize']}"
assert abs(b["color"][0] - 0.8) < 0.05 and b["color"][1] < 0.2, f"color={b['color']}"
assert "+" not in b["fontName"], f"fontName has subset prefix: {b['fontName']}"
ids1 = sorted(x["id"] for x in res1["blocks"])
ids2 = sorted(x["id"] for x in res2["blocks"])
assert ids1 == ids2 and ids1[0].split("-")[0] == "1", f"unstable ids: {ids1}"
print("OK get_page_text_blocks")
os.remove(FIX)
```

- [x] **Step 2: 运行确认失败**

```bash
python tests/tmp_check_blocks.py
```

预期：FAIL（fontSize 是估算值 ~16.x 或 color 键不存在 KeyError）。

- [x] **Step 3: 重写 get_page_text_blocks**

在 `python/bridge.py` 中，将 `get_page_text_blocks` 的函数体从 `page = doc[page_num - 1]` 到 `doc.close()` 之前（即 `blocks_data = []` 开始的提取循环整段）替换为：

```python
    page = doc[page_num - 1]
    blocks_data = []

    # 使用 dict 结构获取 span 级真实字体属性（替代 blocks 模式的启发式估算）
    data = page.get_text("dict")
    for b in data.get("blocks", []):
        if b.get("type") != 0:
            continue
        x0, y0, x1, y1 = b["bbox"]
        spans = []
        for line in b.get("lines", []):
            for sp in line.get("spans", []):
                if sp.get("text", "").strip():
                    spans.append(sp)
        if not spans:
            continue
        text = "\n".join(
            "".join(sp.get("text", "") for sp in line.get("spans", []))
            for line in b.get("lines", [])
        ).rstrip()
        if not text.strip():
            continue

        # 按字符数占比选出主字体，取其真实字号与颜色
        font_stats: Dict[str, Dict[str, Any]] = {}
        for sp in spans:
            fname = re.sub(r"^[A-Z]{6}\+", "", sp.get("font", ""))  # 剥离子集前缀
            if fname not in font_stats:
                font_stats[fname] = {"chars": 0, "size": sp.get("size", 12), "color": sp.get("color", 0)}
            font_stats[fname]["chars"] += len(sp.get("text", ""))
        main_name, main_info = max(font_stats.items(), key=lambda kv: kv[1]["chars"])
        ci = int(main_info["color"])
        color = [round(((ci >> 16) & 255) / 255, 3), round(((ci >> 8) & 255) / 255, 3), round((ci & 255) / 255, 3)]

        blocks_data.append({
            # 稳定坐标键：重提取后不变，前端绿框覆盖不再错位
            "id": f"{page_num}-{round(x0)}-{round(y0)}-{round(x1)}-{round(y1)}",
            "rect": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
            "text": text,
            "fontName": main_name,
            "fontSize": round(float(main_info["size"]), 1),
            "color": color
        })
```

保持函数结尾的 `page_width/page_height/doc.close()/return {...}` 原样不动（返回结构中 `blocks` 键不变，仅块内新增字段）。

- [x] **Step 4: 运行确认通过**

```bash
python tests/tmp_check_blocks.py
```

预期：输出 `OK get_page_text_blocks`。

- [x] **Step 5: 确认现有 action 名与分发不受影响**

```bash
python python/bridge.py --action get_text_blocks --input tests/fixtures/sample_doc.pdf --page 1 | python -c "import sys,json; d=json.load(sys.stdin); print(d['success'], len(d['blocks']), list(d['blocks'][0].keys()))"
```

预期：`True N [...]`，keys 含 `id rect text fontName fontSize color`。

- [x] **Step 6: 删除临时脚本并提交**

```bash
rm tests/tmp_check_blocks.py
git add python/bridge.py
git commit -m "feat(bridge): span-level font attributes and stable block ids in get_page_text_blocks"
```

---

### Task 2: bridge.py 新增 edit_text_batch action

**Files:**
- Modify: `python/bridge.py`（新增函数 + argparse `--edits` + 分发分支）

- [x] **Step 1: 写失败测试脚本**

创建 `tests/tmp_check_batch.py`（临时文件，Task 结束时删除）：

```python
import subprocess, sys, json, os
import pymupdf

FIX = "tests/fixtures/sample_edit_batch.pdf"
OUT = "tests/fixtures/sample_edit_batch_out.pdf"

# 构造：页1 红底白字；页2 普通文本 + 图片；页3 普通文本
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
doc.save(FIX); doc.close()

def bridge(*args):
    r = subprocess.run([sys.executable, "python/bridge.py", *args], capture_output=True, text=True, encoding="utf-8")
    return json.loads(r.stdout[r.stdout.index("{"): r.stdout.rindex("}") + 1])

def get_blocks(page):
    return bridge("--action", "get_text_blocks", "--input", FIX, "--page", str(page))["blocks"]

b1 = [b for b in get_blocks(1) if "SECRET" in b["text"]][0]
b2 = [b for b in get_blocks(2) if "Normal" in b["text"]][0]

edits = [
    {"page": 1, "rect": b1["rect"], "newText": "REPLACED ON RED", "fontName": b1["fontName"], "fontSize": b1["fontSize"], "color": [1, 1, 1]},
    {"page": 2, "rect": b2["rect"], "newText": "EDITED PAGE TWO", "fontName": None, "fontSize": None, "color": None},
    {"page": 3, "rect": [9999, 9999, 10001, 10001], "newText": "SHOULD FAIL", "fontName": None, "fontSize": None, "color": None},
]
res = bridge("--action", "edit_text_batch", "--input", FIX, "--output", OUT, "--edits", json.dumps(edits))
assert res["success"], res
by_idx = {r["index"]: r for r in res["results"]}
assert by_idx[0]["ok"] and by_idx[1]["ok"], res["results"]
assert not by_idx[2]["ok"], "out-of-page rect should fail"

# 验证输出
d = pymupdf.open(OUT)
t1 = d[0].get_text()
assert "REPLACED ON RED" in t1 and "SECRET RED BACKGROUND" not in t1, t1
assert "EDITED PAGE TWO" in d[1].get_text()
assert len(d[0].get_text()) < 200
# 背景保护：红底矩形左上角 (55,65) 仍是红色系
pix = d[0].get_pixmap(clip=pymupdf.Rect(52, 62, 58, 68), dpi=72)
px = pix.pixel(pix.width // 2, pix.height // 2)
assert px[0] > 140 and px[1] < 110 and px[2] < 110, f"background lost: {px}"
# 图片保护：页2 图片对象数量不减
assert len(d[1].get_images()) >= 1, "image removed"
assert len(d) == 3
d.close()
print("OK edit_text_batch")
os.remove(FIX); os.remove(OUT)
```

- [x] **Step 2: 运行确认失败**

```bash
python tests/tmp_check_batch.py
```

预期：FAIL，报 `未知的操作类型: edit_text_batch`。

- [x] **Step 3: 在 bridge.py 中实现**

3a. 在 `edit_text_block` 函数之后（约 366 行 `# 4. 物理脱敏` 注释之前）插入：

```python
# 匹配 CJK 字符（中日韩），用于回写字体选择
_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3040-\u30ff\u3130-\u318f\uac00-\ud7af]")


def _map_edit_fontname(text: str, orig_font: Optional[str]) -> str:
    """回写字体映射：CJK → china-s；西文按原字体名特征映射 PyMuPDF 内置字体"""
    if _CJK_RE.search(text or ""):
        return "china-s"
    f = (orig_font or "").lower()
    if any(k in f for k in ("serif", "song", "times", "ming", "garamond", "georgia", "palatino")):
        return "tiro"
    if any(k in f for k in ("mono", "courier", "consol")):
        return "courier"
    return "helv"


def _sample_bg_color(page, rect) -> Tuple[float, float, float]:
    """采样文本块区域背景众数色；与 page.rect 求交防边缘越界；失败回退白色"""
    try:
        clip = pymupdf.Rect(rect.x0 - 2, rect.y0 - 2, rect.x1 + 2, rect.y1 + 2) & page.rect
        if clip.is_empty:
            return (1.0, 1.0, 1.0)
        pix = page.get_pixmap(clip=clip, dpi=72)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)[:, :, :3]
        colors, counts = np.unique(arr.reshape(-1, 3), axis=0, return_counts=True)
        dom = colors[int(counts.argmax())]
        return (round(dom[0] / 255, 3), round(dom[1] / 255, 3), round(dom[2] / 255, 3))
    except Exception:
        return (1.0, 1.0, 1.0)


def edit_text_batch(input_path: str, output_path: str, edits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    批量正文编辑：一次子进程调用处理多个文本块。
    每块流程：背景采样 → 采样色 redact 擦除（图片像素级保护）→ 真实字体/字号/颜色回写。
    逐块返回结果，部分失败不影响其余块。
    """
    if not os.path.exists(input_path):
        return {"success": False, "error": "输入文件不存在"}
    if not edits:
        return {"success": False, "error": "编辑列表为空"}

    doc = pymupdf.open(input_path)
    results: List[Dict[str, Any]] = []

    # 按页分组，同页共享一次 apply_redactions
    by_page: Dict[int, List[Tuple[int, Dict[str, Any]]]] = {}
    for i, e in enumerate(edits):
        try:
            pg = int(e.get("page", 1))
        except (TypeError, ValueError):
            results.append({"index": i, "ok": False, "error": "page 字段无效"})
            continue
        by_page.setdefault(pg, []).append((i, e))

    for page_num in sorted(by_page.keys()):
        items = by_page[page_num]
        if page_num < 1 or page_num > len(doc):
            for i, _e in items:
                results.append({"index": i, "ok": False, "error": "页码超出范围"})
            continue
        page = doc[page_num - 1]

        # 阶段 1：校验矩形、采样背景、添加 redact 标注
        prepared = []
        for i, e in items:
            try:
                rect = pymupdf.Rect(e["rect"])
                if rect.is_empty or (rect & page.rect).is_empty:
                    results.append({"index": i, "ok": False, "error": "矩形超出页面范围"})
                    continue
                bg = _sample_bg_color(page, rect)
                page.add_redact_annot(rect, fill=bg)
                prepared.append((i, e, rect))
            except Exception as ex:
                results.append({"index": i, "ok": False, "error": f"矩形无效: {ex}"})

        # 阶段 2：整页一次性应用擦除（图片区域像素级擦除，不整块移除图片）
        if prepared:
            page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)

        # 阶段 3：按真实属性回写
        for i, e, rect in prepared:
            new_text = str(e.get("newText", ""))
            font_size = float(e.get("fontSize") or max(9.0, min(18.0, (rect.y1 - rect.y0) * 0.7)))
            color_arr = e.get("color") or [0.1, 0.1, 0.1]
            color = (float(color_arr[0]), float(color_arr[1]), float(color_arr[2]))
            fontname = _map_edit_fontname(new_text, e.get("fontName"))
            warning = None
            try:
                size = font_size
                rc = page.insert_textbox(rect, new_text, fontsize=size, fontname=fontname,
                                         color=color, align=pymupdf.TEXT_ALIGN_LEFT)
                while rc < 0 and size > 6.0:
                    size = round(size * 0.9, 1)
                    rc = page.insert_textbox(rect, new_text, fontsize=size, fontname=fontname,
                                             color=color, align=pymupdf.TEXT_ALIGN_LEFT)
                if rc < 0:
                    raise RuntimeError("文本溢出且无法通过缩小字号容纳")
                if size < font_size:
                    warning = "文本溢出，已缩小字号"
                results.append({"index": i, "ok": True, "warning": warning})
            except Exception as ex:
                try:
                    # 兜底基线插入（与现有 edit_text_block 兜底一致：块左下角基线）
                    page.insert_text(pymupdf.Point(rect.x0, rect.y1 - 4), new_text,
                                     fontsize=font_size, fontname=fontname, color=color)
                    results.append({"index": i, "ok": True, "warning": f"兜底插入: {ex}"})
                except Exception as ex2:
                    results.append({"index": i, "ok": False, "error": str(ex2)})

    results.sort(key=lambda r: r["index"])
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()
    return {"success": True, "outputPath": output_path, "results": results}
```

3b. 在 argparse 区（`--text` 参数定义之后，约 2415 行附近）加：

```python
    parser.add_argument("--edits", help="批量正文编辑项，JSON 数组")
```

3c. 在 main 分发的 `if args.action == "edit_text":` 分支之后加：

```python
    if args.action == "edit_text_batch":
        edits = json.loads(args.edits) if args.edits else []
        res = edit_text_batch(args.input, args.output, edits)
        print(json.dumps(res))
        return
```

- [x] **Step 4: 运行确认通过**

```bash
python tests/tmp_check_batch.py
```

预期：输出 `OK edit_text_batch`。

- [x] **Step 5: 回归现有脱敏测试不受影响**

```bash
npm run test:sidecar
```

预期：3 项全部 PASS（bridge.py 顶部语法与既有 action 未被破坏）。

- [x] **Step 6: 删除临时脚本并提交**

```bash
rm tests/tmp_check_batch.py
git add python/bridge.py
git commit -m "feat(bridge): add edit_text_batch action with background sampling and image-safe redaction"
```

---

### Task 3: TS 链路（types + pythonService + IPC + preload）

**Files:**
- Modify: `src/shared/types.ts`（约 232 行附近）
- Modify: `src/main/services/pythonService.ts`（`editText` 方法之后，约 360 行）
- Modify: `src/main/index.ts`（`python:editText` handler 之后，约 544 行）
- Modify: `src/preload/index.ts`（`pythonEditText` 之后，约 54 行）

- [x] **Step 1: shared/types.ts 增加类型并收紧签名**

在 `ElectronAPI` 接口（`pythonGetTextBlocks` 所在接口）之前合适位置新增：

```typescript
/** 单个文本块的提取信息（span 级真实属性；PDF.js 回退块属性可为 null） */
export interface TextBlockInfo {
  id: string
  rect: number[]
  text: string
  fontName?: string | null
  fontSize?: number | null
  color?: number[] | null
  isClient?: boolean
}

/** 待应用的批量正文编辑项 */
export interface TextEditItem {
  page: number
  blockId: string
  rect: number[]
  oldText: string
  newText: string
  fontName: string | null
  fontSize: number | null
  color: number[] | null
}

/** 批量编辑逐块结果（index 为全局索引） */
export interface TextEditResult {
  index: number
  ok: boolean
  warning?: string | null
  error?: string
}
```

把现有两行签名改为：

```typescript
  pythonGetTextBlocks: (inputPath: string, pageNum: number) => Promise<{ success: boolean; blocks?: TextBlockInfo[]; pageWidth?: number; pageHeight?: number; error?: string }>
  pythonEditTextBatch: (inputPath: string, outputPath: string, edits: TextEditItem[]) => Promise<{ success: boolean; outputPath?: string; results?: TextEditResult[]; error?: string }>
```

（`pythonEditText` 保留不动，AI ReAct 链路仍在用。）

- [x] **Step 2: pythonService.ts 新增 editTextBatch（含分批）**

确认文件顶部已有 `import path from 'node:path'`（如无则补），在 `editText` 方法之后插入：

```typescript
  /**
   * 批量正文编辑：一次子进程调用处理多个文本块。
   * Windows argv 上限约 32K，edits 超过 200 项时内部自动分批串联：
   * 第 i 批的 output 即第 i+1 批的 input；results[].index 统一换算为全局索引。
   * 中途批次失败：停止后续批次，返回已成功批次的 results 与 success:false。
   */
  async editTextBatch(
    inputPath: string,
    outputPath: string,
    edits: Array<{ page: number; rect: number[]; newText: string; fontName?: string | null; fontSize?: number | null; color?: number[] | null }>
  ): Promise<{ success: boolean; outputPath?: string; results?: Array<{ index: number; ok: boolean; warning?: string | null; error?: string }>; error?: string }> {
    if (!edits || edits.length === 0) {
      return { success: false, error: '编辑列表为空' }
    }
    const BATCH_LIMIT = 200
    if (edits.length <= BATCH_LIMIT) {
      return this.runEditTextBatch(inputPath, outputPath, edits, 0)
    }
    const allResults: Array<{ index: number; ok: boolean; warning?: string | null; error?: string }> = []
    const tempFiles: string[] = []
    let currentInput = inputPath
    try {
      for (let start = 0; start < edits.length; start += BATCH_LIMIT) {
        const chunk = edits.slice(start, start + BATCH_LIMIT)
        const isLast = start + BATCH_LIMIT >= edits.length
        const chunkOutput = isLast
          ? outputPath
          : path.join(os.tmpdir(), `pdfopen_batch_${Date.now()}_${start}.pdf`)
        if (!isLast) tempFiles.push(chunkOutput)
        const res = await this.runEditTextBatch(currentInput, chunkOutput, chunk, start)
        if (!res.success) {
          return { success: false, error: res.error, results: allResults }
        }
        allResults.push(...(res.results || []))
        currentInput = chunkOutput
      }
      return { success: true, outputPath, results: allResults }
    } finally {
      for (const f of tempFiles) {
        try { fsSync.unlinkSync(f) } catch { /* 忽略清理失败 */ }
      }
    }
  }

  private async runEditTextBatch(
    inputPath: string,
    outputPath: string,
    edits: Array<{ page: number; rect: number[]; newText: string; fontName?: string | null; fontSize?: number | null; color?: number[] | null }>,
    indexOffset: number
  ): Promise<{ success: boolean; outputPath?: string; results?: Array<{ index: number; ok: boolean; warning?: string | null; error?: string }>; error?: string }> {
    try {
      const pythonBin = await this.findPythonExecutable()
      const scriptPath = this.getBridgeScriptPath()
      const args = [
        scriptPath,
        '--action', 'edit_text_batch',
        '--input', inputPath,
        '--output', outputPath,
        '--edits', JSON.stringify(edits)
      ]
      const { stdout } = await execFileAsync(pythonBin, args, { encoding: 'utf-8' })
      const parsed = this.extractJsonFromStdout(stdout)
      if (parsed.success && Array.isArray(parsed.results)) {
        parsed.results = parsed.results.map((r: any) => ({ ...r, index: r.index + indexOffset }))
      }
      return parsed
    } catch (err: any) {
      return { success: false, error: err.message || '批量正文编辑失败' }
    }
  }
```

顶部如缺少则补充导入（与现有导入风格一致）：

```typescript
import os from 'node:os'
import fsSync from 'node:fs'
```

- [x] **Step 3: index.ts 注册 IPC handler**

在 `ipcMain.handle('python:editText', ...)`（约 544 行）之后加（pythonService 实例名以该文件现有写法为准）：

```typescript
  ipcMain.handle('python:editTextBatch', async (_, inputPath: string, outputPath: string, edits: any[]) => {
    return pythonService.editTextBatch(inputPath, outputPath, edits)
  })
```

- [x] **Step 4: preload/index.ts 暴露**

在 `pythonEditText` 条目之后加：

```typescript
  pythonEditTextBatch: (inputPath: string, outputPath: string, edits: any[]) =>
    ipcRenderer.invoke('python:editTextBatch', inputPath, outputPath, edits),
```

（参数类型如 preload 现有条目使用具体类型而非 any，则改为 `import type { TextEditItem } from '../shared/types'` 并使用 `TextEditItem[]`。）

- [x] **Step 5: 类型检查**

```bash
npx tsc -p tsconfig.node.json --noEmit && npx tsc --noEmit
```

预期：零错误。

- [x] **Step 6: 提交**

```bash
git add src/shared/types.ts src/main/services/pythonService.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(main): editTextBatch service with auto-chunking, IPC channel and shared types"
```

---

### Task 4: 端到端测试 tests/editTextBatch.test.ts

**Files:**
- Create: `tests/editTextBatch.test.ts`
- Modify: `package.json`（test 脚本）

- [x] **Step 1: 写测试文件**

覆盖用例（在下方基础代码上，实施者需在 Test 3 之后追加以下用例，风格与现有断言一致）：
- **畸形属性项**：edits 含 `color: [0.5]` 短数组项与 `"abc"` 字符串项 → 断言整批 `success:true`、畸形项 `ok:false` 且 error 含「属性字段无效」/「编辑项格式无效」、正常项不受影响
- **溢出缩字号 warning**：小 rect + 长文本 → 断言该项 `ok:true` 且 `warning` 含「缩小字号」
- **同页双块**：同一页两个相邻块各放彩色背景（一红一蓝）并同时编辑 → 断言两块背景采样互不污染（各自区域内像素仍为原色系）
- **加密文档**：pymupdf 设 owner password 的副本 → 断言返回 `success:false` 且 error 含「加密」
- **分批链路**：将 pythonService 的 `BATCH_LIMIT` 常量导出（或测试中构造 201 项 edits）触发分批 → 断言全部 results 索引为全局连续、输出文件为最终 outputPath、中间临时文件已清理

```typescript
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PythonService } from '../src/main/services/pythonService'

const execFileAsync = promisify(execFile)

/** 直接跑一段 Python 代码（用于构造 fixture 与像素级断言），返回 stdout */
async function runPython(code: string): Promise<string> {
  const { stdout } = await execFileAsync('python', ['-c', code], { encoding: 'utf-8' })
  return stdout.trim()
}

async function runEditTextBatchTests() {
  console.log('--- ✏️ Starting Edit-Text Batch & Fidelity Tests ---')
  const pythonService = new PythonService()
  const testDir = path.join(process.cwd(), 'tests', 'fixtures')
  await fs.mkdir(testDir, { recursive: true })
  const fixPath = path.join(testDir, 'sample_edit_batch.pdf').replace(/\\/g, '/')
  const outPath = path.join(testDir, 'sample_edit_batch_out.pdf').replace(/\\/g, '/')

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

  // 3. 批量编辑：2 成功 + 1 越界失败（部分失败不中断）
  console.log('[EditBatch Test 3] Running edit_text_batch with partial failure...')
  const r2blocks = await pythonService.getTextBlocks(fixPath, 2)
  const b2 = (r2blocks.blocks || []).find((b: any) => b.text.includes('Normal'))
  if (!b2) throw new Error('page-2 block not found')
  const edits = [
    { page: 1, rect: (b1 as any).rect, newText: 'REPLACED ON RED', fontName: (b1 as any).fontName, fontSize: (b1 as any).fontSize, color: [1, 1, 1] },
    { page: 2, rect: (b2 as any).rect, newText: 'EDITED PAGE TWO', fontName: null, fontSize: null, color: null },
    { page: 3, rect: [9999, 9999, 10001, 10001], newText: 'SHOULD FAIL', fontName: null, fontSize: null, color: null }
  ]
  const res = await pythonService.editTextBatch(fixPath, outPath, edits)
  if (!res.success || !res.results) throw new Error(`editTextBatch failed: ${res.error}`)
  const byIdx = new Map(res.results.map((r) => [r.index, r]))
  if (!byIdx.get(0)?.ok || !byIdx.get(1)?.ok) throw new Error(`expected edits 0,1 ok: ${JSON.stringify(res.results)}`)
  if (byIdx.get(2)?.ok !== false) throw new Error('out-of-page rect edit should fail')

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

  await fs.unlink(fixPath).catch(() => {})
  await fs.unlink(outPath).catch(() => {})
  console.log('\n🎉 ALL EDIT-TEXT BATCH & FIDELITY TESTS PASSED SUCCESSFULLY! 🎉\n')
}

runEditTextBatchTests().catch((err) => {
  console.error('❌ Edit-text batch test failed:', err)
  process.exit(1)
})
```

注意：`pythonService.getTextBlocks` 的方法名以 pythonService.ts 实际为准（IPC `python:getTextBlocks` 调用的那个方法，约 300-325 行），如叫别的名字则同步替换。

- [x] **Step 2: 注册进 package.json**

`scripts.test` 改为：

```json
"test": "tsx tests/pdfEngine.test.ts && tsx tests/pythonSidecar.test.ts && tsx tests/bentoStirlingEngine.test.ts && tsx tests/editTextBatch.test.ts",
"test:editbatch": "tsx tests/editTextBatch.test.ts"
```

- [x] **Step 3: 运行**

```bash
npm run test:editbatch
```

预期：4 个 Test 全过，输出 🎉。

- [x] **Step 4: 提交**

```bash
git add tests/editTextBatch.test.ts package.json
git commit -m "test: end-to-end regression for edit_text_batch fidelity"
```

---

### Task 5: useDocumentStore 待应用队列

**Files:**
- Modify: `src/renderer/src/stores/useDocumentStore.ts`

- [x] **Step 1: 导入类型**

文件顶部加：

```typescript
import type { TextEditItem } from '../../../shared/types'
```

- [x] **Step 2: 扩展 DocumentState 接口**

在 `isLoadingBlocks: boolean` 之后加状态：

```typescript
  pendingEdits: TextEditItem[]
  isApplyingEdits: boolean
  /** 应用失败的编辑项：key = `${page}:${blockId}`，value = 失败原因 */
  editFailures: Record<string, string>
```

在 `saveTextEdit` 签名之后加 action 签名：

```typescript
  enqueueTextEdit: (item: TextEditItem) => void
  discardEdit: (page: number, blockId: string) => void
  clearPendingEdits: () => void
  applyPendingEdits: () => Promise<{ applied: number; failed: number; error?: string }>
```

- [x] **Step 3: 初始状态**

在 `isLoadingBlocks: false,` 之后加：

```typescript
  pendingEdits: [],
  isApplyingEdits: false,
  editFailures: {},
```

- [x] **Step 4: 实现 action**

在 `saveTextEdit` 实现之后插入（`saveTextEdit` 保留不删，AI 链路仍可能引用）：

```typescript
  enqueueTextEdit: (item) =>
    set((s) => ({
      // 同页同块后改优先覆盖；入队即清除该项旧的失败标记
      pendingEdits: [
        ...s.pendingEdits.filter((e) => !(e.page === item.page && e.blockId === item.blockId)),
        item
      ],
      editFailures: Object.fromEntries(
        Object.entries(s.editFailures).filter(([k]) => k !== `${item.page}:${item.blockId}`)
      )
    })),

  discardEdit: (page, blockId) =>
    set((s) => ({
      pendingEdits: s.pendingEdits.filter((e) => !(e.page === page && e.blockId === blockId))
    })),

  clearPendingEdits: () => set({ pendingEdits: [], editFailures: {} }),

  applyPendingEdits: async () => {
    const { activeTabId, tabs, pendingEdits, isApplyingEdits } = get()
    const activeTab = tabs.find((t) => t.id === activeTabId)
    if (!activeTab || pendingEdits.length === 0 || isApplyingEdits) {
      return { applied: 0, failed: 0 }
    }
    set({ isApplyingEdits: true, editFailures: {} })
    try {
      const outputPath = await window.electronAPI.getTempPdfPath('pdfopen_text_batch')
      const res = await window.electronAPI.pythonEditTextBatch(activeTab.filePath, outputPath, pendingEdits)
      if (!res.success || !res.outputPath) {
        toast.error(tr('文字修改失败', 'Failed to edit text'), res.error)
        return { applied: 0, failed: pendingEdits.length, error: res.error }
      }
      const okIndexes = new Set((res.results || []).filter((r) => r.ok).map((r) => r.index))
      const applied = okIndexes.size
      const failedItems = pendingEdits.filter((_, idx) => !okIndexes.has(idx))
      const failures: Record<string, string> = {}
      for (const r of res.results || []) {
        if (!r.ok) {
          const item = pendingEdits[r.index]
          if (item) failures[`${item.page}:${item.blockId}`] = r.error || tr('未知错误', 'Unknown error')
        }
      }
      // 一次批量 = 一条 undo 历史
      const reloadOk = await get().applyModifiedPDF(res.outputPath, { silent: true })
      if (!reloadOk) return { applied: 0, failed: pendingEdits.length }
      await get().fetchPageTextBlocks()

      // 失败项 rect 可能因同页先前编辑的文本回流而过时：按 oldText 在新块中重新对位；
      // 对不上的项从队列移除并提示重新选择，避免用旧坐标重放擦错位置
      const cur = get()
      const curTab = cur.tabs.find((t) => t.id === cur.activeTabId)
      const kept: TextEditItem[] = []
      for (const item of failedItems) {
        if (curTab && item.page === curTab.currentPage) {
          const match = cur.pageTextBlocks.find((b: any) => b.text === item.oldText)
          if (match) {
            kept.push({ ...item, blockId: match.id, rect: match.rect })
            continue
          }
          failures[`${item.page}:${item.blockId}`] = tr('位置已失效，请重新选择文本块', 'Position stale, please re-select the text block')
          continue
        }
        kept.push(item)
      }
      set({ pendingEdits: kept, editFailures: failures })

      const summary =
        tr(`成功应用 ${applied} 处修改`, `${applied} edit(s) applied`) +
        (kept.length > 0 ? tr(`，${kept.length} 处失败`, `, ${kept.length} failed`) : '')
      if (kept.length > 0) {
        toast.error(tr('部分文字修改失败', 'Some edits failed'), summary)
      } else {
        toast.success(tr('文字修改已应用', 'Text edits applied'), summary)
      }
      return { applied, failed: kept.length }
    } catch (err) {
      console.error('applyPendingEdits error:', err)
      return { applied: 0, failed: pendingEdits.length, error: String(err) }
    } finally {
      set({ isApplyingEdits: false })
    }
  },
```

- [x] **Step 5: 文档切换/关闭时清空队列**

在 `closeTab`、`setActiveTab` 的 `set(...)` 中各追加 `pendingEdits: [], editFailures: {}`（两个 action 的实现体里找到对应 set 调用，加入这两个键）。`openDocument` 成功打开新文档的 set 中同样追加。

- [x] **Step 6: 类型检查 + 提交**

```bash
npx tsc --noEmit
git add src/renderer/src/stores/useDocumentStore.ts
git commit -m "feat(store): pendingEdits queue with batch apply, failure tracking and stale-rect relocation"
```

预期：零 TS 错误（此时 window.electronAPI.pythonEditTextBatch 类型已在 Task 3 声明）。

---

### Task 6: PDFViewer 交互改造

**Files:**
- Modify: `src/renderer/src/components/viewer/PDFViewer.tsx`

- [x] **Step 1: store 解构与本地状态调整**

组件顶部现有的 `useDocumentStore()` 解构（含 `isLoadingBlocks` 处，约 50-60 行）追加：

```typescript
    pendingEdits,
    isApplyingEdits,
    editFailures,
    enqueueTextEdit,
    clearPendingEdits,
    applyPendingEdits,
```

如解构中含 `saveTextEdit`，将其移除（本组件不再使用）。

本地状态区（约 72-76 行）：删除 `editedBlocks` state（76 行），保留 `editingBlockId/editingText/clientBlocks`；新增：

```typescript
  // 正在编辑块的元数据快照（页码/矩形/字体属性），翻页与切块时用于自动入队
  const editingMetaRef = useRef<{
    page: number
    rect: number[]
    oldText: string
    fontName: string | null
    fontSize: number | null
    color: number[] | null
  } | null>(null)
  const [failedHoverKey, setFailedHoverKey] = useState<string | null>(null)
```

（`useRef` 如未导入则加入 react 导入。）

- [x] **Step 2: 入队辅助函数**

在 `handleCommitTextEdit`（约 548 行）位置，用以下代码整体替换该函数：

```typescript
  // 把当前 textarea 草稿入队（瞬时，本地操作）；无草稿或空文本则只清理状态
  const enqueueCurrentDraft = () => {
    const meta = editingMetaRef.current
    if (editingBlockId && meta && editingText.trim()) {
      enqueueTextEdit({
        page: meta.page,
        blockId: editingBlockId,
        rect: meta.rect,
        oldText: meta.oldText,
        newText: editingText,
        fontName: meta.fontName,
        fontSize: meta.fontSize,
        color: meta.color
      })
    }
    editingMetaRef.current = null
    setEditingBlockId(null)
  }

  const handleApplyEdits = async () => {
    enqueueCurrentDraft()
    await applyPendingEdits() // toast 由 store 内部统一处理
  }

  const exitEditTextMode = async () => {
    enqueueCurrentDraft()
    const { pendingEdits: queue, applyPendingEdits: apply, clearPendingEdits: clear } =
      useDocumentStore.getState()
    if (queue.length > 0) {
      const res = await askForm({
        title: tr('存在未应用的文字修改', 'Unapplied text edits'),
        description: tr(
          `队列中有 ${queue.length} 处修改尚未写入文档。`,
          `${queue.length} queued edit(s) have not been applied yet.`
        ),
        fields: [
          {
            name: 'choice',
            label: tr('退出方式', 'How to exit'),
            type: 'segmented',
            defaultValue: 'apply',
            options: [
              { value: 'apply', label: tr('应用并退出', 'Apply & exit') },
              { value: 'discard', label: tr('放弃修改', 'Discard') }
            ]
          }
        ],
        confirmText: tr('确定', 'OK'),
        cancelText: tr('取消', 'Cancel')
      })
      if (!res) return // 用户取消，留在编辑模式
      if (res.choice === 'apply') await apply()
      else clear()
    }
    setViewerMode('view')
  }
```

顶部补导入（与现有导入风格一致）：

```typescript
import { askForm } from '../../stores/usePromptStore'
```

- [x] **Step 3: 翻页/切模式自动入队**

现有 effect（约 270-275 行）：

```typescript
  useEffect(() => {
    if (viewerMode === 'edit_text' && activeTab && pdfDoc) {
      loadTextBlocks()
      setEditingBlockId(null)
    }
  }, [viewerMode, activeTab?.currentPage, pdfDoc])
```

改为：

```typescript
  useEffect(() => {
    if (viewerMode === 'edit_text' && activeTab && pdfDoc) {
      // 翻页/重载前：未入队的草稿自动入队，不再静默丢弃
      if (editingMetaRef.current && editingText.trim()) {
        const meta = editingMetaRef.current
        enqueueTextEdit({
          page: meta.page,
          blockId: editingBlockId || '',
          rect: meta.rect,
          oldText: meta.oldText,
          newText: editingText,
          fontName: meta.fontName,
          fontSize: meta.fontSize,
          color: meta.color
        })
      }
      editingMetaRef.current = null
      setEditingBlockId(null)
      loadTextBlocks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerMode, activeTab?.currentPage, pdfDoc])
```

- [x] **Step 4: Esc 退出与应用期间键盘锁定**

在主键盘 effect（约 463 行 `const onKeyDown = (e: KeyboardEvent) => {`）函数体最前面加：

```typescript
      if (useDocumentStore.getState().isApplyingEdits) return
      if (e.key === 'Escape' && useDocumentStore.getState().viewerMode === 'edit_text') {
        exitEditTextMode()
        return
      }
```

并把该 effect 的依赖数组补充 `exitEditTextMode` 相关引用已含在内则不动（effect 通过 getState 读取，无需加依赖）。

- [x] **Step 5: 编辑提示条改造（应用/放弃/完成按钮）**

将「正文编辑模式引导提示」块（约 1150-1168 行，`{viewerMode === 'edit_text' && (` 起的整个 div）替换为：

```tsx
      {viewerMode === 'edit_text' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 border border-blue-500/50 text-blue-200 text-xs px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md flex items-center space-x-2 animate-in fade-in duration-200">
          {isLoadingBlocks ? (
            <>
              <div className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              <span>{tr('正在提取页面文本段落位置...', 'Detecting text blocks on this page...')}</span>
            </>
          ) : pageTextBlocks.length === 0 && clientBlocks.length === 0 ? (
            <>
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{tr('本页未检测到可选文本，若是扫描件请先执行 OCR', 'No selectable text on this page. For scanned pages, run OCR first.')}</span>
            </>
          ) : (
            <>
              <Type className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{tr('点击蓝色虚线框修改文字，改完统一应用', 'Click a dashed box to edit; apply all changes at once')}</span>
            </>
          )}
          {pendingEdits.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-600/30 text-blue-100 text-[11px] font-medium">
              {tr(`${pendingEdits.length} 处待应用`, `${pendingEdits.length} pending`)}
            </span>
          )}
          <button
            onClick={handleApplyEdits}
            disabled={
              isApplyingEdits ||
              (pendingEdits.length === 0 && !(editingBlockId && editingText.trim())) ||
              (clientBlocks.length > 0 && pageTextBlocks.length === 0)
            }
            title={
              clientBlocks.length > 0 && pageTextBlocks.length === 0
                ? tr('当前为 PDF.js 回退模式，批量应用需要 Python 环境', 'Batch apply requires the Python sidecar (currently in PDF.js fallback)')
                : undefined
            }
            className="ml-1 px-2.5 py-0.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium"
          >
            {tr('应用修改', 'Apply')}
            {pendingEdits.length > 0 ? ` (${pendingEdits.length})` : ''}
          </button>
          {pendingEdits.length > 0 && (
            <button
              onClick={() => clearPendingEdits()}
              className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
            >
              {tr('放弃全部', 'Discard all')}
            </button>
          )}
          <button
            onClick={exitEditTextMode}
            className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
          >
            {tr('完成', 'Done')}
          </button>
        </div>
      )}
```

- [x] **Step 6: 覆盖层块渲染改造**

在 map 回调内部（约 1258 行），把：

```typescript
                const isEditing = editingBlockId === blk.id
                const overrideText = editedBlocks[blk.id]
                const displayText = overrideText !== undefined ? overrideText : blk.text
```

替换为：

```typescript
                const isEditing = editingBlockId === blk.id
                const curPage = activeTab?.currentPage ?? 1
                const pending = pendingEdits.find((e) => e.page === curPage && e.blockId === blk.id)
                const failureMsg = editFailures[`${curPage}:${blk.id}`]
                const overrideText = pending?.newText
                const displayText = overrideText !== undefined ? overrideText : blk.text
```

块的 `onClick` 替换为（切块自动入队 + 记录元数据）：

```tsx
                    onClick={() => {
                      if (isEditing || isApplyingEdits) return
                      enqueueCurrentDraft() // 切换块前把正在编辑的内容入队
                      setEditingBlockId(blk.id)
                      setEditingText(overrideText !== undefined ? overrideText : blk.text)
                      editingMetaRef.current = {
                        page: activeTab?.currentPage ?? 1,
                        rect: blk.rect,
                        oldText: blk.text,
                        fontName: blk.fontName ?? null,
                        fontSize: blk.fontSize ?? null,
                        color: blk.color ?? null
                      }
                    }}
```

块的 className 三元中，把 `overrideText !== undefined` 分支的绿框样式改为区分成功/失败：

```tsx
                        : overrideText !== undefined
                        ? failureMsg
                          ? 'bg-white text-slate-900 border border-rose-500 shadow-sm px-1 font-sans text-xs flex items-center'
                          : 'bg-white text-slate-900 border border-emerald-500/80 shadow-sm px-1 font-sans text-xs flex items-center'
                        : 'border border-blue-400/50 hover:border-blue-600 hover:bg-blue-500/15'
```

并给块外层 div 加失败提示悬浮：

```tsx
                    title={failureMsg || undefined}
                    onMouseEnter={() => failureMsg && setFailedHoverKey(`${curPage}:${blk.id}`)}
                    onMouseLeave={() => setFailedHoverKey(null)}
```

（`failedHoverKey` 仅用于将来的 tooltip 扩展，本期 title 原生提示已足够；state 保留不会有 TS 未使用错误，因为 onMouseEnter/Leave 引用了 setter。）

textarea 底部的「保存」按钮文案与行为改为入队：

```tsx
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              enqueueCurrentDraft()
                            }}
                            className="flex items-center space-x-1 px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium shadow-sm"
                          >
                            <Check className="w-3 h-3" />
                            <span>{tr('加入队列', 'Queue')}</span>
                          </button>
```

「取消」按钮的 onClick 改为：

```tsx
                              e.stopPropagation()
                              editingMetaRef.current = null
                              setEditingBlockId(null)
```

- [x] **Step 7: 应用进度遮罩**

在组件最外层 `return (` 的根 div（`className="flex-1 flex overflow-hidden relative bg-slate-950"`）内部末尾（正文覆盖层之后、根 div 闭合前）加：

```tsx
      {/* 批量应用进度遮罩：锁定全部交互 */}
      {isApplyingEdits && (
        <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-700 rounded-xl px-6 py-4 flex items-center space-x-3 shadow-2xl">
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <span className="text-sm text-slate-200">
              {tr('正在应用文字修改…', 'Applying text edits…')}
            </span>
          </div>
        </div>
      )}
```

- [x] **Step 8: 清理 editedBlocks 残留引用**

```bash
grep -n "editedBlocks" src/renderer/src/components/viewer/PDFViewer.tsx
```

预期：无输出（state、setEditedBlocks 及所有引用均已在前面步骤替换）。若仍有残留，逐一按上下文替换为 pendingEdits 派生逻辑。

- [x] **Step 9: 类型检查 + 提交**

```bash
npx tsc --noEmit
git add src/renderer/src/components/viewer/PDFViewer.tsx
git commit -m "feat(viewer): queued in-place text editing with batch apply, progress lock and exit paths"
```

预期：零 TS 错误。

---

### Task 7: 全量验证

**Files:** 无新改动（验证性任务）

- [x] **Step 1: 类型检查**

```bash
npm run typecheck
```

预期：零错误。

- [x] **Step 2: 全量测试**

```bash
npm test
```

预期：4 套测试全过（7 + 3 + 37 + 4 项），含新增 editTextBatch 套件。

- [x] **Step 3: 手动验证清单（开发模式）**

```bash
npm run dev
```

打开一个多页 PDF → 进入「正文编辑」→ 依次验证：

1. 点击文本块，改字后点「加入队列」瞬时完成，块变绿框显示新文本
2. 不保存直接点另一个块 → 前一块内容自动入队（绿框出现）
3. 翻页 → 队列计数保留；翻回原页绿框仍在且位置正确（稳定 ID）
4. 提示条显示「N 处待应用」，点「应用修改」→ 遮罩出现、翻页快捷键失效 → 完成 toast「成功应用 N 处修改」，文档只重载一次
5. Ctrl+Z 一次撤销整批修改
6. 红底白字块编辑后背景仍为红色（保真验证）
7. Esc 或「完成」退出：有队列时弹「应用并退出 / 放弃修改 / 取消」选择框
8. 「放弃全部」清空队列与绿框

- [x] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: complete edit-text batch queue and fidelity optimization"
```

（如 Step 3 发现问题，修复后一并纳入本提交或单独提交。）

---

## Self-Review 结果

- **Spec 覆盖**：§4.1→Task 1；§4.2→Task 2；§4.3→Task 3（分批协议含批次串联/全局索引/中途失败语义）；§4.4→Task 5+6；§4.5 错误处理表逐行有落点（Python 不可用禁用按钮→Task 6 Step 5，整体失败保留队列→Task 5 Step 4，部分失败标红→Task 6 Step 6，溢出缩字号→Task 2，应用中锁定→Task 6 Step 4/7，超 200 分批→Task 3）；§5 测试→Task 4 + Task 7；§6 过时 rect 对位→Task 5 Step 4 末尾。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型一致性**：`TextEditItem` 字段（page/blockId/rect/oldText/newText/fontName/fontSize/color）在 types.ts、store、viewer、pythonService 透传结构（page/rect/newText/fontName/fontSize/color）中一致；`TextEditResult.index` 全局索引语义在 bridge（批内）→ runEditTextBatch（+offset）→ store（按 index 取 pendingEdits）一致；`editFailures` key 格式 `${page}:${blockId}` 在 store 与 viewer 一致。
