# PDFOpen Studio

> 🚀 **The Local-First, AI-Native, All-in-One PDF Powerhouse for Global Users**  
> 开源、全能、隐私优先的本地桌面端智能 PDF 工作台。

---

## 🌟 核心特性 (Key Features)

1. **多标签页现代阅读器 (Multi-Tab PDF Reader)**
   - 基于 Mozilla PDF.js 与 WebGL 视口硬件加速，极致流畅缩放、高保真渲染。
   - 页面缩略图侧栏导航、大纲书签、文档深度属性元数据探测。

2. **全能 PDF 原子操作引擎 (All-in-One Core Engines)**
   - **多文档合并 (Merge)**：可视化拖放、排序并批量拼接多文档。
   - **文档拆分 (Split)**：按页码区间、单页提取、奇偶页智能切分。
   - **页面旋转与管理 (Rotate & Reorder)**：单页或多页顺逆时针旋转、倒序、插入空白页。
   - **高级防伪水印 (Watermark)**：支持全屏平铺、居中印章、页眉页脚、透明度与倾斜角微调。
   - **法律卷宗贝茨编号 (Bates Numbering)**：前缀/后缀自定义、连续编号、自动补零、精准四角排版。
   - **工业级 Poppler 工具链集成**：保留物理排版提取文本 (`pdftotext -layout`)、无损原图抽取 (`pdfimages -png`)。

3. **自然语言 AI Agent 智能体对话舱 (AI Copilot)**
   - **100% 离线优先**：直连本地部署的 **Ollama** 与 **LM Studio**（Llama-3, Qwen-2.5, DeepSeek-R1 等），零遥测、数据不离机。
   - **ReAct 智能调度**：用自然语言下达复合指令（如“为当前文档平铺绝密水印并导出”），AI 自动拆解规划原子操作序列。
   - **可审查隐私授权卡片**：所有由 AI 生成的操作均需用户在界面一键授权，严防意外篡改。

4. **拖拉拽可视化工作流画布 (Visual Workflow Studio)**
   - 基于 `@xyflow/react` 打造类 ComfyUI 的节点图谱编辑器。
   - 支持自由连线编排输入、水印、贝茨编号、Poppler 提取、导出等处理流程。
   - 内置开箱即用模板，提供实时 DAG 拓扑排序调度与运行日志控制台。

5. **国际化与本地化 (i18n)**
   - 深度支持简体中文（zh-CN）与英语（en-US）热切换，预留全球主流多语言扩展架构。

---

## 🛠️ 快速启动 (Getting Started)

### 环境要求
- Node.js >= 20.0
- pnpm >= 9.0
- (可选) 本地安装 [Ollama](https://ollama.com/) 并拉取模型（如 `ollama run llama3`）

### 安装依赖
```bash
pnpm install
```

### 本地开发预览
```bash
pnpm dev
```

### 运行自动化单元测试
```bash
pnpm test
```

### 构建与打包
```bash
pnpm build
```

---

## 🏛️ 项目目录结构 (Architecture)

```
pdfopen/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 窗口生命周期与全套 Typed IPC 注册中心
│   │   └── services/         # PDFService (pdf-lib), PopplerService, AIService, SecurityService
│   ├── preload/              # 安全 Preload 预加载脚本
│   │   └── index.ts          # window.electronAPI 强类型桥接
│   ├── renderer/             # React 19 前端界面
│   │   └── src/
│   │       ├── components/
│   │       │   ├── layout/   # TitleBar (多标签), ToolBar (功能工具栏)
│   │       │   ├── viewer/   # PDFViewer (PDF.js Canvas 视口与缩略图抽屉)
│   │       │   ├── copilot/  # AICopilotDrawer (AI 智能体对话与审查舱)
│   │       │   ├── workflow/ # WorkflowModal (React Flow 节点画布)
│   │       │   └── dialogs/  # 水印、合并、旋转、贝茨编号、Poppler抽取等弹窗
│   │       ├── stores/       # Zustand 状态中心 (useDocumentStore, useAIStore, useWorkflowStore)
│   │       └── i18n/         # 多语言语言包
│   └── shared/               # 跨进程强类型定义 (types.ts)
├── resources/                # 静态资源与内置 Poppler 二进制包
├── tests/                    # 核心引擎自动化单元测试套件
└── package.json
```

---

## 📄 开源许可证

本项目遵循 MIT 开源许可证。
