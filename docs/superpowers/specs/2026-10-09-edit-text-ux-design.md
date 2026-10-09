# PDF 正文编辑（edit_text）操作体验优化 — 设计文档

日期：2026-10-09
状态：已获用户批准（方案 A：Python 批量编辑 action + 前端待应用队列）

## 1. 背景与问题

现有正文编辑功能链路：PDFViewer 进入 `edit_text` 模式 → `fetchPageTextBlocks`（Python 边车 `get_page_text_blocks`，失败回退 PDF.js 客户端提取）→ 点击文本块弹 textarea → 「保存」触发 `saveTextEdit`，每保存一个块执行一次：写临时文件 → spawn Python 子进程 `edit_text` → 整份文档重载 → 重新提取文本块。

已确认的体验缺陷：

1. 每块保存都要一次子进程 + 全文档重载，批量修改极慢，且保存过程无 loading 反馈、按钮可重复点击。
2. 回写文字固定 `fontname="china-s"`、固定颜色 (0.1,0.1,0.1)，字号是启发式估算 `(块高/行数)*0.75` 并夹在 8-24，原文档字体、字号、颜色全部失真。
3. 擦除用 redact 硬白填充，破坏块下方背景色与图片。
4. 块 ID 按页内序号生成，保存后重提取 ID 变化，本地 `editedBlocks` 绿框覆盖显示错位。
5. 切换文本块或翻页时，textarea 未保存内容静默丢失；无 Esc/「完成」退出路径。

## 2. 目标与非目标

**目标**（用户确认的优先级）：

- 流畅度与批量编辑：多处修改本地瞬时入队，一次性提交 Python 处理，全文档只重载一次；应用过程有进度反馈并锁定翻页/缩放。
- 视觉还原保真度：回写使用真实字体名/字号/颜色（span 级提取）；擦除时采样背景色填充而非硬白；块下图片用像素级擦除保护。

**非目标**（明确排除）：

- 系统字体文件子集嵌入（版权与体积问题，用户已选择不做）。
- 全文 WYSIWYG contenteditable 就地编辑。
- 侧边栏块列表编辑器。
- 跨页搜索替换（未选择，架构上预留：批量 action 天然支持任意页的编辑项）。
- 词级/行级编辑粒度（仍为块级）。

## 3. 架构总览

```
PDFViewer(edit_text 模式)
   │ 点击块 → textarea → 「保存」= 本地入队（瞬时）
   ▼
useDocumentStore.pendingEdits (队列, 按 editKey 去重)
   │ 「应用 N 处修改」→ 锁定 UI → 一次调用
   ▼
pythonService.editTextBatch(inputPath, outputPath, edits)
   │ spawn 一次子进程, --edits JSON
   ▼
bridge.py: action "edit_text_batch"
   逐块: 采样背景色 → redact(填充采样色, images=PIXELS) → insert_textbox(真实字体/字号/颜色)
   返回 per-edit 结果数组
   ▼
前端: 重载文档一次 → 重取当前页文本块 → 成功项出队, 失败项保留并标红
```

涉及文件与职责边界：

| 文件 | 职责 | 改动性质 |
|---|---|---|
| `python/bridge.py` | 文本块提取升级 + 新批量编辑 action | 核心新增 |
| `src/main/services/pythonService.ts` | 新方法 `editTextBatch`，透传 edits JSON | 小新增 |
| `src/main/index.ts` | 新 IPC 通道 `pdf:editTextBatch` | 一行注册 |
| `src/preload/index.ts` | 暴露 `editTextBatch` | 一行透传 |
| `src/shared/types.ts` | `TextEditItem`、`TextEditResult`、`TextBlockInfo` 类型 | 类型新增 |
| `src/renderer/src/stores/useDocumentStore.ts` | `pendingEdits` 队列与增删清空、`applyPendingEdits` action | 中等改动 |
| `src/renderer/src/components/viewer/PDFViewer.tsx` | 入队交互、应用按钮、进度遮罩、退出路径、绿框显示改用稳定 ID | 中等改动 |
| `tests/`（新文件 `editTextBatch.test.ts`） | 端到端回归 | 新增 |

## 4. 详细设计

### 4.1 文本块提取升级（bridge.py `get_page_text_blocks`）

从 `page.get_text("blocks")` 改为 `page.get_text("dict")`，按 block 聚合 span 数据：

- `id`：稳定坐标键 `f"{page_number}-{round(x0)}-{round(y0)}-{round(x1)}-{round(y1)}"`（直接坐标拼接，无需哈希），重提取后不变，解决绿框错位。
- `fontName`：块内按字符数占比最大的 span 字体名（如 `ABCDEF+SimSun` 需剥离子集前缀 `XXXXXX+`）。
- `fontSize`：主字体 span 的真实 `size`，不再估算。
- `color`：主 span 的 `color` 整数转 `[r, g, b]`（0-1 浮点）。
- `text`、`rect`：语义不变。

返回结构（向后兼容，新增字段）：

```json
{"success": true, "blocks": [{"id": "3-72-100-500-118", "rect": [72,100,500,118], "text": "...", "fontName": "SimSun", "fontSize": 10.5, "color": [0.1,0.1,0.1]}]}
```

PDF.js 客户端回退路径（Python 不可用时）：无法获得字体名/颜色，回退块 `fontName: null, color: null`；`fontSize` 保留客户端现有估算值传入（不清空）。批量编辑 action 对 null 属性使用默认值（china-s / 深灰）。已知边界：回退块的 ID 仍是不稳定的序号式 `client_blk_{page}_{idx}`，绿框错位问题在回退模式下不解决（回退模式本身也禁用「应用」按钮，见 §4.5，故影响可忽略）。

### 4.2 批量编辑 action（bridge.py 新增 `edit_text_batch`）

**入参**：`--input`、`--output`、`--edits`（JSON 数组）：

```json
[{"page": 1, "rect": [x0,y0,x1,y1], "newText": "...", "fontName": "SimSun", "fontSize": 10.5, "color": [0.1,0.1,0.1]}]
```

`page` 为 1-based；`fontName/fontSize/color` 可为 null（走默认）。

**逐块处理流程**：

1. **背景采样**：`page.get_pixmap(clip=rect 外扩 2px 后与 page.rect 求交, dpi=72)` 渲染该区域（含原文字，文字像素占比低不影响众数），取像素众数色作为背景色；若矩形与任一图片 bbox 相交，或众数色与白色差异明显，则用采样色，否则用白色。采样失败回退白色。
   **实施偏离记录（Task 2 评审确认）**：实现简化为「始终采用众数色」——白底时众数即白，扫描件时众数为纸色反而更准；且采样与 add_redact_annot 拆为两遍执行，避免 pending 标注边框污染相邻块采样。另按评审补充：单项属性畸形/非 dict 项逐块隔离报错不炸整批，加密文档显式返回「文档已加密，请先解密后再编辑」。
2. **擦除**：`add_redact_annot(rect, fill=采样背景色)`，全部标注添加完后对该页统一 `apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)`（图片区域像素级擦除，不整块移除图片）。同页多个编辑共享一次 apply，避免重复处理。
3. **回写**：`insert_textbox(rect, newText, fontsize=真实字号, color=真实颜色, fontname=按规则映射, align=左对齐)`；溢出（返回值 < 0）时按 0.9 系数逐步缩小字号重试，最小至 6pt，仍失败则记录该块 `warning: "文本溢出，已缩小字号"`。
4. **字体映射规则**：文本含 CJK 字符（`\u4e00-\u9fff\u3040-\u30ff` 等）→ `china-s`；否则按原字体名关键词：含 `serif`/`song`/`times`/`ming` → `tiro`，含 `mono`/`courier` → `courier`，其余或 null → `helv`。（PyMuPDF 内置字体，无嵌入成本。）
5. 文本溢出 insert_textbox 异常时兜底 `insert_text` 于块左下角基线 `Point(rect.x0, rect.y1 - 4)`（与现有 edit_text 兜底完全一致）。

**返回**：逐块结果，部分失败不影响其余块：

```json
{"success": true, "outputPath": "...", "results": [{"index": 0, "ok": true, "warning": null}, {"index": 1, "ok": false, "error": "矩形超出页面范围"}]}
```

整体失败（文件打不开、加密等）才返回 `success: false`。

### 4.3 主进程与 IPC

- `pythonService.editTextBatch(inputPath, outputPath, edits)`：与现有方法同构，spawn 子进程传 `--action edit_text_batch`，复用现有 stdout JSON 提取与错误处理；`edits` 经 `JSON.stringify` 作为单个 argv 传入（与现有 `--rects` 模式一致）。
- **分批协议**（Windows argv 上限约 32K）：edits 超过 200 项时由 pythonService 内部切分为多批，调用方无感知。批次串联：第 i 批的 output 即第 i+1 批的 input（中间批次写临时文件，最后一批写最终 outputPath）。`results[].index` 统一换算为**全局索引**后合并返回。中途某批整体失败：立即停止后续批次，已成功批次的结果照常返回，未处理项不出现在 results 中——前端据"results 覆盖到哪个全局索引"把已确认成功的项出队、其余（失败 + 未处理）全部保留队列。
- `index.ts` 注册 `ipcMain.handle('pdf:editTextBatch', ...)`；`preload/index.ts` 对应暴露；`shared/types.ts` **新建** `TextEditItem`、`TextEditResult`、`TextBlockInfo` 三个接口（现状不存在 `TextBlockInfo`，`pythonGetTextBlocks` 签名与 store 的 `pageTextBlocks` 均为 `any`），并同步收紧这两处签名为 `TextBlockInfo[]`，避免新类型形同虚设。

   **实施偏离记录（Task 3 评审 + 最终集成评审确认）**：① 实际 IPC 通道名为 `python:editTextBatch`（与该文件既有 `python:*` 通道命名一致）。② 分批触发条件从「纯计数 200 项」升级为「计数 ≤ EDIT_BATCH_LIMIT(200) 且序列化字节 ≤ EDIT_BATCH_BYTES(20000)」的双限贪心分批（长文本 200 项仍可能超 argv 上限）；wire 载荷剔除 Python 侧不需要的 `blockId/oldText` 字段；临时文件命名改为 `pdfopen_${ts}_${rand}.pdf` 以兼容启动清扫正则并避免并发同名碰撞。③ 中途某批整体失败时采取**保守语义**：返回 `success:false` + 已成功批次的部分 results，但前端不重载、不出队，整个队列原样保留供重试；成功批次的中间产物（临时文件）随 finally 清理丢弃。理由：避免「文档已部分改写但 UI 未同步」的中间态，重试幂等且无数据丢失风险（源文件从未被就地修改）。

### 4.4 前端队列与交互（useDocumentStore + PDFViewer）

**store 新增状态与 action**：

- `pendingEdits: TextEditItem[]`（含 `editKey = page + blockId`、`oldText`、`newText` 及提取到的字体属性）。
- `enqueueTextEdit(item)`：同 key 覆盖（后改优先）；`discardEdit(key)`；`clearPendingEdits()`。
- `applyPendingEdits()`：临时文件 → `editTextBatch` → 成功后 `applyModifiedPDF` 重载 + 追加 undo 历史（一次批量 = 一条历史记录，Ctrl+Z 可整体撤销）→ 重取当前页文本块 → 按 results 出队成功项、保留失败项。
- 队列跨页存在（翻页不清空），文档切换/关闭时清空。

**PDFViewer 交互变化**：

1. textarea「保存」→「加入修改队列」：瞬时完成，块显示绿框 + 新文本预览（复用现有 editedBlocks 显示逻辑，改用稳定块 ID），再次点击可重新编辑（覆盖队列项）或从队列移除。
2. 切换文本块 / 翻页时，若当前 textarea 有未入队改动，自动入队（等效点保存），不再静默丢弃。
3. `edit_text` 模式工具条新增：「应用 N 处修改」主按钮（N=0 时禁用）、「放弃全部」、Esc 与「完成」退出；存在未应用修改时退出弹 PromptDialog 确认（应用 / 放弃 / 取消）。
4. 应用期间：全屏半透明进度遮罩（「正在应用 N 处修改…」），锁定翻页/缩放/模式切换按钮与键盘导航；完成后 toast 汇报「成功 X 处，失败 Y 处」，失败块红框标记 + 悬浮显示原因。
5. 保存按钮防重复点击：入队即禁用至 textarea 关闭；应用按钮在 `applyPendingEdits` 期间禁用（store 加 `isApplyingEdits` 状态）。

### 4.5 错误处理汇总

| 场景 | 行为 |
|---|---|
| Python 边车不可用 | 提取走 PDF.js 回退（属性为 null）；「应用」按钮禁用并提示需要 Python 环境 |
| 批量应用整体失败 | 队列原样保留，toast 错误，UI 解锁，用户可重试 |
| 部分块失败 | 成功项生效并出队，失败项保留队列并标红，toast 汇总 |
| 文本溢出 | 自动缩字号重试，成功但带 warning，toast 提示 |
| 应用中用户操作 | 遮罩 + 按钮锁定 + 忽略 Esc/翻页快捷键 |
| edits 超 200 项 | pythonService 自动分批，中途批次失败则停止后续批次，已完成批次生效，未处理项保留队列 |

## 5. 测试计划

新增 `tests/editTextBatch.test.ts`（tsx 直跑，与现有测试风格一致，注册进 `npm test`）：

1. **属性提取**：构造含已知字号/颜色中英文的 PDF → `get_page_text_blocks` → 断言 fontName 无子集前缀、fontSize 与写入值误差 <0.5、color 匹配、id 稳定（提取两次相同）。
2. **批量替换**：3 页 PDF 每页一块，`edit_text_batch` 一次调用改 3 块 → 断言输出文本全部替换、页数不变。
3. **背景保护**：构造红色背景块 → 编辑后采样块区域四角像素 → 断言仍为红色系（未被涂白）。
4. **图片保护**：块与图片重叠的 PDF → 编辑后断言图片对象仍存在（`get_images()` 数量不减）。
5. **部分失败**：edits 含一个越界 rect → 断言 `success:true`、该项 `ok:false`、其余项生效。
6. **前端队列逻辑**：`pendingEdits` 入队/覆盖/清空为纯函数级逻辑，如现有测试架构不便覆盖 React，则以桥接层测试为准，前端靠手动验证清单（见下）。

手动验证清单：进入编辑模式改 3 块（跨 2 页）→ 翻页不丢 → 一次应用 → 遮罩与锁定生效 → undo 一次回滚全部 → Esc 退出弹确认。

## 6. 兼容性与风险

- `get_page_text_blocks` 返回仅增字段不删改，旧调用方（AI Copilot 工具链若引用）不受影响。
- 现有单块 `edit_text` action 保留不动（AI ReAct 调度仍可用），新 action 独立。
- 风险：背景采样对渐变/复杂底纹只能取近似色——接受，非目标场景；PyMuPDF 内置字体与原文档字体的字形宽度差异可能导致换行位置微变——接受，属「精准属性」档位已知边界。
- 风险：部分成功场景下，同页先前编辑可能引起文本回流，滞留队列中的失败项 rect 基于旧版面，直接重试可能擦错位置。缓解：应用完成后重取文本块时，按失败项的 oldText 在新块列表中重新对位（文本完全匹配则更新 rect，否则标记「位置已失效，请重新选择文本块」并从队列移除该旧项）。
