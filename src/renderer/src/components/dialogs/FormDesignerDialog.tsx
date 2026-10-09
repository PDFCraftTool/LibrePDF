import React, { useEffect, useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { FormFieldDefinition } from '../../../../shared/types'
import { PagePositionPicker, PdfRect, PickerRect } from '../viewer/PagePositionPicker'
import {
  X,
  Plus,
  Trash2,
  CheckSquare,
  Type,
  CircleDot,
  ListFilter,
  CheckCircle2,
  AlertCircle,
  Wrench,
  FileSpreadsheet
} from 'lucide-react'

// 列表内部使用的字段（附带本地唯一 id，提交时剥离）
type DesignerField = FormFieldDefinition & { _id: string }

// 预览中代表“待添加控件”的草稿框 id
const DRAFT_ID = '__draft__'

let fieldSeq = 0
const nextFieldId = () => `f_${Date.now().toString(36)}_${++fieldSeq}`

export const FormDesignerDialog: React.FC = () => {
  const tr = useTr()
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isOpen = activeDialog === 'formDesigner' && !!activeTab

  // 列表初始为空，由用户在页面上绘制或手动添加
  const [fields, setFields] = useState<DesignerField[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(DRAFT_ID)

  // 当前正在添加的字段配置（curPage 同时作为预览页码）
  const [curType, setCurType] = useState<'text' | 'checkbox' | 'radio' | 'dropdown'>('text')
  const [curName, setCurName] = useState('')
  const [curPage, setCurPage] = useState(1)
  const [curX, setCurX] = useState(100)
  const [curY, setCurY] = useState(500)
  const [curWidth, setCurWidth] = useState(180)
  const [curHeight, setCurHeight] = useState(26)
  const [curValue, setCurValue] = useState('')
  const [curOptions, setCurOptions] = useState(() => tr('选项 A, 选项 B, 选项 C', 'Option A, Option B, Option C'))

  const [isProcessing, setIsProcessing] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const pageCount = Math.max(1, activeTab?.pageCount || 1)
  const clampPage = (p: number) => Math.max(1, Math.min(pageCount, Math.round(p) || 1))

  // 打开弹窗时定位到文档当前页
  useEffect(() => {
    if (isOpen && activeTab) {
      setCurPage(Math.max(1, Math.min(activeTab.pageCount || 1, activeTab.currentPage || 1)))
      setFeedback(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab?.id])

  if (!isOpen || !activeTab) return null

  const handleApplyPreset = (preset: 'name_input' | 'agree_check' | 'payment_radio' | 'select_drop') => {
    if (preset === 'name_input') {
      setCurType('text')
      setCurName(`input_${fields.length + 1}`)
      setCurWidth(200)
      setCurHeight(26)
    } else if (preset === 'agree_check') {
      setCurType('checkbox')
      setCurName(`agree_terms_${fields.length + 1}`)
      setCurWidth(20)
      setCurHeight(20)
    } else if (preset === 'payment_radio') {
      setCurType('radio')
      setCurName('payment_type')
      setCurValue('alipay')
      setCurWidth(20)
      setCurHeight(20)
    } else if (preset === 'select_drop') {
      setCurType('dropdown')
      setCurName(`department_${fields.length + 1}`)
      setCurWidth(180)
      setCurHeight(26)
      setCurOptions(
        tr('研发部, 运营部, 财务部, 法律合规部', 'R&D, Operations, Finance, Legal & Compliance')
      )
    }
    setSelectedId(DRAFT_ID)
  }

  const handleAddField = () => {
    const finalName = curName.trim() || `field_${Date.now()}`
    const newField: DesignerField = {
      _id: nextFieldId(),
      type: curType,
      name: finalName,
      page: clampPage(curPage),
      x: Number(curX) || 0,
      y: Number(curY) || 0,
      width: Number(curWidth) || 160,
      height: Number(curHeight) || 26,
      value: curValue.trim() || undefined,
      optionValue: curType === 'radio' ? curValue.trim() || 'Option 1' : undefined,
      options: curType === 'dropdown' ? curOptions.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    }

    setFields([...fields, newField])
    setSelectedId(newField._id)
    setCurName('')
    setCurValue('')
  }

  const handleRemoveField = (id: string) => {
    setFields(fields.filter((f) => f._id !== id))
    if (selectedId === id) setSelectedId(DRAFT_ID)
  }

  // 预览区回调：新绘制的矩形写入草稿；拖动已有控件则直接更新该控件
  const handlePickerChange = (rect: PdfRect, id: string | null) => {
    if (id === null || id === DRAFT_ID) {
      setCurPage(clampPage(curPage))
      setCurX(rect.x)
      setCurY(rect.y)
      setCurWidth(rect.width)
      setCurHeight(rect.height)
      setSelectedId(DRAFT_ID)
      return
    }
    setFields((prev) => prev.map((f) => (f._id === id ? { ...f, ...rect } : f)))
  }

  const handleSelectFromList = (f: DesignerField) => {
    setSelectedId(f._id)
    setCurPage(clampPage(f.page))
  }

  const typeLabel = (t: FormFieldDefinition['type']) =>
    t === 'text'
      ? tr('文本', 'Text')
      : t === 'checkbox'
        ? tr('复选', 'Check')
        : t === 'radio'
          ? tr('单选', 'Radio')
          : tr('下拉', 'Drop')

  const previewRects: PickerRect[] = [
    ...fields.map((f) => ({
      id: f._id,
      page: f.page,
      label: `${typeLabel(f.type)} · ${f.name}`,
      rect: { x: f.x, y: f.y, width: f.width || 160, height: f.height || 26 }
    })),
    {
      id: DRAFT_ID,
      page: clampPage(curPage),
      label: `+ ${curName.trim() || tr('新控件', 'New field')}`,
      rect: { x: Number(curX) || 0, y: Number(curY) || 0, width: Number(curWidth) || 20, height: Number(curHeight) || 20 }
    }
  ]

  const handleSaveForms = async () => {
    if (fields.length === 0) {
      setFeedback({ type: 'error', text: tr('请至少添加一个表单控件', 'Please add at least one form field') })
      return
    }

    const defaultOut = activeTab.fileName.replace(/\.pdf$/i, '_interactive_form.pdf')
    const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
    if (!savePath) return

    setIsProcessing(true)
    setFeedback(null)

    try {
      // 剥离本地 id，并再次校正页码范围
      const payload: FormFieldDefinition[] = fields.map(({ _id, ...rest }) => ({ ...rest, page: clampPage(rest.page) }))
      const res = await window.electronAPI.pdfAddFormFields(activeTab.filePath, payload, savePath)
      if (res.success && res.outputPath) {
        // 立即关闭并打开结果，避免延时回调误关用户随后打开的其他弹窗
        toast.success(
          tr(`已注入 ${fields.length} 个表单控件`, `Added ${fields.length} form field(s)`),
          res.outputPath,
          res.outputPath
        )
        setActiveDialog('none')
        await openDocument(res.outputPath)
      } else {
        setFeedback({ type: 'error', text: res.message || tr('注入表单控件失败', 'Failed to add form fields') })
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || tr('处理过程异常', 'An error occurred while processing') })
    } finally {
      setIsProcessing(false)
    }
  }

  const presetBtn = (active: boolean) =>
    `flex items-center space-x-2 p-2.5 rounded-xl border text-left transition-all ${
      active
        ? 'bg-blue-600/15 border-blue-500 text-blue-300 font-medium'
        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`

  const numInput = (label: string, value: number, onChange: (v: number) => void, min = 0) => (
    <label className="block">
      <span className="text-[10px] text-slate-500 block">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min)}
        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 font-mono text-center text-xs"
      />
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
              <FileSpreadsheet className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {tr('交互表单设计器', 'Interactive Form Designer')}
              </h2>
              <p className="text-xs text-slate-400">
                {tr(
                  '在页面预览上绘制区域，添加可交互控件（单行文本、复选框、单选按钮、下拉选择）',
                  'Draw areas on the page preview to add interactive fields (text, checkbox, radio button, dropdown)'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveDialog('none')}
            aria-label={tr('关闭', 'Close')}
            title={tr('关闭', 'Close')}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体三栏布局：编辑器 / 页面预览 / 清单 */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* 左侧：新增控件编辑器 */}
          <div className="w-full lg:w-72 shrink-0 p-5 border-r border-slate-800/80 overflow-y-auto space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 block">
                {tr('1. 选择控件类型', '1. Choose field type')}
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => handleApplyPreset('name_input')} className={presetBtn(curType === 'text')}>
                  <Type className="w-4 h-4 text-blue-400" />
                  <span className="text-xs">{tr('单行文本框', 'Text field')}</span>
                </button>
                <button type="button" onClick={() => handleApplyPreset('agree_check')} className={presetBtn(curType === 'checkbox')}>
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs">{tr('复选框', 'Checkbox')}</span>
                </button>
                <button type="button" onClick={() => handleApplyPreset('payment_radio')} className={presetBtn(curType === 'radio')}>
                  <CircleDot className="w-4 h-4 text-amber-400" />
                  <span className="text-xs">{tr('单选按钮', 'Radio button')}</span>
                </button>
                <button type="button" onClick={() => handleApplyPreset('select_drop')} className={presetBtn(curType === 'dropdown')}>
                  <ListFilter className="w-4 h-4 text-purple-400" />
                  <span className="text-xs">{tr('下拉选择框', 'Dropdown')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">{tr('控件名称（唯一键名）', 'Field name (unique key)')}</label>
                <input
                  type="text"
                  placeholder={tr('如: user_real_name, agree_terms...', 'e.g. user_real_name, agree_terms...')}
                  value={curName}
                  onChange={(e) => setCurName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  {curType === 'radio' ? tr('选项值', 'Option value') : tr('默认预填值（可选）', 'Default value (optional)')}
                </label>
                <input
                  type="text"
                  placeholder={tr('可选填', 'Optional')}
                  value={curValue}
                  onChange={(e) => setCurValue(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {curType === 'dropdown' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    {tr('下拉选项列表（逗号分隔）', 'Dropdown options (comma separated)')}
                  </label>
                  <input
                    type="text"
                    value={curOptions}
                    onChange={(e) => setCurOptions(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">
                  {tr('位置与尺寸（pt，原点在页面左下角）', 'Position & size (pt, origin at bottom-left)')}
                </span>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {numInput(tr('页码', 'Page'), curPage, (v) => setCurPage(clampPage(v)), 1)}
                  {numInput('X', curX, setCurX)}
                  {numInput('Y', curY, setCurY)}
                  {numInput(tr('宽度', 'Width'), curWidth, (v) => setCurWidth(Math.max(1, v)), 1)}
                  {numInput(tr('高度', 'Height'), curHeight, (v) => setCurHeight(Math.max(1, v)), 1)}
                </div>
                <p className="text-[10px] text-slate-500">
                  {tr('也可直接在中间的页面预览上拖拽绘制。', 'You can also draw directly on the page preview.')}
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddField}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('添加此控件到清单', 'Add this field to the list')}</span>
              </button>
            </div>
          </div>

          {/* 中间：页面预览 */}
          <div className="shrink-0 p-5 border-r border-slate-800/80 overflow-y-auto flex justify-center bg-slate-950/40">
            <PagePositionPicker
              data={activeTab.data}
              pageNumber={clampPage(curPage)}
              pageCount={pageCount}
              onPageChange={(p) => setCurPage(clampPage(p))}
              mode="rect"
              rects={previewRects}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              onChange={handlePickerChange}
              width={400}
              hint={tr(
                '在页面空白处拖拽绘制新控件区域（写入左侧草稿）；点击已有控件可选中，拖动移动，拖动右下角手柄调整大小。',
                'Drag on an empty area to draw a new field (fills the draft on the left). Click a field to select it, drag to move, or drag the bottom-right handle to resize.'
              )}
            />
          </div>

          {/* 右侧：已添加控件清单 */}
          <div className="flex-1 min-w-0 p-5 flex flex-col justify-between bg-slate-950/30">
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  {tr(`待添加控件清单（${fields.length} 个）`, `Fields to add (${fields.length})`)}
                </span>
                {fields.length > 0 && (
                  <button
                    onClick={() => {
                      setFields([])
                      setSelectedId(DRAFT_ID)
                    }}
                    className="text-[11px] text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    {tr('清空全部', 'Clear all')}
                  </button>
                )}
              </div>

              {fields.length === 0 ? (
                <div className="h-56 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500 space-y-2 px-4 text-center">
                  <Wrench className="w-8 h-8 opacity-40" />
                  <p className="text-xs">
                    {tr(
                      '暂无控件。在页面预览上绘制区域，然后点击“添加此控件到清单”。',
                      'No fields yet. Draw an area on the page preview, then click "Add this field to the list".'
                    )}
                  </p>
                </div>
              ) : (
                fields.map((f) => {
                  const selected = f._id === selectedId
                  return (
                    <div
                      key={f._id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => handleSelectFromList(f)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSelectFromList(f)
                        }
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                        selected
                          ? 'bg-brand-500/10 border-brand-500/70'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-slate-800 text-blue-400 shrink-0">
                          {f.type === 'text' && <Type className="w-4 h-4" />}
                          {f.type === 'checkbox' && <CheckSquare className="w-4 h-4 text-emerald-400" />}
                          {f.type === 'radio' && <CircleDot className="w-4 h-4 text-amber-400" />}
                          {f.type === 'dropdown' && <ListFilter className="w-4 h-4 text-purple-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-200 font-mono truncate">{f.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 shrink-0">
                              {tr(`第 ${f.page} 页`, `Page ${f.page}`)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                            ({f.x}, {f.y}) {f.width}×{f.height}
                            {f.value ? ` [${tr('默认', 'default')}: ${f.value}]` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveField(f._id)
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                        title={tr('移除此控件', 'Remove this field')}
                        aria-label={tr(`移除控件 ${f.name}`, `Remove field ${f.name}`)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            {/* 状态与底部动作栏 */}
            <div className="pt-4 border-t border-slate-800/80 mt-4 space-y-3">
              {feedback && (
                <div
                  className={`p-3 rounded-xl flex items-center space-x-2 text-xs ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setActiveDialog('none')}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
                >
                  {tr('取消', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveForms}
                  disabled={isProcessing || fields.length === 0}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center space-x-2"
                >
                  <span>{isProcessing ? tr('正在生成...', 'Generating...') : tr('生成交互表单', 'Generate interactive form')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
