import React, { useEffect, useRef } from 'react'
import { useDocumentStore } from './stores/useDocumentStore'
import { useWorkflowStore } from './stores/useWorkflowStore'
import { Toaster } from './components/layout/Toaster'
import { PromptDialog } from './components/layout/PromptDialog'
import { SplitDialog } from './components/dialogs/SplitDialog'
import { TitleBar } from './components/layout/TitleBar'
import { ToolBar } from './components/layout/ToolBar'
import { PDFViewer } from './components/viewer/PDFViewer'
import { AICopilotDrawer } from './components/copilot/AICopilotDrawer'
import { WorkflowModal } from './components/workflow/WorkflowModal'
import { MergeDialog } from './components/dialogs/MergeDialog'
import { WatermarkDialog } from './components/dialogs/WatermarkDialog'
import { BatesDialog } from './components/dialogs/BatesDialog'
import { RotateDialog } from './components/dialogs/RotateDialog'
import { PopplerDialog } from './components/dialogs/PopplerDialog'
import { DocInfoDialog } from './components/dialogs/DocInfoDialog'
import { OCRDialog } from './components/dialogs/OCRDialog'
import { TableExtractDialog } from './components/dialogs/TableExtractDialog'
import { RedactionDialog } from './components/dialogs/RedactionDialog'
import { FormDialog } from './components/dialogs/FormDialog'
import { HotFolderDialog } from './components/dialogs/HotFolderDialog'
import { BentoToolboxDialog } from './components/dialogs/BentoToolboxDialog'
import { ImpositionDialog } from './components/dialogs/ImpositionDialog'
import { VisualEffectsDialog } from './components/dialogs/VisualEffectsDialog'
import { ImageConvertDialog } from './components/dialogs/ImageConvertDialog'
import { CompareDialog } from './components/dialogs/CompareDialog'
import { PageNumbersDialog } from './components/dialogs/PageNumbersDialog'
import { CompressRepairOverlayDialog } from './components/dialogs/CompressRepairOverlayDialog'
import { StampSignatureDialog } from './components/dialogs/StampSignatureDialog'
import { TOCEditorDialog } from './components/dialogs/TOCEditorDialog'
import { HtmlToPdfDialog } from './components/dialogs/HtmlToPdfDialog'
import { DecryptDialog } from './components/dialogs/DecryptDialog'
import { AttachmentDialog } from './components/dialogs/AttachmentDialog'
import { FormDesignerDialog } from './components/dialogs/FormDesignerDialog'
import { DigitalSignDialog } from './components/dialogs/DigitalSignDialog'
import { PdfToImageDialog } from './components/dialogs/PdfToImageDialog'

export const App: React.FC = () => {
  const activeDialog = useDocumentStore((s) => s.activeDialog)
  const setActiveDialog = useDocumentStore((s) => s.setActiveDialog)
  const isWorkflowOpen = useWorkflowStore((s) => s.isOpen)
  const toggleWorkflow = useWorkflowStore((s) => s.toggleOpen)

  // 每次打开弹窗都递增一次计数，作为弹窗组的 key，确保弹窗内部状态（旧的错误信息、上一份文档的结果等）被重置
  const openCountRef = useRef(0)
  const lastDialogRef = useRef(activeDialog)
  if (lastDialogRef.current !== activeDialog) {
    lastDialogRef.current = activeDialog
    if (activeDialog !== 'none') openCountRef.current += 1
  }

  // 存在未保存修改时阻止窗口直接关闭，由主进程 will-prevent-unload 弹出原生确认框
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useDocumentStore.getState().tabs.some((t) => t.isModified)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 全局 Esc：关闭当前弹窗 / 工作流画布
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const { activeDialog: current } = useDocumentStore.getState()
      if (current !== 'none') {
        e.preventDefault()
        setActiveDialog('none')
      } else if (useWorkflowStore.getState().isOpen) {
        e.preventDefault()
        toggleWorkflow()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveDialog, toggleWorkflow, isWorkflowOpen])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 顶部多标签自定义标题栏 */}
      <TitleBar />

      {/* 核心工具栏 */}
      <ToolBar />

      {/* 主视图区：PDF阅读画布 + 右侧可收缩 AI Copilot 对话舱 */}
      <div className="flex-1 flex overflow-hidden relative">
        <PDFViewer />
        <AICopilotDrawer />
      </div>

      {/* 全局交互弹窗 */}
      <WorkflowModal />
      <React.Fragment key={openCountRef.current}>
      <SplitDialog />
      <MergeDialog />
      <WatermarkDialog />
      <BatesDialog />
      <RotateDialog />
      <PopplerDialog />
      <DocInfoDialog />
      <OCRDialog />
      <TableExtractDialog />
      <RedactionDialog />
      <FormDialog />
      <HotFolderDialog />

      {/* Bento & Stirling 全能增强工具箱与拼版/特效/转换弹窗 */}
      <BentoToolboxDialog />
      <ImpositionDialog />
      <VisualEffectsDialog />
      <ImageConvertDialog />
      <CompareDialog />
      <PageNumbersDialog />
      <CompressRepairOverlayDialog />
      <StampSignatureDialog />
      <TOCEditorDialog />
      <HtmlToPdfDialog />
      <DecryptDialog />
      <AttachmentDialog />
      <FormDesignerDialog />
      <DigitalSignDialog />
      <PdfToImageDialog />
      </React.Fragment>

      {/* 应用内参数询问框（位于所有弹窗之上） */}
      <PromptDialog />

      {/* 全局轻提示 */}
      <Toaster />
    </div>
  )
}
export default App
