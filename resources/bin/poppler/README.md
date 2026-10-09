# Poppler Binaries Directory

This directory stores the standalone Poppler binary suite for offline high-performance extraction and rasterization.

Required executables on Windows (x64):
- `pdftotext.exe`: Ultra-fast layout-preserving text extraction for AI / RAG pipelines.
- `pdfimages.exe`: Lossless embedded image extraction.
- `pdftoppm.exe`: High-performance batch rasterization.
- `pdfinfo.exe`: Deep document metadata & encryption inspection.
- `pdfsig.exe`: Digital signature verification.

All necessary DLL dependencies (libpoppler, libfreetype, etc.) should reside alongside these executables.
When running in production, PDFOpen Studio loads them directly from `resources/bin/poppler/`.
