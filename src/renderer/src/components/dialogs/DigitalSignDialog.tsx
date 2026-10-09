import React, { useEffect, useState } from 'react'
import { useDocumentStore } from '../../stores/useDocumentStore'
import { toast } from '../../stores/useToastStore'
import { useTr } from '../../i18n'
import { PagePositionPicker, PdfRect } from '../viewer/PagePositionPicker'
import {
  X,
  FileCheck2,
  Lock,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FolderOpen,
  PenLine
} from 'lucide-react'

const SIG_ID = 'signature'

export const DigitalSignDialog: React.FC = () => {
  const tr = useTr()
  const { activeDialog, setActiveDialog, tabs, activeTabId, openDocument } = useDocumentStore()
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const isOpen = activeDialog === 'digitalSign' && !!activeTab

  const [p12Path, setP12Path] = useState('')
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState(() => tr('确认并批准此文档', 'Document approved'))
  const [location, setLocation] = useState(() => tr('本地工作站', 'Local workstation'))
  const [tsaUrl, setTsaUrl] = useState('')
  const [useTsa, setUseTsa] = useState(false)

  // 可见签名：页码 + PDF 用户空间矩形（左下角原点）
  const [visibleSig, setVisibleSig] = useState(false)
  const [sigPage, setSigPage] = useState(1)
  const [sigRect, setSigRect] = useState<PdfRect | null>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const pageCount = Math.max(1, activeTab?.pageCount || 1)
  const clampPage = (p: number) => Math.max(1, Math.min(pageCount, Math.round(p) || 1))

  // 打开弹窗时定位到文档当前页
  useEffect(() => {
    if (isOpen && activeTab) {
      setSigPage(Math.max(1, Math.min(activeTab.pageCount || 1, activeTab.currentPage || 1)))
      setSigRect(null)
      setFeedback(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab?.id])

  if (!isOpen || !activeTab) return null

  const handleSelectCert = async () => {
    try {
      const paths = await window.electronAPI.openFileDialog({
        filters: [{ name: tr('PKCS#12 证书 (*.p12, *.pfx)', 'PKCS#12 certificate (*.p12, *.pfx)'), extensions: ['p12', 'pfx'] }]
      })
      if (paths && paths.length > 0) {
        setP12Path(paths[0])
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: tr('选择证书文件失败：', 'Failed to choose certificate: ') + err.message })
    }
  }

  const handleSign = async () => {
    if (!p12Path) {
      setFeedback({
        type: 'error',
        text: tr('请先选取 PKCS#12 (.p12 / .pfx) 数字证书文件', 'Please choose a PKCS#12 (.p12 / .pfx) certificate file first')
      })
      return
    }

    const tsa = tsaUrl.trim()
    if (useTsa && !/^https?:\/\//i.test(tsa)) {
      setFeedback({
        type: 'error',
        text: tr('时间戳服务器地址必须以 http:// 或 https:// 开头', 'The TSA URL must start with http:// or https://')
      })
      return
    }

    if (visibleSig && !sigRect) {
      setFeedback({
        type: 'error',
        text: tr('请在页面预览上拖拽绘制签名外观区域', 'Please draw the signature area on the page preview')
      })
      return
    }

    // 默认保存在原文件旁（工作副本位于临时目录）
    const defaultOut = (activeTab.originalFilePath || activeTab.filePath).replace(/\.pdf$/i, '_digitally_signed.pdf')
    const savePath = await window.electronAPI.saveFileDialog({ defaultPath: defaultOut })
    if (!savePath) return

    setIsProcessing(true)
    setFeedback(null)

    try {
      const res = await window.electronAPI.pdfSignP12(activeTab.filePath, p12Path, password, savePath, {
        reason,
        location,
        tsaUrl: useTsa && tsa ? tsa : undefined,
        // rect 为 [x1, y1, x2, y2]，PDF 用户空间左下角原点；不传 rect 即为不可见签名
        ...(visibleSig && sigRect
          ? {
              page: clampPage(sigPage),
              rect: [sigRect.x, sigRect.y, sigRect.x + sigRect.width, sigRect.y + sigRect.height]
            }
          : {})
      })

      if (res.success && res.outputPath) {
        // 不宣称任何阅读器中的“有效”状态：签名是否被信任取决于证书信任链
        const signer = res.signer || tr('未知签署者', 'Unknown signer')
        const tsText = res.hasTimestamp
          ? tr('已嵌入 RFC 3161 时间戳', 'RFC 3161 timestamp embedded')
          : tr('未嵌入时间戳（签署时间取自本机时钟）', 'No timestamp (signing time taken from the local clock)')
        const visText = res.visible
          ? tr(`可见签名位于第 ${res.page ?? sigPage} 页`, `Visible signature on page ${res.page ?? sigPage}`)
          : tr('不可见签名', 'Invisible signature')
        toast.success(
          tr('数字签名已写入', 'Digital signature applied'),
          `${tr('签署者', 'Signer')}: ${signer} · ${tsText} · ${visText}`,
          res.outputPath
        )
        if (res.warning) toast.warning(tr('签名提示', 'Signing notice'), res.warning)
        setActiveDialog('none')
        await openDocument(res.outputPath)
      } else {
        setFeedback({
          type: 'error',
          text: res.error || tr('证书签名失败，请检查口令是否正确', 'Signing failed. Please check the certificate password.')
        })
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || tr('签名执行异常', 'An error occurred while signing') })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div
        className={`w-full ${visibleSig ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10`}
      >
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
              <FileCheck2 className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>{tr('P12 证书数字签名', 'P12 Certificate Digital Signature')}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PAdES / CMS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {tr(
                  '使用证书私钥对文档进行密码学签名，签名后的修改可被检测；阅读器是否显示为受信任取决于证书信任链。',
                  'Cryptographically signs the document with your certificate key so later changes can be detected. Whether a reader trusts it depends on the certificate chain.'
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

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col md:flex-row">
          {/* 表单内容区 */}
          <div className="p-6 space-y-4 text-xs flex-1 min-w-0">
            {/* 证书文件选取 */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                {tr('1. 选取数字证书文件 (.p12 / .pfx)', '1. Choose certificate file (.p12 / .pfx)')}
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  readOnly
                  placeholder={tr('点击右侧按钮选取 .p12 / .pfx 证书...', 'Click Browse to choose a .p12 / .pfx certificate...')}
                  aria-label={tr('证书路径', 'Certificate path')}
                  value={p12Path}
                  className="flex-1 min-w-0 px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 font-mono truncate"
                />
                <button
                  type="button"
                  onClick={handleSelectCert}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-200 flex items-center space-x-1.5 transition-colors font-medium shrink-0"
                >
                  <FolderOpen className="w-4 h-4 text-emerald-400" />
                  <span>{tr('浏览...', 'Browse...')}</span>
                </button>
              </div>
            </div>

            {/* 证书解密密码 */}
            <div>
              <label htmlFor="p12-password" className="text-xs font-semibold text-slate-300 block mb-1.5">
                {tr('2. 证书密码', '2. Certificate password')}
              </label>
              <div className="relative">
                <input
                  id="p12-password"
                  type="password"
                  placeholder={tr('若证书设置了口令请输入...', 'Enter the password if the certificate has one...')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* 签署元信息 */}
            <div className="grid grid-cols-1 gap-3 pt-1">
              <div>
                <label htmlFor="sign-reason" className="text-xs text-slate-400 block mb-1">
                  {tr('签署理由', 'Reason')}
                </label>
                <input
                  id="sign-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="sign-location" className="text-xs text-slate-400 block mb-1">
                  {tr('签署地点', 'Location')}
                </label>
                <div className="relative">
                  <input
                    id="sign-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                </div>
              </div>
            </div>

            {/* RFC 3161 时间戳选项 */}
            <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-2xl space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-300">{tr('RFC 3161 时间戳 (TSA)', 'RFC 3161 timestamp (TSA)')}</span>
                </span>
                <input
                  type="checkbox"
                  checked={useTsa}
                  onChange={(e) => setUseTsa(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                />
              </label>
              {useTsa && (
                <div className="pt-2 animate-in fade-in duration-150">
                  <input
                    type="text"
                    placeholder={tr('时间戳服务器 URL，如: http://timestamp.digicert.com', 'TSA server URL, e.g. http://timestamp.digicert.com')}
                    aria-label={tr('时间戳服务器 URL', 'TSA server URL')}
                    value={tsaUrl}
                    onChange={(e) => setTsaUrl(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {tr(
                      '由第三方时间戳服务器证明签署时间（需联网，会向该服务器发送文档哈希）',
                      'A third-party timestamp server attests the signing time (requires network; only the document hash is sent)'
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* 可见签名选项 */}
            <div className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-2xl space-y-1.5">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="flex items-center space-x-2">
                  <PenLine className="w-4 h-4 text-brand-400" />
                  <span className="text-xs font-semibold text-slate-300">{tr('可见签名外观', 'Visible signature')}</span>
                </span>
                <input
                  type="checkbox"
                  checked={visibleSig}
                  onChange={(e) => setVisibleSig(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-500">
                {visibleSig
                  ? sigRect
                    ? tr(
                        `第 ${clampPage(sigPage)} 页，区域 (${sigRect.x}, ${sigRect.y}) ${sigRect.width}×${sigRect.height} pt`,
                        `Page ${clampPage(sigPage)}, area (${sigRect.x}, ${sigRect.y}) ${sigRect.width}×${sigRect.height} pt`
                      )
                    : tr('请在右侧页面预览上拖拽绘制签名区域。', 'Draw the signature area on the page preview.')
                  : tr('关闭时签名不可见，仅出现在阅读器的签名面板中。', 'When off, the signature is invisible and only shown in the reader’s signature panel.')}
              </p>
            </div>

            {/* 状态反馈 */}
            {feedback && (
              <div
                role="alert"
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
          </div>

          {/* 可见签名位置选择 */}
          {visibleSig && (
            <div className="shrink-0 p-5 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/40 flex justify-center">
              <PagePositionPicker
                data={activeTab.data}
                pageNumber={clampPage(sigPage)}
                pageCount={pageCount}
                onPageChange={(p) => {
                  setSigPage(clampPage(p))
                  // 换页后原区域不再适用，需重新绘制
                  setSigRect(null)
                }}
                mode="rect"
                rects={sigRect ? [{ id: SIG_ID, label: tr('签名', 'Signature'), rect: sigRect }] : []}
                selectedId={sigRect ? SIG_ID : null}
                onChange={(rect) => setSigRect(rect)}
                width={380}
                hint={tr(
                  '在页面上拖拽绘制签名外观区域；拖动框体可移动，拖动右下角手柄可调整大小。重新拖拽空白处会替换当前区域。',
                  'Drag on the page to draw the signature area. Drag the box to move it or its bottom-right handle to resize. Drawing again on an empty area replaces it.'
                )}
              />
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{tr('签名运算在本机完成，私钥不会上传', 'Signing runs locally; your private key is never uploaded')}</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setActiveDialog('none')}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition-colors"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={handleSign}
              disabled={isProcessing || !p12Path}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center space-x-2"
            >
              <span>{isProcessing ? tr('正在签名...', 'Signing...') : tr('签名并导出', 'Sign and export')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
