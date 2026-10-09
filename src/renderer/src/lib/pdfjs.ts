import * as pdfjsLib from 'pdfjs-dist'

// 配置 pdfjs worker（全局只需一次）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

/**
 * 通过主进程 IPC 读取本地打包的 CMap（中日韩等字符映射），替代原先的 CDN 地址，
 * 保证离线状态下未嵌入字体的中文 PDF 也能正确渲染。
 * 接口与 pdf.js 内置 BaseCMapReaderFactory 保持一致：fetch({ name }) => { cMapData, isCompressed }
 */
class IpcCMapReaderFactory {
  constructor(_options: { baseUrl?: string | null; isCompressed?: boolean }) {}

  async fetch({ name }: { name: string }) {
    if (!name) throw new Error('CMap name must be specified.')
    const cMapData = await window.electronAPI.getPdfjsAsset('cmaps', `${name}.bcmap`)
    return { cMapData, isCompressed: true }
  }
}

/** 本地标准字体（Foxit/Liberation），用于渲染引用 Base-14 字体但未嵌入的 PDF */
class IpcStandardFontDataFactory {
  constructor(_options: { baseUrl?: string | null }) {}

  async fetch({ filename }: { filename: string }) {
    if (!filename) throw new Error('Font filename must be specified.')
    return window.electronAPI.getPdfjsAsset('standard_fonts', filename)
  }
}

/** 打开 PDF 的统一入口（带本地 CMap 与标准字体） */
export const loadPdfDocument = (data: Uint8Array) =>
  pdfjsLib.getDocument({
    data,
    cMapPacked: true,
    useWorkerFetch: false,
    CMapReaderFactory: IpcCMapReaderFactory as any,
    StandardFontDataFactory: IpcStandardFontDataFactory as any
  })

export { pdfjsLib }
