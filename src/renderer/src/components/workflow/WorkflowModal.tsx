import React, { useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  EdgeChange,
  NodeChange,
  BackgroundVariant,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  useWorkflowStore,
  NODE_DEFINITIONS,
  PALETTE_ORDER,
  getNodeOperation,
  getNodeParams,
  type ParamDefinition,
  type ParamValue,
  type WorkflowTemplateKey
} from '../../stores/useWorkflowStore'
import { useTranslation } from 'react-i18next'
import { useTr } from '../../i18n'
import {
  X,
  Play,
  Square,
  Sparkles,
  Layers,
  Terminal,
  Plus,
  Trash2,
  SlidersHorizontal,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react'

const TEMPLATE_BUTTONS: { key: WorkflowTemplateKey; zh: string; en: string; accent?: boolean }[] = [
  { key: 'watermark', zh: '📋 企业合同流水线', en: '📋 Contract pipeline' },
  { key: 'poppler', zh: '⚡ Poppler 抽取', en: '⚡ Poppler extract' },
  { key: 'reorder', zh: '🔀 倒序重编页码', en: '🔀 Reverse & renumber' },
  { key: 'rapidocr', zh: '🔍 RapidOCR 双层/表格', en: '🔍 RapidOCR & tables', accent: true }
]

/** 单个参数输入控件 */
const ParamField: React.FC<{
  def: ParamDefinition
  value: ParamValue
  onChange: (value: ParamValue) => void
}> = ({ def, value, onChange }) => {
  const tr = useTr()
  const inputClass =
    'w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-brand-500 disabled:opacity-50'
  const id = `wf-param-${def.key}`

  if (def.type === 'checkbox') {
    return (
      <label htmlFor={id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-brand-500"
        />
        {tr(def.label[0], def.label[1])}
      </label>
    )
  }

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] text-slate-400">
        {tr(def.label[0], def.label[1])}
      </label>
      {def.type === 'select' ? (
        <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {(def.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {tr(opt.label[0], opt.label[1])}
            </option>
          ))}
        </select>
      ) : def.type === 'number' ? (
        <input
          id={id}
          type="number"
          value={value === '' ? '' : Number(value)}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          type={def.type === 'password' ? 'password' : 'text'}
          value={String(value ?? '')}
          placeholder={def.placeholder ? tr(def.placeholder[0], def.placeholder[1]) : undefined}
          autoComplete={def.type === 'password' ? 'new-password' : 'off'}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
      {def.hint && <p className="text-[10px] text-slate-500 leading-snug">{tr(def.hint[0], def.hint[1])}</p>}
    </div>
  )
}

export const WorkflowModal: React.FC = () => {
  const { t, i18n } = useTranslation()
  const tr = useTr()
  const {
    isOpen,
    setIsOpen,
    nodes,
    edges,
    isRunning,
    currentExecutingNodeId,
    nodeStatus,
    executionLogs,
    setNodes,
    setEdges,
    loadTemplate,
    addNode,
    updateNodeParams,
    removeNode,
    removeEdge,
    runWorkflow,
    stopWorkflow,
    clearLogs
  } = useWorkflowStore()

  const logRef = useRef<HTMLDivElement>(null)

  // 日志自动滚动到最新一条
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [executionLogs.length, isOpen])

  // 将 store 中的节点映射为带图标、参数摘要与执行状态的展示节点
  const displayNodes = useMemo<Node[]>(
    () =>
      nodes.map((node) => {
        const op = getNodeOperation(node)
        const def = op ? NODE_DEFINITIONS[op] : null
        const params = getNodeParams(node)
        const status = nodeStatus[node.id]
        const isCurrent = currentExecutingNodeId === node.id
        const title = def ? tr(def.title[0], def.title[1]) : String(node.data?.label || node.id)
        const summary = def?.summary?.(params) || ''

        let borderColor = def?.color || '#475569'
        let background = '#1e293b'
        let boxShadow: string | undefined = node.selected ? '0 0 0 2px rgba(148, 163, 184, 0.7)' : undefined
        if (isCurrent || status === 'running') {
          borderColor = '#38bdf8'
          boxShadow = '0 0 0 3px rgba(56, 189, 248, 0.45), 0 0 18px rgba(56, 189, 248, 0.35)'
        } else if (status === 'success') {
          borderColor = '#22c55e'
        } else if (status === 'error') {
          borderColor = '#ef4444'
          background = '#3b1620'
          boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.45)'
        }

        return {
          ...node,
          className: isCurrent ? 'animate-pulse' : undefined,
          style: {
            background,
            color: '#f8fafc',
            border: `${isCurrent || status ? 2 : 1}px solid ${borderColor}`,
            borderRadius: 10,
            padding: 8,
            width: 210,
            fontSize: 11,
            textAlign: 'left',
            boxShadow
          },
          data: {
            ...node.data,
            label: (
              <div className="flex items-start gap-2">
                <span className="text-base leading-none mt-0.5" aria-hidden>
                  {def?.icon || '❔'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-100 truncate">{title}</div>
                  {summary && <div className="text-[10px] text-slate-400 truncate">{summary}</div>}
                </div>
                {isCurrent || status === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-sky-400" aria-label={tr('执行中', 'Running')} />
                ) : status === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" aria-label={tr('已完成', 'Done')} />
                ) : status === 'error' ? (
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" aria-label={tr('失败', 'Failed')} />
                ) : null}
              </div>
            )
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, nodeStatus, currentExecutingNodeId, i18n.language]
  )

  if (!isOpen) return null

  const selectedNode = nodes.find((node) => node.selected)
  const selectedEdge = selectedNode ? undefined : edges.find((edge) => edge.selected)
  const selectedOp = selectedNode ? getNodeOperation(selectedNode) : null
  const selectedDef = selectedOp ? NODE_DEFINITIONS[selectedOp] : null
  const selectedParams = selectedNode ? getNodeParams(selectedNode) : {}

  const onNodesChange = (changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }

  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }

  const onConnect = (params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#38bdf8' } }, eds))
  }

  const nodeTitle = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    const op = node ? getNodeOperation(node) : null
    return op ? tr(NODE_DEFINITIONS[op].title[0], NODE_DEFINITIONS[op].title[1]) : nodeId
  }

  const logClass = (log: string) =>
    log.includes('❌')
      ? 'text-rose-400 font-semibold'
      : log.includes('✅')
        ? 'text-emerald-400 font-semibold'
        : log.includes('⚠️') || log.includes('⏹')
          ? 'text-amber-400'
          : log.includes('🚀')
            ? 'text-cyan-400'
            : 'text-slate-400'

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="w-full h-full max-w-7xl bg-slate-900 border border-slate-700/80 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* 顶部工具栏 */}
        <div className="h-14 bg-slate-950 border-b border-slate-800 px-5 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-1.5 rounded-lg bg-purple-950 border border-purple-800/80 text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                {t('workflow.title')}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800">
                  Node Graph DAG
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 truncate">{t('workflow.description')}</p>
            </div>
          </div>

          {/* 预设模板与操作 */}
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-[11px] text-slate-500 hidden xl:inline">{tr('模板', 'Templates')}:</span>
            {TEMPLATE_BUTTONS.map((tpl) => (
              <button
                key={tpl.key}
                onClick={() => loadTemplate(tpl.key)}
                disabled={isRunning}
                className={
                  tpl.accent
                    ? 'text-xs px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 transition-colors disabled:opacity-50'
                    : 'text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50'
                }
              >
                {tr(tpl.zh, tpl.en)}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {isRunning ? (
              <button
                onClick={stopWorkflow}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t('workflow.stop')}</span>
              </button>
            ) : (
              <button
                onClick={runWorkflow}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t('workflow.run')}</span>
              </button>
            )}

            <button
              onClick={() => setIsOpen(false)}
              aria-label={tr('关闭', 'Close')}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* 左侧：节点面板 */}
          <aside className="w-52 shrink-0 bg-slate-950/80 border-r border-slate-800 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <Plus className="w-3.5 h-3.5 text-brand-400" />
              {t('workflow.addNode')}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {PALETTE_ORDER.map((op) => {
                const def = NODE_DEFINITIONS[op]
                return (
                  <button
                    key={op}
                    onClick={() => addNode(op)}
                    disabled={isRunning}
                    title={tr(def.description[0], def.description[1])}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderLeft: `3px solid ${def.color}` }}
                  >
                    <span aria-hidden>{def.icon}</span>
                    <span className="truncate">{tr(def.title[0], def.title[1])}</span>
                  </button>
                )
              })}
            </div>
            <p className="px-3 py-2 border-t border-slate-800 text-[10px] text-slate-500 leading-snug">
              {tr(
                '新节点会自动连接到选中节点（或最后一个节点）之后。按 Delete / Backspace 删除选中项。',
                'New nodes auto-connect after the selected (or last) node. Press Delete / Backspace to remove the selection.'
              )}
            </p>
          </aside>

          {/* 中间核心：React Flow 节点画布 */}
          <div className="flex-1 relative bg-slate-950 min-w-0">
            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              deleteKeyCode={isRunning ? null : ['Delete', 'Backspace']}
              colorMode="dark"
              fitView
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
              <Controls className="bg-slate-800 border-slate-700 fill-slate-200" />
            </ReactFlow>

            {/* 运行中微光状态提示条 */}
            {isRunning && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-brand-950/90 border border-brand-500 text-brand-300 px-4 py-2 rounded-full text-xs flex items-center space-x-2 shadow-xl backdrop-blur-md">
                <Sparkles className="w-4 h-4 animate-spin text-brand-400" />
                <span>
                  {tr('正在按拓扑顺序调度各个 PDF 节点...', 'Running PDF nodes in topological order...')}
                  {currentExecutingNodeId ? ` · ${nodeTitle(currentExecutingNodeId)}` : ''}
                </span>
              </div>
            )}
          </div>

          {/* 右侧：参数面板 */}
          <aside className="w-64 shrink-0 bg-slate-950/80 border-l border-slate-800 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-brand-400" />
              {tr('节点参数', 'Node Parameters')}
            </div>

            {selectedNode ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-3 select-text">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5">
                  <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                    <span aria-hidden>{selectedDef?.icon || '❔'}</span>
                    {selectedDef ? tr(selectedDef.title[0], selectedDef.title[1]) : selectedNode.id}
                  </div>
                  {selectedDef && (
                    <p className="mt-1 text-[10px] text-slate-400 leading-snug">
                      {tr(selectedDef.description[0], selectedDef.description[1])}
                    </p>
                  )}
                  {nodeStatus[selectedNode.id] && (
                    <p
                      className={`mt-1.5 text-[10px] font-semibold ${
                        nodeStatus[selectedNode.id] === 'success'
                          ? 'text-emerald-400'
                          : nodeStatus[selectedNode.id] === 'error'
                            ? 'text-rose-400'
                            : 'text-sky-400'
                      }`}
                    >
                      {nodeStatus[selectedNode.id] === 'success'
                        ? tr('✓ 上次运行已完成', '✓ Completed in last run')
                        : nodeStatus[selectedNode.id] === 'error'
                          ? tr('✕ 上次运行失败，详见日志', '✕ Failed in last run, see log')
                          : tr('执行中...', 'Running...')}
                    </p>
                  )}
                </div>

                <fieldset disabled={isRunning} className="space-y-3">
                  {selectedDef && selectedDef.params.length > 0 ? (
                    selectedDef.params.map((def) => (
                      <ParamField
                        key={`${selectedNode.id}-${def.key}`}
                        def={def}
                        value={selectedParams[def.key] ?? def.default}
                        onChange={(value) => updateNodeParams(selectedNode.id, { [def.key]: value })}
                      />
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-500">{tr('此节点没有可配置的参数。', 'This node has no configurable parameters.')}</p>
                  )}
                </fieldset>

                <button
                  onClick={() => removeNode(selectedNode.id)}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr('删除节点', 'Delete node')}
                </button>
              </div>
            ) : selectedEdge ? (
              <div className="flex-1 p-3 space-y-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-xs text-slate-300">
                  <div className="font-semibold text-slate-100 mb-1">{tr('连线', 'Connection')}</div>
                  {nodeTitle(selectedEdge.source)} → {nodeTitle(selectedEdge.target)}
                </div>
                <button
                  onClick={() => removeEdge(selectedEdge.id)}
                  disabled={isRunning}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-300 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {tr('删除连线', 'Delete connection')}
                </button>
              </div>
            ) : (
              <div className="flex-1 p-4 text-[11px] text-slate-500 leading-relaxed">
                {tr('在画布中选中一个节点即可编辑其参数。', 'Select a node on the canvas to edit its parameters.')}
              </div>
            )}
          </aside>
        </div>

        {/* 底部：执行状态与实时控制台日志 */}
        <div className="h-36 bg-slate-950 border-t border-slate-800 flex flex-col">
          <div className="px-4 py-1.5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5">
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-semibold">{tr('执行日志与中间产物监视器', 'Execution log & artifacts')}</span>
            </div>
            <button onClick={clearLogs} className="hover:text-slate-200 transition-colors">
              {tr('清空日志', 'Clear log')}
            </button>
          </div>

          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            className="flex-1 p-3 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 select-text"
          >
            {executionLogs.map((log, index) => (
              <div key={index} className={logClass(log)}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
