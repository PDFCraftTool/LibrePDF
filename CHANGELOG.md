# Changelog

All notable changes to **LibrePDF Studio** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v0.2.0] - 2026-11-07

### 🎨 Clean, Bright Native Desktop UI Overhaul
- **Farewell to "AI Dark/Neon Glow"**: Completely redesigned the visual layout from dark glowing pills into a clean, bright, professional native desktop design.
- **High-Contrast Workbench**: Adopted a neutral light workbench (`#eaedf1`) paired with realistic physical page shadows (`#ffffff` canvas) for maximum readability.
- **Native OS Window Integration**: System-level light title bar (`#f8fafc`) blending seamlessly with Windows / macOS window buttons, accompanied by a discreet `Local-First` badge.
- **Light Segmented Controls**: Replaced oversized dark floating capsules with compact, clean rectangular segmented controls.
- **57+ Toolbox & DAG Workflow Restyle**: Replaced translucent dark popups with modern crisp cards, instant search, and light-theme node graph editor.

### ✍️ Fill & Sign Studio (Inspired by storytold/pdfcraft)
- **Click-to-Type Anywhere**: Quickly type arbitrary text, names, amounts, or addresses on non-interactive PDFs and flat scans.
- **Instant Symbols & Date**: One-click placement of checkmarks (`✓`), cross marks (`✗`), selection dots (`●`), and today's system date (`YYYY-MM-DD`).
- **Local Saved Signatures**: Built-in HTML5 canvas pad with smooth stylus/mouse handwriting to draw and store personal signatures and initials in local storage.
- **Interactive Manipulation**: Freely drag, reposition, and proportional-scale signatures on any page.
- **Lossless Flatten & Burn**: One-click baking into the underlying PDF stream using `pdf-lib` vector compositing, with full `Ctrl+Z` undo/redo and `Ctrl+S` save support.

### 👓 Eye-Care Reading Themes
- **Multi-Mode Comfort Reading**: Seamlessly switch between **Default Light**, **Eye-Care Warm Sepia** (`#fbf0d9`), and **Night Dark Mode**.
- **Hardware-Accelerated CSS Filters**: Instant zero-latency switching with no PDF document re-rendering or performance degradation.

### ✂️ Visual Page Crop Tool
- **On-Canvas Crop Box**: Drag and adjust interactive crop margins with live readouts of crop ratios (L/R/T/B) and point dimensions.
- **Lossless ISO 32000 CropBox**: Crop out oversized whitespace, punch-hole borders, and scan artifacts without re-encoding or raster quality loss.

### 📸 Showcase Visuals
- Updated all 4 official screenshots (`workbench.png`, `dashboard.png`, `workflow.png`, `editor-capsule.png`) to standard 16:10 aspect ratio (2522×1577) in full English interface using synthetic privacy-compliant test fixtures.

---

## [v0.1.0] - 2026-10-30

### Initial Open-Source Release
- **Local-First Architecture**: 100% offline PDF processing with zero cloud telemetry.
- **53+ Clean-Room Atomic Tools**: Merge, split, rotate, watermark, encrypt/decrypt, Bates numbering, compression, repair, and imposition.
- **In-Place Text Editing**: Detect vector text blocks and rewrite typography directly on the canvas with fallback support.
- **Local AI Copilot & Visual DAG Workflow**: Integrated Ollama/LM Studio local LLM agent with privacy audit approvals and node graph pipeline automation.
