import sys
import os
import json
import argparse
import io
import math
import re
import shutil
import time
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

# 确保控制台和管道统一使用 UTF-8
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import pymupdf  # PyMuPDF 1.28+
from PIL import Image
import numpy as np
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# 初始化全局 OCR 引擎单例 (CPU ONNX Runtime 极速轻量模型)
ocr_engine = None

def get_ocr_engine():
    global ocr_engine
    if ocr_engine is None:
        # 延迟导入：onnxruntime 加载较慢，且缺失时不应拖垮与 OCR 无关的功能
        from rapidocr_onnxruntime import RapidOCR
        ocr_engine = RapidOCR()
    return ocr_engine


# -------------------------------------------------------------
# 1. 深度学习 OCR 与制作双层可搜索可复制 PDF (Sandwich PDF)
# -------------------------------------------------------------
def make_searchable_pdf(input_path: str, output_path: str, dpi: int = 200) -> Dict[str, Any]:
    if not os.path.exists(input_path):
        return {"success": False, "error": f"输入文件不存在: {input_path}"}

    ocr = get_ocr_engine()
    doc = pymupdf.open(input_path)
    total_pages = len(doc)
    total_words = 0

    zoom = dpi / 72.0
    mat = pymupdf.Matrix(zoom, zoom)

    for page_idx in range(total_pages):
        page = doc[page_idx]
        page_rect = page.rect

        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img_np = np.array(img)

        ocr_results, _ = ocr(img_np)

        if ocr_results:
            for item in ocr_results:
                box, text, score = item[0], item[1], item[2]
                if not text or score < 0.3:
                    continue

                total_words += len(text)
                x_coords = [p[0] / zoom for p in box]
                y_coords = [p[1] / zoom for p in box]

                min_x = max(0, min(x_coords))
                max_x = min(page_rect.width, max(x_coords))
                min_y = max(0, min(y_coords))
                max_y = min(page_rect.height, max(y_coords))

                rect = pymupdf.Rect(min_x, min_y, max_x, max_y)
                box_height = max_y - min_y
                box_width = max_x - min_x

                if box_height <= 0 or box_width <= 0:
                    continue

                font_size = max(6.0, min(box_height * 0.85, 36.0))

                try:
                    page.insert_textbox(
                        rect,
                        text,
                        fontsize=font_size,
                        fontname="china-s",
                        render_mode=3,
                        align=pymupdf.TEXT_ALIGN_LEFT
                    )
                except Exception:
                    page.insert_text(
                        pymupdf.Point(min_x, max_y - 2),
                        text,
                        fontsize=font_size,
                        fontname="china-s",
                        render_mode=3
                    )

        progress_info = {
            "type": "progress",
            "page": page_idx + 1,
            "totalPages": total_pages,
            "percent": int(((page_idx + 1) / total_pages) * 100)
        }
        sys.stderr.write(json.dumps(progress_info) + "\n")
        sys.stderr.flush()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    return {
        "success": True,
        "outputPath": output_path,
        "pageCount": total_pages,
        "totalWords": total_words
    }


# -------------------------------------------------------------
# 2. 复杂表格版面深度学习提取与导出 Excel
# -------------------------------------------------------------
def extract_tables_to_excel(
    input_path: str,
    output_xlsx: str,
    pages_to_extract: List[int] = None
) -> Dict[str, Any]:
    if not os.path.exists(input_path):
        return {"success": False, "error": f"输入文件不存在: {input_path}"}

    doc = pymupdf.open(input_path)
    wb = openpyxl.Workbook()
    default_sheet = wb.active
    wb.remove(default_sheet)

    table_count = 0
    all_markdown_tables = []

    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    header_font = Font(name="Microsoft YaHei", size=11, bold=True, color="FFFFFF")
    alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    regular_font = Font(name="Microsoft YaHei", size=10)
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1")
    )

    target_pages = pages_to_extract if pages_to_extract else list(range(1, len(doc) + 1))

    for page_num in target_pages:
        if page_num < 1 or page_num > len(doc):
            continue

        page = doc[page_num - 1]
        tabs = page.find_tables()

        if len(tabs.tables) > 0:
            for t_idx, tab in enumerate(tabs.tables):
                table_count += 1
                sheet_title = f"P{page_num}_Table{t_idx + 1}"[:31]
                ws = wb.create_sheet(title=sheet_title)

                data = tab.extract()
                if not data:
                    continue

                md_lines = []
                for row_idx, row in enumerate(data):
                    cleaned_row = [str(cell).strip() if cell is not None else "" for cell in row]
                    ws.append(cleaned_row)

                    md_lines.append("| " + " | ".join(cleaned_row) + " |")
                    if row_idx == 0:
                        md_lines.append("| " + " | ".join(["---"] * len(cleaned_row)) + " |")

                all_markdown_tables.append(f"### 表格: 页码 {page_num} - 表 {t_idx + 1}\n\n" + "\n".join(md_lines))

                for row in ws.iter_rows(min_row=1, max_row=len(data), min_col=1, max_col=len(data[0])):
                    is_header = row[0].row == 1
                    for cell in row:
                        cell.border = thin_border
                        if is_header:
                            cell.fill = header_fill
                            cell.font = header_font
                            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                        else:
                            cell.font = regular_font
                            cell.alignment = Alignment(horizontal="left", vertical="center")
                            if cell.row % 2 == 0:
                                cell.fill = alt_fill

                for col in ws.columns:
                    max_len = 0
                    col_letter = get_column_letter(col[0].column)
                    for cell in col:
                        val_str = str(cell.value or "")
                        length = sum(2 if ord(c) > 127 else 1 for c in val_str)
                        if length > max_len:
                            max_len = length
                    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        else:
            ocr = get_ocr_engine()
            pix = page.get_pixmap(dpi=150)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            ocr_results, _ = ocr(np.array(img))

            if ocr_results:
                lines_dict = {}
                for item in ocr_results:
                    box, text, score = item[0], item[1], item[2]
                    if not text or score < 0.3:
                        continue
                    y_center = (box[0][1] + box[2][1]) / 2.0
                    line_key = int(y_center / 18.0) * 18
                    if line_key not in lines_dict:
                        lines_dict[line_key] = []
                    lines_dict[line_key].append((box[0][0], text))

                sorted_y = sorted(lines_dict.keys())
                # 提高 OCR 回退门槛：本页 find_tables() 已无候选，普通文字页不应虚增 tableCount。
                # 仅当 OCR 行呈二维结构（至少 2 行、且其中至少 2 行含多列对齐的单元格）才视为疑似表格；
                # 否则整页跳过，不生成 sheet 也不计入 tableCount。
                multi_col_rows = sum(1 for y in sorted_y if len(lines_dict[y]) >= 2)
                if len(sorted_y) >= 2 and multi_col_rows >= 2:
                    table_count += 1
                    sheet_title = f"P{page_num}_OCR_Table"[:31]
                    ws = wb.create_sheet(title=sheet_title)
                    for y in sorted_y:
                        row_items = [t[1] for t in sorted(lines_dict[y], key=lambda x: x[0])]
                        ws.append(row_items)

    doc.close()

    if table_count == 0:
        ws = wb.create_sheet(title="未探测到明显表格")
        ws.append(["提示", "所选页面未识别到明显的网格或结构化表格数据"])

    os.makedirs(os.path.dirname(os.path.abspath(output_xlsx)), exist_ok=True)
    wb.save(output_xlsx)

    return {
        "success": True,
        "outputPath": output_xlsx,
        "tableCount": table_count,
        "markdown": "\n\n".join(all_markdown_tables)
    }


# -------------------------------------------------------------
# 3. PDF 文档正文可编辑核心：读取文本块与原地替换正文
# -------------------------------------------------------------
def get_page_text_blocks(input_path: str, page_num: int) -> Dict[str, Any]:
    """
    提取指定页面的所有文本块及其绝对几何坐标，为前端提供可编辑覆盖层
    """
    if not os.path.exists(input_path):
        return {"success": False, "error": "文件不存在"}

    doc = pymupdf.open(input_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        return {"success": False, "error": "页码超出有效范围"}

    page = doc[page_num - 1]
    blocks_data = []
    
    # 提取 block 结构: (x0, y0, x1, y1, text, block_no, block_type)
    raw_blocks = page.get_text("blocks")
    for idx, b in enumerate(raw_blocks):
        x0, y0, x1, y1, text, block_no, block_type = b
        # block_type == 0 为文本
        if block_type == 0 and text.strip():
            # 估算字号
            lines = [l for l in text.split("\n") if l.strip()]
            line_count = max(1, len(lines))
            height = y1 - y0
            est_font_size = max(8.0, min(24.0, (height / line_count) * 0.75))

            blocks_data.append({
                "id": f"blk_{page_num}_{idx}",
                "rect": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
                "text": text.rstrip("\n"),
                "fontSize": round(est_font_size, 1)
            })

    page_width = page.rect.width
    page_height = page.rect.height
    doc.close()

    return {
        "success": True,
        "page": page_num,
        "pageWidth": page_width,
        "pageHeight": page_height,
        "blocks": blocks_data
    }


def edit_text_block(
    input_path: str,
    output_path: str,
    page_num: int,
    rect_coords: List[float],
    new_text: str,
    font_size: float = None
) -> Dict[str, Any]:
    """
    原地正文编辑：彻底物理脱敏原文字流并注入替换后的新文字
    """
    if not os.path.exists(input_path):
        return {"success": False, "error": "输入文件不存在"}

    doc = pymupdf.open(input_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        return {"success": False, "error": "页码超出范围"}

    page = doc[page_num - 1]
    rect = pymupdf.Rect(rect_coords)

    # 1. 物理脱敏原有区域文字（彻底抹除原底层字符矢量，绝非遮挡）
    page.add_redact_annot(rect, fill=(1, 1, 1))  # 白色填充底色
    page.apply_redactions()

    # 2. 插入新文本
    calc_font_size = font_size if font_size else max(9.0, min(18.0, (rect.y1 - rect.y0) * 0.7))
    try:
        # 使用自适应文本框填充
        page.insert_textbox(
            rect,
            new_text,
            fontsize=calc_font_size,
            fontname="china-s",
            color=(0.1, 0.1, 0.1),
            align=pymupdf.TEXT_ALIGN_LEFT
        )
    except Exception:
        # 兜底基线文本插入
        page.insert_text(
            pymupdf.Point(rect.x0, rect.y1 - 4),
            new_text,
            fontsize=calc_font_size,
            fontname="china-s",
            color=(0.1, 0.1, 0.1)
        )

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()

    return {
        "success": True,
        "outputPath": output_path,
        "editedPage": page_num,
        "newText": new_text
    }


# -------------------------------------------------------------
# 4. 物理脱敏 (True Redaction)：永久物理抹除与正则敏感词抹除
# -------------------------------------------------------------
def redact_document(
    input_path: str,
    output_path: str,
    page_num: int = None,
    rects: List[List[float]] = None,
    regex_pattern: str = None,
    fill_color: List[float] = [0, 0, 0]
) -> Dict[str, Any]:
    if not os.path.exists(input_path):
        return {"success": False, "error": "文件不存在"}

    doc = pymupdf.open(input_path)
    total_redactions = 0
    fill = tuple(fill_color[:3])

    # 页码语义约定：page_num=0 或 None 表示全部页面（全文档脱敏）；超出总页数直接报错
    if page_num is None or page_num == 0:
        target_pages = list(range(len(doc)))
    elif 1 <= page_num <= len(doc):
        target_pages = [page_num - 1]
    else:
        doc.close()
        return {"success": False, "error": "页码超出文档范围"}

    # 正则提前编译：无效正则在 re.compile 阶段即报错，避免静默吞错后返回 success
    compiled_pattern = None
    if regex_pattern:
        # 预设正则快捷别名
        pattern = regex_pattern
        if regex_pattern == "@phone":
            pattern = r"1[3-9]\d{9}"
        elif regex_pattern == "@email":
            pattern = r"[\w\.-]+@[\w\.-]+\.\w+"
        elif regex_pattern == "@idcard":
            pattern = r"\d{17}[\dXx]"
        try:
            compiled_pattern = re.compile(pattern)
        except re.error as e:
            doc.close()
            return {"success": False, "error": f"正则脱敏失败: 无效的正则表达式 {e}"}

    for p_idx in target_pages:
        page = doc[p_idx]

        # 1. 矩形区域脱敏
        if rects:
            for r in rects:
                rect = pymupdf.Rect(r)
                page.add_redact_annot(rect, fill=fill)
                total_redactions += 1

        # 2. 正则表达式或敏感关键词脱敏 (如手机号、身份证、邮箱)
        if compiled_pattern:
            try:
                # 提取全文文本匹配
                text_page = page.get_text()
                matches = list(compiled_pattern.finditer(text_page))
                for m in matches:
                    matched_str = m.group(0)
                    quads = page.search_for(matched_str)
                    for q in quads:
                        page.add_redact_annot(q, fill=fill)
                        total_redactions += 1
            except Exception as e:
                doc.close()
                return {"success": False, "error": f"正则脱敏失败: {e}"}

        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    return {
        "success": True,
        "outputPath": output_path,
        "redactedCount": total_redactions
    }


# -------------------------------------------------------------
# 5. 高级注释与批注系统 (划词高亮/下划线/自由画笔/便签)
# -------------------------------------------------------------
def add_annotation(
    input_path: str,
    output_path: str,
    page_num: int,
    annot_type: str,
    rect_coords: List[float] = None,
    points: List[List[float]] = None,
    color: List[float] = [1.0, 0.85, 0.0],
    content: str = ""
) -> Dict[str, Any]:
    if not os.path.exists(input_path):
        return {"success": False, "error": "文件不存在"}

    doc = pymupdf.open(input_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        return {"success": False, "error": "页码超出范围"}

    page = doc[page_num - 1]
    col = tuple(color[:3])

    if annot_type == "highlight" and rect_coords:
        annot = page.add_highlight_annot(pymupdf.Rect(rect_coords))
        annot.set_colors(stroke=col)
        annot.update()
    elif annot_type == "underline" and rect_coords:
        annot = page.add_underline_annot(pymupdf.Rect(rect_coords))
        annot.set_colors(stroke=col)
        annot.update()
    elif annot_type == "strikeout" and rect_coords:
        annot = page.add_strikeout_annot(pymupdf.Rect(rect_coords))
        annot.set_colors(stroke=col)
        annot.update()
    elif annot_type == "ink" and points:
        # points 为点序列: [[x1, y1], [x2, y2], ...]
        pt_list = [pymupdf.Point(p[0], p[1]) for p in points]
        annot = page.add_ink_annot([pt_list])
        annot.set_colors(stroke=col)
        annot.update()
    elif annot_type == "note" and rect_coords:
        point = pymupdf.Point(rect_coords[0], rect_coords[1])
        annot = page.add_text_annot(point, content)
        annot.set_colors(stroke=col)
        annot.update()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path, garbage=3, deflate=True)
    doc.close()

    return {"success": True, "outputPath": output_path, "type": annot_type}


# -------------------------------------------------------------
# 6. 本地文档 RAG 语义切片与检索问答 (100% 离线隐私保护)
# -------------------------------------------------------------
def query_document_rag(input_path: str, query: str, top_k: int = 3) -> Dict[str, Any]:
    """
    离线文档语义分块与关键词相关度排序，提取精确页码出处与引用段落
    """
    if not os.path.exists(input_path):
        return {"success": False, "error": "文件不存在"}

    doc = pymupdf.open(input_path)
    chunks = []

    # 1. 按页和自然段进行切片
    for p_idx, page in enumerate(doc):
        text = page.get_text()
        paras = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 20]
        for para in paras:
            chunks.append({
                "page": p_idx + 1,
                "text": para
            })

    doc.close()

    if not chunks:
        return {"success": True, "citations": []}

    # 2. 简易词频-逆文档频率与语义关键词打分
    keywords = [w.lower() for w in re.findall(r"[\w\u4e00-\u9fa5]+", query) if len(w) > 1]
    if not keywords:
        keywords = [query.lower()]

    scored_chunks = []
    for c in chunks:
        c_text_lower = c["text"].lower()
        score = 0
        for kw in keywords:
            count = c_text_lower.count(kw)
            score += count * (len(kw) ** 1.2)
        if score > 0:
            scored_chunks.append({
                "page": c["page"],
                "text": c["text"][:300] + ("..." if len(c["text"]) > 300 else ""),
                "score": score
            })

    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    top_results = scored_chunks[:top_k]

    return {
        "success": True,
        "query": query,
        "totalChunks": len(chunks),
        "citations": top_results
    }


# -------------------------------------------------------------
# 8. 仿真扫描件质感效果 (Scanner Simulator)
# -------------------------------------------------------------
def apply_scanner_effect(input_path: str, output_path: str, dpi: int = 200, noise: int = 15, angle: float = 0.4) -> Dict[str, Any]:
    try:
        import random
        from PIL import ImageFilter, ImageEnhance
        doc = pymupdf.open(input_path)
        out_doc = pymupdf.open()
        zoom = dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)

        for page in doc:
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            # 微小随机倾斜
            actual_angle = random.uniform(-angle, angle) if angle > 0 else 0
            if abs(actual_angle) > 0.05:
                img = img.rotate(actual_angle, resample=Image.BICUBIC, expand=False, fillcolor=(255, 255, 255))

            # 模拟光学散射
            img = img.filter(ImageFilter.GaussianBlur(radius=0.35))
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.15)

            # 添加纸质杂色噪点
            if noise > 0:
                img_np = np.array(img, dtype=np.int16)
                noise_layer = np.random.normal(0, noise, img_np.shape)
                noisy_img = np.clip(img_np + noise_layer, 0, 255).astype(np.uint8)
                img = Image.fromarray(noisy_img)

            # 浅暖黄纸张底纹
            tint = Image.new("RGB", img.size, (253, 252, 247))
            img = Image.blend(img, tint, 0.06)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=86)
            new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
            new_page.insert_image(new_page.rect, stream=buf.getvalue())

        out_doc.save(output_path)
        return {"success": True, "outputPath": output_path, "pageCount": len(out_doc)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# -------------------------------------------------------------
# 9. 智能自动纠偏 (Auto Deskew)
# -------------------------------------------------------------
def auto_deskew_pdf(input_path: str, output_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        out_doc = pymupdf.open()
        mat = pymupdf.Matrix(1.5, 1.5)

        for page in doc:
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert('L')
            img_np = np.array(img)

            best_angle = 0.0
            best_variance = -1.0
            for test_angle in np.arange(-4.0, 4.5, 0.5):
                rotated = Image.fromarray(img_np).rotate(test_angle, resample=Image.NEAREST, fillcolor=255)
                rot_np = np.array(rotated)
                row_sums = np.mean(rot_np < 180, axis=1)
                variance = np.var(row_sums)
                if variance > best_variance:
                    best_variance = variance
                    best_angle = test_angle

            if abs(best_angle) > 0.3:
                full_pix = page.get_pixmap(dpi=200, alpha=False)
                full_img = Image.frombytes("RGB", [full_pix.width, full_pix.height], full_pix.samples)
                deskewed = full_img.rotate(best_angle, resample=Image.BICUBIC, expand=False, fillcolor=(255, 255, 255))
                buf = io.BytesIO()
                deskewed.save(buf, format="JPEG", quality=92)
                p = out_doc.new_page(width=page.rect.width, height=page.rect.height)
                p.insert_image(p.rect, stream=buf.getvalue())
            else:
                out_doc.insert_pdf(doc, from_page=page.number, to_page=page.number)

        out_doc.save(output_path)
        return {"success": True, "outputPath": output_path, "pageCount": len(out_doc)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# -------------------------------------------------------------
# 10. 自动识别并删除空白页 (Remove Blank Pages)
# -------------------------------------------------------------
def remove_blank_pages(input_path: str, output_path: str, threshold: float = 0.995) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        out_doc = pymupdf.open()
        removed_pages = []
        mat = pymupdf.Matrix(0.5, 0.5)

        for page in doc:
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples).convert('L')
            img_np = np.array(img)

            white_ratio = np.sum(img_np > 245) / float(img_np.size)
            std_dev = np.std(img_np)

            if white_ratio >= threshold and std_dev < 10.0:
                removed_pages.append(page.number + 1)
            else:
                out_doc.insert_pdf(doc, from_page=page.number, to_page=page.number)

        if len(out_doc) == 0:
            out_doc.insert_pdf(doc, from_page=0, to_page=0)
            if 1 in removed_pages:
                removed_pages.remove(1)

        out_doc.save(output_path)
        return {"success": True, "outputPath": output_path, "removedPages": removed_pages, "remainingPages": len(out_doc)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# -------------------------------------------------------------
# 11. 黑白灰阶化与暗黑模式反色 (Grayscale / Invert Colors)
# -------------------------------------------------------------
def grayscale_or_invert(input_path: str, output_path: str, mode: str = "grayscale") -> Dict[str, Any]:
    try:
        from PIL import ImageOps
        doc = pymupdf.open(input_path)
        out_doc = pymupdf.open()
        mat = pymupdf.Matrix(2.0, 2.0)

        for page in doc:
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            if mode == "invert":
                img = ImageOps.invert(img)
            else:
                img = img.convert("L").convert("RGB")

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            new_p = out_doc.new_page(width=page.rect.width, height=page.rect.height)
            new_p.insert_image(new_p.rect, stream=buf.getvalue())

        out_doc.save(output_path)
        return {"success": True, "outputPath": output_path, "pageCount": len(out_doc)}
    except Exception as e:
        return {"success": False, "error": str(e)}


# -------------------------------------------------------------
# 9. 双文档视觉高亮差异对比 (Visual PDF Comparison)
# -------------------------------------------------------------
def compare_documents(input1: str, input2: str, output_path: str, dpi: int = 150) -> Dict[str, Any]:
    if not os.path.exists(input1) or not os.path.exists(input2):
        return {"success": False, "error": "指定的对比文件不存在"}

    try:
        doc1 = pymupdf.open(input1)
        doc2 = pymupdf.open(input2)

        max_pages = max(len(doc1), len(doc2))
        out_doc = pymupdf.open()
        diff_count = 0
        diff_details = []

        zoom = dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)

        for i in range(max_pages):
            p1 = doc1[i] if i < len(doc1) else None
            p2 = doc2[i] if i < len(doc2) else None

            if p1 and p2:
                pix1 = p1.get_pixmap(matrix=mat, alpha=False)
                pix2 = p2.get_pixmap(matrix=mat, alpha=False)

                img1 = Image.frombytes("RGB", [pix1.width, pix1.height], pix1.samples)
                img2 = Image.frombytes("RGB", [pix2.width, pix2.height], pix2.samples)

                if img1.size != img2.size:
                    img2 = img2.resize(img1.size, Image.Resampling.BILINEAR)

                arr1 = np.array(img1, dtype=np.int16)
                arr2 = np.array(img2, dtype=np.int16)

                diff = np.abs(arr1 - arr2)
                diff_mask = np.max(diff, axis=-1) > 25

                has_diff = np.any(diff_mask)
                if has_diff:
                    diff_count += 1
                    diff_details.append(i + 1)
                    res_arr = arr2.copy()
                    res_arr[diff_mask] = [235, 45, 45]  # 标红差异
                    res_img = Image.fromarray(res_arr.astype(np.uint8))
                else:
                    res_img = img2

                buf = io.BytesIO()
                res_img.save(buf, format="JPEG", quality=85)
                buf.seek(0)
                rect = p2.rect
            elif p2:
                diff_count += 1
                diff_details.append(i + 1)
                pix = p2.get_pixmap(matrix=mat, alpha=False)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                buf.seek(0)
                rect = p2.rect
            else:
                diff_count += 1
                diff_details.append(i + 1)
                pix = p1.get_pixmap(matrix=mat, alpha=False)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                buf.seek(0)
                rect = p1.rect

            new_page = out_doc.new_page(width=rect.width, height=rect.height)
            new_page.insert_image(rect, stream=buf.getvalue())

        out_doc.save(output_path, deflate=True)
        return {
            "success": True,
            "outputPath": output_path,
            "totalPages": max_pages,
            "diffCount": diff_count,
            "diffPages": diff_details
        }
    except Exception as e:
        return {"success": False, "error": f"文档对比执行异常: {str(e)}"}


# -------------------------------------------------------------
# 10. 高保真 PDF 转可编辑 Word (.docx) (Clean-Room 原生自研)
# -------------------------------------------------------------
def convert_pdf_to_word(input_path: str, output_path: str) -> Dict[str, Any]:
    if not os.path.exists(input_path):
        return {"success": False, "error": f"输入文件不存在: {input_path}"}
    try:
        import docx
        doc = pymupdf.open(input_path)
        word_doc = docx.Document()

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            blocks = page.get_text("blocks")
            # blocks: (x0, y0, x1, y1, text, block_no, block_type)
            for b in blocks:
                if b[6] == 0:
                    text = b[4].strip()
                    if not text:
                        continue
                    lines = text.split("\n")
                    height = b[3] - b[1]
                    est_fontsize = height / max(1, len(lines))

                    p = word_doc.add_paragraph()
                    run = p.add_run(text)
                    if est_fontsize > 20:
                        run.font.size = docx.shared.Pt(18)
                        run.font.bold = True
                    elif est_fontsize > 14:
                        run.font.size = docx.shared.Pt(14)
                        run.font.bold = True
                    else:
                        run.font.size = docx.shared.Pt(11)

            if page_idx < len(doc) - 1:
                word_doc.add_page_break()

        word_doc.save(output_path)
        return {"success": True, "outputPath": output_path, "pageCount": len(doc)}
    except Exception as e:
        return {"success": False, "error": f"PDF 转 Word 失败: {str(e)}"}


# -------------------------------------------------------------
# 11. 交互式目录/书签大纲读取与回写 (TOC Management)
# -------------------------------------------------------------
def get_pdf_toc(input_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        raw_toc = doc.get_toc(simple=True)
        res_toc = [{"level": item[0], "title": item[1], "page": item[2]} for item in raw_toc]
        return {"success": True, "toc": res_toc, "totalPages": len(doc)}
    except Exception as e:
        return {"success": False, "error": f"读取目录失败: {str(e)}"}


def set_pdf_toc(input_path: str, output_path: str, toc_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        raw_toc = [[item["level"], item["title"], item["page"]] for item in toc_data]
        doc.set_toc(raw_toc)
        doc.save(output_path, deflate=True)
        return {"success": True, "outputPath": output_path, "itemCount": len(raw_toc)}
    except Exception as e:
        return {"success": False, "error": f"写入目录失败: {str(e)}"}


# -------------------------------------------------------------
# 12. 以空白页为界自动批量拆分多份文档 (Split by Blank Pages)
# -------------------------------------------------------------
def split_by_blank_pages(input_path: str, output_dir: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        total_pages = len(doc)
        if total_pages == 0:
            return {"success": False, "error": "文档无有效页面"}

        blank_indices = set()
        for idx in range(total_pages):
            page = doc[idx]
            pix = page.get_pixmap(dpi=72, alpha=False)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
            gray = np.dot(arr[..., :3], [0.2989, 0.5870, 0.1140])
            if np.var(gray) < 15.0 and np.mean(gray) > 240.0:
                blank_indices.add(idx)

        segments = []
        current_seg = []
        for idx in range(total_pages):
            if idx in blank_indices:
                if current_seg:
                    segments.append(current_seg)
                    current_seg = []
            else:
                current_seg.append(idx)
        if current_seg:
            segments.append(current_seg)

        if not segments:
            return {"success": False, "error": "整篇文档全为空白页"}

        os.makedirs(output_dir, exist_ok=True)
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_files = []

        for s_idx, seg_pages in enumerate(segments):
            out_doc = pymupdf.open()
            for p in seg_pages:
                out_doc.insert_pdf(doc, from_page=p, to_page=p)
            out_file = os.path.join(output_dir, f"{base_name}_part_{s_idx + 1}.pdf")
            out_doc.save(out_file, deflate=True)
            output_files.append(out_file)

        return {
            "success": True,
            "outputFiles": output_files,
            "partsCount": len(output_files),
            "blankPagesCount": len(blank_indices)
        }
    except Exception as e:
        return {"success": False, "error": f"按空白页切分失败: {str(e)}"}


# -------------------------------------------------------------
# 13. 基于文本朝向的整页自动旋转扶正 (Auto Rotate 90/180/270)
# -------------------------------------------------------------
def auto_rotate_pdf(input_path: str, output_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        rotated_pages = []

        for idx in range(len(doc)):
            page = doc[idx]
            text_data = page.get_text("rawjson")
            data = json.loads(text_data)
            dir_votes = {0: 0, 90: 0, 180: 0, 270: 0}

            for block in data.get("blocks", []):
                for line in block.get("lines", []):
                    dir_vec = line.get("dir", [1.0, 0.0])
                    dx, dy = dir_vec[0], dir_vec[1]
                    deg = round(math.degrees(math.atan2(dy, dx))) % 360
                    if 315 <= deg or deg < 45:
                        dir_votes[0] += 1
                    elif 45 <= deg < 135:
                        dir_votes[90] += 1
                    elif 135 <= deg < 225:
                        dir_votes[180] += 1
                    elif 225 <= deg < 315:
                        dir_votes[270] += 1

            dom_angle = max(dir_votes, key=dir_votes.get)
            if dom_angle != 0 and dir_votes[dom_angle] >= 2:
                fix_angle = (360 - dom_angle) % 360
                page.set_rotation((page.rotation + fix_angle) % 360)
                rotated_pages.append(idx + 1)

        doc.save(output_path, deflate=True)
        return {
            "success": True,
            "outputPath": output_path,
            "rotatedPages": rotated_pages,
            "count": len(rotated_pages)
        }
    except Exception as e:
        return {"success": False, "error": f"自动旋转校准失败: {str(e)}"}


# -------------------------------------------------------------
# 14. 密码安全加密与权限控制 (Encrypt PDF AES-256)
# -------------------------------------------------------------
def encrypt_pdf(input_path: str, output_path: str, user_pw: str = "", owner_pw: str = "", permissions_json: str = "") -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        perm = pymupdf.PDF_PERM_ACCESSIBILITY
        if permissions_json:
            try:
                p = json.loads(permissions_json)
                if p.get("printing"):
                    perm |= (pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_PRINT_HQ)
                if p.get("modifying"):
                    perm |= pymupdf.PDF_PERM_MODIFY
                if p.get("copying"):
                    perm |= pymupdf.PDF_PERM_COPY
                if p.get("annotating"):
                    perm |= pymupdf.PDF_PERM_ANNOTATE
                if p.get("fillingForms"):
                    perm |= pymupdf.PDF_PERM_FORM
                if p.get("documentAssembly"):
                    perm |= pymupdf.PDF_PERM_ASSEMBLE
            except Exception:
                perm |= (pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_COPY)
        else:
            perm |= (pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_COPY)

        doc.save(
            output_path,
            encryption=pymupdf.PDF_ENCRYPT_AES_256,
            user_pw=user_pw or "",
            owner_pw=owner_pw or user_pw or "",
            permissions=perm
        )
        page_count = len(doc)
        doc.close()
        return {"success": True, "outputPath": output_path, "pageCount": page_count}
    except Exception as e:
        return {"success": False, "error": f"加密 PDF 失败: {str(e)}"}


# -------------------------------------------------------------
# 15. 密码脱壳解密与清除 (Remove Password / Decrypt)
# -------------------------------------------------------------
def remove_pdf_password(input_path: str, password: str, output_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        if doc.is_encrypted:
            ok = doc.authenticate(password or "")
            if not ok:
                return {"success": False, "error": "密码不正确，无法解密文档"}
        doc.save(output_path, encryption=pymupdf.PDF_ENCRYPT_NONE)
        return {"success": True, "outputPath": output_path}
    except Exception as e:
        return {"success": False, "error": f"移除密码失败: {str(e)}"}


# -------------------------------------------------------------
# 15. 外部附件文件嵌入与导出 (Attachments)
# -------------------------------------------------------------
def add_pdf_attachment(input_path: str, attach_file: str, output_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        with open(attach_file, "rb") as f:
            data = f.read()
        fname = os.path.basename(attach_file)
        doc.embfile_add(fname, data, filename=fname)
        doc.save(output_path, deflate=True)
        return {"success": True, "outputPath": output_path, "fileName": fname}
    except Exception as e:
        return {"success": False, "error": f"嵌入附件失败: {str(e)}"}


def extract_pdf_attachments(input_path: str, output_dir: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        names = doc.embfile_names()
        extracted = []
        os.makedirs(output_dir, exist_ok=True)
        for name in names:
            data = doc.embfile_get(name)
            out_file = os.path.join(output_dir, name)
            with open(out_file, "wb") as f:
                f.write(data)
            extracted.append(out_file)
        return {"success": True, "files": extracted, "count": len(extracted)}
    except Exception as e:
        return {"success": False, "error": f"提取附件失败: {str(e)}"}


# -------------------------------------------------------------
# 16. 数字签名验证与密码学签名管理 (Digital Signatures)
# -------------------------------------------------------------
def _validate_pdf_signatures_basic(input_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        sig_count = 0
        sig_details = []
        for page in doc:
            for widget in page.widgets():
                if widget.field_type == pymupdf.PDF_WIDGET_TYPE_SIGNATURE:
                    sig_count += 1
                    sig_details.append({
                        "name": widget.field_name,
                        "value": widget.field_value or "PKCS#7 Digital Signature",
                        "page": page.number + 1
                    })
        return {
            "success": True,
            "hasSignatures": sig_count > 0,
            "signatureCount": sig_count,
            "signatures": sig_details
        }
    except Exception as e:
        return {"success": False, "error": f"验证签名失败: {str(e)}"}


# -------------------------------------------------------------
# 17. 按条形码/二维码自动拆分多文档 (Split by Barcode / QR Code)
# -------------------------------------------------------------
def split_by_barcode(input_path: str, output_dir: str) -> Dict[str, Any]:
    try:
        import cv2

        doc = pymupdf.open(input_path)
        total_pages = len(doc)
        if total_pages == 0:
            return {"success": False, "error": "文档没有任何页面"}

        os.makedirs(output_dir, exist_ok=True)
        base_name = os.path.splitext(os.path.basename(input_path))[0]

        qr_detector = cv2.QRCodeDetector()
        bc_detector = cv2.barcode.BarcodeDetector() if hasattr(cv2, 'barcode') else None

        # 扫描每一页的条形码 / QR Code
        page_codes: List[Optional[str]] = []
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=150)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.h, pix.w, pix.n))
            if pix.n == 4:
                bgr = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
            elif pix.n == 3:
                bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            else:
                bgr = img

            found_code = None
            # 1. 尝试检测二维码
            try:
                qr_val, _, _ = qr_detector.detectAndDecode(bgr)
                if qr_val and qr_val.strip():
                    found_code = qr_val.strip()
            except Exception:
                pass

            # 2. 若未检测到二维码，尝试检测一维条形码 (Code-128, EAN 等)
            if not found_code and bc_detector:
                try:
                    res = bc_detector.detectAndDecode(bgr)
                    if res and len(res) > 0 and res[0]:
                        val = res[0]
                        if isinstance(val, (list, tuple)) and len(val) > 0:
                            found_code = str(val[0]).strip()
                        elif isinstance(val, str) and val.strip():
                            found_code = val.strip()
                except Exception:
                    pass

            page_codes.append(found_code)

        # 根据检测到的条码进行切分：遇到新条码作为新切片起点
        splits: List[Tuple[int, int, str]] = []
        curr_start = 0
        curr_code = page_codes[0] or "part_1"

        for i in range(1, total_pages):
            code = page_codes[i]
            if code and code != curr_code:
                splits.append((curr_start, i - 1, curr_code))
                curr_start = i
                curr_code = code

        splits.append((curr_start, total_pages - 1, curr_code))

        output_files = []
        used_stems = set()
        for idx, (sp, ep, code) in enumerate(splits, start=1):
            clean_code = "".join(c for c in code if c.isalnum() or c in ("-", "_")).strip()
            if not clean_code:
                clean_code = f"part_{idx}"
            # 同一条码值可能出现在不连续分段，追加序号保证输出文件名唯一，避免互相覆盖
            file_stem = clean_code
            dup_seq = 2
            while file_stem in used_stems:
                file_stem = f"{clean_code}_part{dup_seq}"
                dup_seq += 1
            used_stems.add(file_stem)
            out_file = os.path.join(output_dir, f"{base_name}_{file_stem}.pdf")
            sub_doc = pymupdf.open()
            sub_doc.insert_pdf(doc, from_page=sp, to_page=ep)
            sub_doc.save(out_file, deflate=True)
            sub_doc.close()
            output_files.append(out_file)

        doc.close()
        return {
            "success": True,
            "outputFiles": output_files,
            "count": len(output_files),
            "barcodeCount": sum(1 for c in page_codes if c is not None)
        }
    except Exception as e:
        return {"success": False, "error": f"按条码切分失败: {str(e)}"}


# -------------------------------------------------------------
# 18. 基于 P12/PFX 证书的 PKCS#7 密码学数字签名 (Digital Signature)
# -------------------------------------------------------------
def _sign_pdf_p12_legacy(input_path: str, p12_path: str, password: str, output_path: str, reason: str = "Document Approved", location: str = "Desktop Client", tsa_url: str = "") -> Dict[str, Any]:
    try:
        from cryptography.hazmat.primitives.serialization import pkcs12, pkcs7, Encoding
        from cryptography.hazmat.primitives import hashes

        with open(p12_path, "rb") as f:
            p12_data = f.read()

        pw_bytes = password.encode("utf-8") if password else None
        private_key, cert, additional_certs = pkcs12.load_key_and_certificates(p12_data, pw_bytes)

        if not private_key or not cert:
            return {"success": False, "error": "P12/PFX 证书中未找到私钥或证书对象"}

        doc = pymupdf.open(input_path)
        first_page = doc[0]

        # 添加数字签名控件
        w = pymupdf.Widget()
        w.field_type = pymupdf.PDF_WIDGET_TYPE_SIGNATURE
        w.field_name = f"Signature_{int(time.time())}"
        w.rect = pymupdf.Rect(50, 50, 250, 100)
        w = first_page.add_widget(w)

        sig_xref = doc.get_new_xref()
        placeholder_contents = "0" * 8192
        placeholder_br = "[ 0 1111111111 2222222222 3333333333 ]"

        signer_name = ""
        try:
            from cryptography import x509
            for attr in cert.subject:
                if attr.oid == x509.NameOID.COMMON_NAME:
                    signer_name = str(attr.value)
                    break
        except Exception:
            pass
        if not signer_name:
            signer_name = "Authorized Signer"

        now_str = datetime.now().strftime("D:%Y%m%d%H%M%S+08'00'")
        doc.update_object(sig_xref, f"""<<
  /Type /Sig
  /Filter /Adobe.PPKLite
  /SubFilter /adbe.pkcs7.detached
  /ByteRange {placeholder_br}
  /Contents <{placeholder_contents}>
  /M ({now_str})
  /Name ({signer_name})
  /Reason ({reason})
  /Location ({location})
>>""")
        doc.xref_set_key(w.xref, "V", f"{sig_xref} 0 R")

        pdf_bytes = bytearray(doc.tobytes())
        doc.close()

        # 动态探测定位 ByteRange 与 Contents 占位符
        br_start = pdf_bytes.find(b"/ByteRange")
        if br_start == -1:
            return {"success": False, "error": "无法定位 PDF 签名 ByteRange 占位符"}
        br_end = pdf_bytes.find(b"]", br_start) + 1
        if br_end == 0:
            return {"success": False, "error": "无法定位 PDF 签名 ByteRange 闭合符"}

        cnt_start = pdf_bytes.find(b"/Contents<", br_end)
        if cnt_start == -1:
            return {"success": False, "error": "无法定位 PDF 签名 Contents 占位符"}
        cnt_start += len(b"/Contents<")
        cnt_end = pdf_bytes.find(b">", cnt_start)
        if cnt_end == -1:
            return {"success": False, "error": "无法定位 PDF 签名 Contents 闭合符"}

        start_c = cnt_start
        end_c = cnt_end

        o1 = start_c - 1
        o2 = end_c + 1
        o3 = len(pdf_bytes) - o2

        target_len = br_end - (br_start + len(b"/ByteRange"))
        real_br = f"[{0} {o1} {o2} {o3}]".encode("ascii").ljust(target_len, b" ")
        pdf_bytes[br_start + len(b"/ByteRange"):br_end] = real_br

        data_to_sign = bytes(pdf_bytes[0:o1] + pdf_bytes[o2:o2+o3])

        builder = pkcs7.PKCS7SignatureBuilder().set_data(data_to_sign).add_signer(cert, private_key, hashes.SHA256())
        if additional_certs:
            for ac in additional_certs:
                builder = builder.add_certificate(ac)

        sig_der = builder.sign(Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature])
        sig_hex = sig_der.hex().encode("ascii")

        if len(sig_hex) > len(placeholder_contents):
            return {"success": False, "error": "证书链长度超出预留签名空间 (8192 bytes)"}

        pdf_bytes[start_c:start_c+len(sig_hex)] = sig_hex

        with open(output_path, "wb") as f:
            f.write(pdf_bytes)

        return {
            "success": True,
            "outputPath": output_path,
            "signer": signer_name,
            "reason": reason,
            "hasTimestamp": bool(tsa_url)
        }
    except Exception as e:
        return {"success": False, "error": f"数字证书签名失败: {str(e)}"}


# -------------------------------------------------------------
# 19. PDF/A 国际长期电子归档标准格式转换 (ISO 19005)
# -------------------------------------------------------------
def _convert_to_pdfa_legacy(input_path: str, output_path: str, conformance: str = "1b") -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        part = "1" if "1" in conformance else "2"
        conf = "B" if "b" in conformance.lower() else "A"

        # 注入标准 PDF/A XMP 命名空间架构
        xmp_xml = f"""<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>{part}</pdfaid:part>
      <pdfaid:conformance>{conf}</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>PDFOpen Studio PDF/A Engine</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"""

        doc.set_xml_metadata(xmp_xml)

        # 注入标准 sRGB OutputIntent
        cat_xref = doc.pdf_catalog()
        oi_xref = doc.get_new_xref()
        doc.update_object(oi_xref, """<<
  /Type /OutputIntent
  /S /GTS_PDFA1
  /OutputConditionIdentifier (sRGB IEC61966-2.1)
  /Info (sRGB IEC61966-2.1)
>>""")
        doc.xref_set_key(cat_xref, "OutputIntents", f"[{oi_xref} 0 R]")

        # 线性化无损压缩保存
        doc.save(output_path, deflate=True, clean=True, garbage=3)
        page_count = len(doc)
        doc.close()

        return {
            "success": True,
            "outputPath": output_path,
            "conformance": f"PDF/A-{part}{conf.lower()}",
            "pageCount": page_count
        }
    except Exception as e:
        return {"success": False, "error": f"PDF/A 转换失败: {str(e)}"}


# -------------------------------------------------------------
# 20. 按书签/目录章节智能拆分 (Split by Bookmarks / Outline)
# -------------------------------------------------------------
def split_by_bookmarks(input_path: str, output_dir: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        toc = doc.get_toc()
        if not toc:
            return {"success": False, "error": "该文档未包含任何目录/书签大纲"}

        min_lvl = min(item[0] for item in toc)
        top_sections = [item for item in toc if item[0] == min_lvl]
        if not top_sections:
            return {"success": False, "error": "未找到有效的大纲章节"}

        os.makedirs(output_dir, exist_ok=True)
        total_pages = len(doc)
        output_files = []

        for idx, sec in enumerate(top_sections):
            lvl, title, start_page = sec[0], sec[1], sec[2]
            start_idx = max(0, start_page - 1)
            if idx + 1 < len(top_sections):
                end_idx = max(start_idx, top_sections[idx + 1][2] - 2)
            else:
                end_idx = total_pages - 1

            if start_idx >= total_pages or start_idx > end_idx:
                continue

            clean_title = re.sub(r'[\/\\:\*\?"<>\|]', '_', title).strip() or f"Chapter_{idx+1}"
            out_name = f"{idx+1:02d}_{clean_title}.pdf"
            out_path = os.path.join(output_dir, out_name)

            part_doc = pymupdf.open()
            part_doc.insert_pdf(doc, from_page=start_idx, to_page=end_idx)
            part_doc.save(out_path, garbage=3, deflate=True)
            part_doc.close()

            output_files.append({
                "title": title,
                "startPage": start_page,
                "endPage": end_idx + 1,
                "filePath": out_path
            })

        doc.close()
        return {
            "success": True,
            "count": len(output_files),
            "outputFiles": output_files
        }
    except Exception as e:
        return {"success": False, "error": f"按书签拆分失败: {str(e)}"}


# -------------------------------------------------------------
# 21. 纯文本 (.txt) 与 Markdown (.md) 转 PDF
# -------------------------------------------------------------
def convert_text_or_markdown_to_pdf(input_path: str, output_path: str) -> Dict[str, Any]:
    try:
        with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
            raw_text = f.read()

        doc = pymupdf.open()
        margin = 54
        page_width, page_height = 595.28, 841.89
        lines = raw_text.splitlines()
        page = doc.new_page(width=page_width, height=page_height)
        y = margin + 14

        for line in lines:
            line_str = line.strip()
            is_h1 = line.startswith("# ")
            is_h2 = line.startswith("## ")
            is_h3 = line.startswith("### ")

            fontsize = 16 if is_h1 else (14 if is_h2 else (12 if is_h3 else 10.5))
            clean_line = line.lstrip("#").strip() if (is_h1 or is_h2 or is_h3) else line

            if y + fontsize * 1.5 > page_height - margin:
                page = doc.new_page(width=page_width, height=page_height)
                y = margin + 14

            page.insert_text(
                pymupdf.Point(margin, y),
                clean_line,
                fontsize=fontsize,
                fontname="china-s"
            )
            y += fontsize * 1.6 + (6 if (is_h1 or is_h2) else 2)

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        doc.save(output_path, garbage=3, deflate=True)
        count = len(doc)
        doc.close()
        return {"success": True, "outputPath": output_path, "pageCount": count}
    except Exception as e:
        return {"success": False, "error": f"文本/Markdown 转 PDF 失败: {str(e)}"}


# -------------------------------------------------------------
# 22. CBZ / CBR 漫画格式转标准 PDF
# -------------------------------------------------------------
def convert_comic_to_pdf(comic_path: str, output_path: str) -> Dict[str, Any]:
    try:
        import zipfile
        out_doc = pymupdf.open()
        valid_exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}

        def natural_sort_key(s):
            return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]

        if zipfile.is_zipfile(comic_path):
            with zipfile.ZipFile(comic_path, 'r') as z:
                names = [n for n in z.namelist() if os.path.splitext(n)[1].lower() in valid_exts and not n.startswith("__MACOSX")]
                names.sort(key=natural_sort_key)
                if not names:
                    return {"success": False, "error": "漫画文件中未找到有效图片"}

                for name in names:
                    img_data = z.read(name)
                    pix = pymupdf.Pixmap(img_data)
                    page = out_doc.new_page(width=pix.width, height=pix.height)
                    page.insert_image(page.rect, stream=img_data)
        else:
            return {"success": False, "error": "目前支持 CBZ / ZIP 漫画包格式"}

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        out_doc.save(output_path, garbage=3, deflate=True)
        count = len(out_doc)
        out_doc.close()
        return {"success": True, "outputPath": output_path, "pageCount": count}
    except Exception as e:
        return {"success": False, "error": f"漫画转 PDF 失败: {str(e)}"}


# -------------------------------------------------------------
# 23. PDF 导出为独立 HTML 网页 (PDF to HTML)
# -------------------------------------------------------------
def convert_pdf_to_html(input_path: str, output_path: str) -> Dict[str, Any]:
    try:
        doc = pymupdf.open(input_path)
        html_chunks = [
            "<!DOCTYPE html>",
            "<html><head><meta charset='utf-8'>",
            "<title>Exported PDF Document</title>",
            "<style>",
            "body { background: #f1f5f9; margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
            ".pdf-page { background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); margin: 0 auto 24px auto; position: relative; border-radius: 4px; overflow: hidden; max-width: 900px; padding: 20px; }",
            "</style></head><body>"
        ]

        for p_idx, page in enumerate(doc):
            p_html = page.get_text("html")
            html_chunks.append(f"<div class='pdf-page' id='page-{p_idx+1}'>{p_html}</div>")

        html_chunks.append("</body></html>")
        count = len(doc)
        doc.close()

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(html_chunks))

        return {"success": True, "outputPath": output_path, "pageCount": count}
    except Exception as e:
        return {"success": False, "error": f"PDF 转 HTML 失败: {str(e)}"}


# -------------------------------------------------------------
# 24. PDF 导出为高保真 PowerPoint (.pptx)
# -------------------------------------------------------------
def convert_pdf_to_pptx(input_path: str, output_path: str, dpi: int = 150) -> Dict[str, Any]:
    try:
        from pptx import Presentation
        from pptx.util import Inches

        doc = pymupdf.open(input_path)
        prs = Presentation()
        blank_slide_layout = prs.slide_layouts[6]

        zoom = dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)

        for p_idx, page in enumerate(doc):
            w_pt, h_pt = page.rect.width, page.rect.height
            prs.slide_width = Inches(w_pt / 72.0)
            prs.slide_height = Inches(h_pt / 72.0)

            slide = prs.slides.add_slide(blank_slide_layout)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("jpeg")

            img_stream = io.BytesIO(img_bytes)
            slide.shapes.add_picture(img_stream, Inches(0), Inches(0), width=prs.slide_width, height=prs.slide_height)

            text = page.get_text()
            if text and text.strip():
                try:
                    notes_slide = slide.notes_slide
                    text_frame = notes_slide.notes_text_frame
                    text_frame.text = text[:2000]
                except Exception:
                    pass

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        prs.save(output_path)
        page_count = len(doc)
        doc.close()
        return {"success": True, "outputPath": output_path, "slideCount": page_count}
    except Exception as e:
        return {"success": False, "error": f"PDF 转 PPTX 失败: {str(e)}"}


# -------------------------------------------------------------
# 25. Office 文档转 PDF (Word / Excel / PowerPoint to PDF)
# -------------------------------------------------------------
def convert_office_to_pdf(input_path: str, output_path: str) -> Dict[str, Any]:
    try:
        ext = os.path.splitext(input_path)[1].lower()
        abs_in = os.path.abspath(input_path)
        abs_out = os.path.abspath(output_path)
        os.makedirs(os.path.dirname(abs_out), exist_ok=True)

        # 1. 尝试 Windows 原生 Office COM 接口 (win32com)
        try:
            import pythoncom
            pythoncom.CoInitialize()
            import win32com.client

            if ext in [".doc", ".docx"]:
                word = win32com.client.DispatchEx("Word.Application")
                word.Visible = False
                doc = word.Documents.Open(abs_in, ReadOnly=True)
                doc.ExportAsFixedFormat(abs_out, 17)
                doc.Close(False)
                word.Quit()
                return {"success": True, "outputPath": output_path, "engine": "Microsoft Word (COM Native)"}
            elif ext in [".xls", ".xlsx"]:
                excel = win32com.client.DispatchEx("Excel.Application")
                excel.Visible = False
                wb = excel.Workbooks.Open(abs_in, ReadOnly=True)
                wb.ExportAsFixedFormat(0, abs_out)
                wb.Close(False)
                excel.Quit()
                return {"success": True, "outputPath": output_path, "engine": "Microsoft Excel (COM Native)"}
            elif ext in [".ppt", ".pptx"]:
                powerpoint = win32com.client.DispatchEx("PowerPoint.Application")
                pres = powerpoint.Presentations.Open(abs_in, WithWindow=False)
                pres.SaveAs(abs_out, 32)
                pres.Close()
                powerpoint.Quit()
                return {"success": True, "outputPath": output_path, "engine": "Microsoft PowerPoint (COM Native)"}
        except Exception:
            pass

        # 2. 尝试无头 LibreOffice CLI
        import subprocess
        for soffice_cmd in ["soffice", "libreoffice", r"C:\Program Files\LibreOffice\program\soffice.exe"]:
            try:
                out_dir = os.path.dirname(abs_out)
                res = subprocess.run([soffice_cmd, "--headless", "--convert-to", "pdf", "--outdir", out_dir, abs_in], capture_output=True, timeout=30)
                gen_name = os.path.splitext(os.path.basename(abs_in))[0] + ".pdf"
                gen_path = os.path.join(out_dir, gen_name)
                if os.path.exists(gen_path):
                    if gen_path != abs_out:
                        shutil.move(gen_path, abs_out)
                    return {"success": True, "outputPath": output_path, "engine": "LibreOffice CLI"}
            except Exception:
                continue

        # 3. 如果是 docx 且缺少 Office，则基于 python-docx + PyMuPDF 降级纯净文本渲染
        if ext == ".docx":
            import docx
            doc_file = docx.Document(abs_in)
            paragraphs = [p.text for p in doc_file.paragraphs if p.text.strip()]
            new_pdf = pymupdf.open()
            page = new_pdf.new_page(width=595.28, height=841.89)
            y = 54 + 14
            for p_text in paragraphs:
                if y + 18 > 841.89 - 54:
                    page = new_pdf.new_page(width=595.28, height=841.89)
                    y = 54 + 14
                page.insert_text(pymupdf.Point(54, y), p_text, fontsize=11, fontname="china-s")
                y += 20
            new_pdf.save(abs_out)
            new_pdf.close()
            return {"success": True, "outputPath": output_path, "engine": "Pure Python-Docx Fallback"}

        return {"success": False, "error": "未检测到 Microsoft Office 或 LibreOffice 转换环境"}
    except Exception as e:
        return {"success": False, "error": f"Office 转 PDF 失败: {str(e)}"}


# -------------------------------------------------------------
# 26. 全格式图片批量转标准 PDF (Images to PDF: JPG/PNG/WebP/TIFF/GIF/BMP)
# -------------------------------------------------------------
def convert_images_to_pdf(images: List[str], output_path: str, page_size: str = "fit") -> Dict[str, Any]:
    try:
        from PIL import Image
        doc = pymupdf.open()

        for img_path in images:
            if not os.path.exists(img_path):
                continue

            with Image.open(img_path) as pil_img:
                # 兼容处理 RGBA/透明/动画/调色板格式
                if pil_img.mode in ("RGBA", "LA") or (pil_img.mode == "P" and "transparency" in pil_img.info):
                    bg = Image.new("RGB", pil_img.size, (255, 255, 255))
                    alpha_layer = pil_img.convert("RGBA").split()[3]
                    bg.paste(pil_img.convert("RGB"), mask=alpha_layer)
                    clean_img = bg
                else:
                    clean_img = pil_img.convert("RGB")

                buf = io.BytesIO()
                clean_img.save(buf, format="JPEG", quality=95)
                img_data = buf.getvalue()

                w_px, h_px = clean_img.size
                if page_size == "A4":
                    a4_w, a4_h = 595.28, 841.89
                    margin = 20
                    scale = min((a4_w - margin * 2) / w_px, (a4_h - margin * 2) / h_px)
                    rw, rh = w_px * scale, h_px * scale
                    page = doc.new_page(width=a4_w, height=a4_h)
                    rect = pymupdf.Rect((a4_w - rw) / 2, (a4_h - rh) / 2, (a4_w + rw) / 2, (a4_h + rh) / 2)
                    page.insert_image(rect, stream=img_data)
                else:
                    page = doc.new_page(width=w_px, height=h_px)
                    page.insert_image(page.rect, stream=img_data)

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        doc.save(output_path, garbage=3, deflate=True)
        count = len(doc)
        doc.close()
        return {"success": True, "outputPath": output_path, "pageCount": count}
    except Exception as e:
        return {"success": False, "error": f"全格式图片转 PDF 失败: {str(e)}"}


# -------------------------------------------------------------
# 27. PDF 逐页高保真渲染并导出为图片 (PDF to Image: JPG/PNG/TIFF/WebP)
# -------------------------------------------------------------
def convert_pdf_to_images(
    input_path: str,
    output_dir: str,
    img_format: str = "png",
    dpi: int = 200,
    pages: Optional[List[int]] = None
) -> Dict[str, Any]:
    try:
        from PIL import Image
        doc = pymupdf.open(input_path)
        os.makedirs(output_dir, exist_ok=True)

        zoom = dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)
        fmt = img_format.lower().strip()
        if fmt == "jpeg":
            fmt = "jpg"
        if fmt not in ["png", "jpg", "webp", "tiff"]:
            fmt = "png"

        base_name = os.path.splitext(os.path.basename(input_path))[0]
        output_files = []

        pages_to_render = pages if pages else list(range(1, len(doc) + 1))

        for p_num in pages_to_render:
            if p_num < 1 or p_num > len(doc):
                continue
            page = doc[p_num - 1]
            has_alpha = (fmt == "png")
            pix = page.get_pixmap(matrix=mat, alpha=has_alpha)

            img_filename = f"{base_name}_page_{p_num:03d}.{fmt}"
            out_img_path = os.path.join(output_dir, img_filename)

            mode = "RGBA" if has_alpha else "RGB"
            img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)

            if fmt == "jpg":
                img = img.convert("RGB")
                img.save(out_img_path, format="JPEG", quality=95)
            elif fmt == "png":
                img.save(out_img_path, format="PNG")
            elif fmt == "webp":
                img.save(out_img_path, format="WEBP", quality=95)
            elif fmt == "tiff":
                img.save(out_img_path, format="TIFF", compression="tiff_lzw")

            output_files.append(out_img_path)

        doc.close()
        return {
            "success": True,
            "outputFiles": output_files,
            "count": len(output_files),
            "outputDir": output_dir,
            "format": fmt,
            "dpi": dpi
        }
    except Exception as e:
        return {"success": False, "error": f"PDF 导出图片失败: {str(e)}"}


# -------------------------------------------------------------
# 主命令行调度入口
# -------------------------------------------------------------
# =============================================================
# 增强实现：真实密码学签名/验签、PDF/A、压缩、修复、隐私清理
# =============================================================

def _module_available(name: str) -> bool:
    import importlib.util
    return importlib.util.find_spec(name) is not None


def _save_to(doc, output_path: str, input_path: str, **save_kwargs) -> None:
    """PyMuPDF 不能把文档非增量保存到其自身打开的文件，输入输出相同时先写临时文件再替换"""
    same = os.path.abspath(output_path) == os.path.abspath(input_path)
    target = output_path + ".tmp_pdfopen" if same else output_path
    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    doc.save(target, **save_kwargs)
    doc.close()
    if same:
        os.replace(target, output_path)


def validate_pdf_signatures(input_path: str) -> Dict[str, Any]:
    """
    使用 pyHanko 对每个签名做完整校验：
      intact  —— ByteRange 覆盖内容的摘要与签名中的 messageDigest 一致（文档未被篡改）
      valid   —— 签名值能被签名证书公钥验证通过
      trusted —— 证书链可追溯到受信任根（自签名证书为 False）
    未安装 pyHanko 时退回到仅枚举签名域，并明确标注未做密码学校验。
    """
    if not _module_available("pyhanko"):
        res = _validate_pdf_signatures_basic(input_path)
        if res.get("success"):
            res["cryptoVerified"] = False
            res["note"] = "未安装 pyHanko，仅列出签名域，未做密码学校验（pip install pyhanko）"
        return res

    try:
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko_certvalidator import ValidationContext
        import logging
        # 自签名证书等“不受信任”属于正常校验结论，不需要把 pyHanko 的告警堆栈打印到 stderr
        logging.getLogger("pyhanko").setLevel(logging.CRITICAL)
        logging.getLogger("pyhanko_certvalidator").setLevel(logging.CRITICAL)

        details = []
        with open(input_path, "rb") as f:
            reader = PdfFileReader(f, strict=False)
            for emb in reader.embedded_signatures:
                item: Dict[str, Any] = {
                    "name": emb.field_name,
                    "intact": False,
                    "valid": False,
                    "trusted": False,
                }
                try:
                    status = validate_pdf_signature(emb, ValidationContext(allow_fetching=False))
                    cert = status.signing_cert
                    item.update({
                        "intact": bool(status.intact),
                        "valid": bool(status.valid),
                        "trusted": bool(status.trusted),
                        "signer": cert.subject.human_friendly if cert is not None else "",
                        "issuer": cert.issuer.human_friendly if cert is not None else "",
                        "signingTime": status.signer_reported_dt.isoformat() if status.signer_reported_dt else None,
                        "hasTimestamp": status.timestamp_validity is not None,
                        "coverage": getattr(status.coverage, "name", "") if status.coverage is not None else "",
                    })
                except Exception as e:  # 单个签名损坏不影响其余签名的校验
                    item["error"] = str(e)
                details.append(item)

        return {
            "success": True,
            "hasSignatures": len(details) > 0,
            "signatureCount": len(details),
            "signatures": details,
            "cryptoVerified": True,
        }
    except Exception as e:
        return {"success": False, "error": f"验证签名失败: {e}"}


def sign_pdf_p12(
    input_path: str,
    p12_path: str,
    password: str,
    output_path: str,
    reason: str = "Document Approved",
    location: str = "Desktop Client",
    tsa_url: str = "",
    page: int = 1,
    rect: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """
    基于 pyHanko 的 PAdES 兼容签名（包含 signedAttributes、ESS 证书引用），
    可选 RFC 3161 时间戳与可见签名外观。rect 为 PDF 坐标系 [x1, y1, x2, y2]（左下角原点）。
    """
    if not _module_available("pyhanko"):
        res = _sign_pdf_p12_legacy(input_path, p12_path, password, output_path, reason, location, tsa_url)
        if res.get("success"):
            res["hasTimestamp"] = False
            if tsa_url:
                res["warning"] = "未安装 pyHanko，已签名但未添加可信时间戳"
        return res

    try:
        from pyhanko.sign import signers, fields, timestamps
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

        try:
            signer = signers.SimpleSigner.load_pkcs12(
                pfx_file=p12_path, passphrase=password.encode("utf-8") if password else None
            )
        except Exception as e:
            return {"success": False, "error": f"无法加载 P12/PFX 证书（口令可能不正确）: {e}"}
        if signer is None:
            return {"success": False, "error": "无法加载 P12/PFX 证书，请检查证书文件与口令"}

        with pymupdf.open(input_path) as probe:
            if probe.needs_pass:
                return {"success": False, "error": "文档已加密，请先解密后再签名"}
            total_pages = len(probe)
        page_idx = min(max(1, int(page or 1)), total_pages) - 1

        field_name = f"Signature_{int(time.time())}"
        box = None
        if rect and len(rect) == 4:
            x1, y1, x2, y2 = [float(v) for v in rect]
            box = (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))

        meta = signers.PdfSignatureMetadata(
            field_name=field_name,
            reason=reason or None,
            location=location or None,
            md_algorithm="sha256",
        )
        timestamper = timestamps.HTTPTimeStamper(tsa_url, timeout=20) if tsa_url else None
        pdf_signer = signers.PdfSigner(
            meta,
            signer=signer,
            timestamper=timestamper,
            new_field_spec=fields.SigFieldSpec(sig_field_name=field_name, on_page=page_idx, box=box),
        )

        out = io.BytesIO()
        with open(input_path, "rb") as inf:
            writer = IncrementalPdfFileWriter(inf, strict=False)
            pdf_signer.sign_pdf(writer, output=out)

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(out.getvalue())

        signer_name = "Authorized Signer"
        try:
            signer_name = signer.signing_cert.subject.native.get("common_name") or signer_name
        except Exception:
            pass

        return {
            "success": True,
            "outputPath": output_path,
            "signer": signer_name,
            "reason": reason,
            # 时间戳请求失败时 pyHanko 会直接抛错，因此走到这里即表示时间戳确实已嵌入
            "hasTimestamp": bool(tsa_url),
            "visible": box is not None,
            "page": page_idx + 1,
        }
    except Exception as e:
        return {"success": False, "error": f"数字证书签名失败: {e}"}


def _srgb_icc_bytes() -> bytes:
    from PIL import ImageCms
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def _xmp_escape(value: str) -> str:
    return (value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _page_has_unembedded_font(page) -> bool:
    for f in page.get_fonts(full=True):
        # f = (xref, ext, type, basefont, name, encoding, referencer)；ext 为 "n/a" 表示字体未嵌入
        if f[1] == "n/a" and f[2] not in ("Type3",):
            return True
    return False


def _page_has_transparency(doc, page) -> bool:
    try:
        if "/Transparency" in (doc.xref_get_key(page.xref, "Group")[1] or ""):
            return True
        for img in page.get_images(full=True):
            if img[1] and img[1] > 0:  # smask xref
                return True
        res = doc.xref_get_key(page.xref, "Resources")
        text = doc.xref_object(page.xref, compressed=True) + (res[1] or "")
        for m in re.finditer(r"/(CA|ca)\s+([0-9.]+)", text):
            if float(m.group(2)) < 1.0:
                return True
        if "/SMask" in text and "/SMask /None" not in text:
            return True
    except Exception:
        pass
    return False


def _rasterize_page_keep_text(src_doc, out_doc, page_idx: int, dpi: int = 220) -> None:
    """将页面栅格化为图像，并用已嵌入字体叠加不可见文字层，保留可搜索/可复制能力"""
    page = src_doc[page_idx]
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    new_page = out_doc.new_page(width=page.rect.width, height=page.rect.height)
    new_page.insert_image(new_page.rect, stream=pix.tobytes("jpeg", jpg_quality=88))
    font = pymupdf.Font("cjk")
    new_page.insert_font(fontname="PDFOpenEmb", fontbuffer=font.buffer)
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                txt = span.get("text", "")
                if not txt.strip():
                    continue
                size = max(4.0, float(span.get("size", 10)))
                origin = span.get("origin") or (span["bbox"][0], span["bbox"][3])
                try:
                    new_page.insert_text(origin, txt, fontname="PDFOpenEmb", fontsize=size, render_mode=3)
                except Exception:
                    pass


def convert_to_pdfa(input_path: str, output_path: str, conformance: str = "2b") -> Dict[str, Any]:
    """
    PDF/A-1b / 2b / 3b 转换（纯 PyMuPDF 实现，不依赖 Ghostscript）：
      - 嵌入 sRGB ICC 的 OutputIntent（/DestOutputProfile）
      - 生成与 Info 字典一致的 XMP（pdfaid、dc、xmp、pdf 命名空间）
      - 移除 JavaScript / 自动动作；PDF/A-1、2 移除嵌入附件；补全注释打印标志
      - 含未嵌入字体（以及 PDF/A-1 中含透明度）的页面栅格化并保留隐形文字层
      - 输出后自检，返回检查结果；正式合规认证仍建议使用 veraPDF 复核
    """
    try:
        conformance = (conformance or "2b").lower().strip()
        part = conformance[0] if conformance[:1] in ("1", "2", "3") else "2"
        conf = "B"

        src = pymupdf.open(input_path)
        if src.needs_pass:
            return {"success": False, "error": "文档已加密，PDF/A 不允许加密，请先解密"}

        # 1. 判定需要栅格化的页面
        raster_pages = []
        for i, page in enumerate(src):
            if _page_has_unembedded_font(page) or (part == "1" and _page_has_transparency(src, page)):
                raster_pages.append(i)

        if raster_pages:
            out = pymupdf.open()
            for i in range(len(src)):
                if i in raster_pages:
                    _rasterize_page_keep_text(src, out, i)
                else:
                    out.insert_pdf(src, from_page=i, to_page=i)
            try:
                out.set_toc(src.get_toc())
            except Exception:
                pass
            meta_src = src.metadata or {}
            src.close()
            doc = out
        else:
            meta_src = src.metadata or {}
            doc = src

        # 2. 清理 PDF/A 禁止的内容
        cat = doc.pdf_catalog()
        for key in ("OpenAction", "AA"):
            doc.xref_set_key(cat, key, "null")
        names = doc.xref_get_key(cat, "Names")
        if names[0] == "xref":
            names_xref = int(names[1].split()[0])
            doc.xref_set_key(names_xref, "JavaScript", "null")
            if part in ("1", "2"):
                doc.xref_set_key(names_xref, "EmbeddedFiles", "null")
        elif names[0] == "dict":
            try:
                doc.xref_set_key(cat, "Names/JavaScript", "null")
                if part in ("1", "2"):
                    doc.xref_set_key(cat, "Names/EmbeddedFiles", "null")
            except Exception:
                pass
        if part in ("1", "2"):
            for name in list(doc.embfile_names()):
                try:
                    doc.embfile_del(name)
                except Exception:
                    pass

        removed_annots = 0
        for page in doc:
            doc.xref_set_key(page.xref, "AA", "null")
            for annot in list(page.annots() or []):
                atype = annot.type[1]
                if atype in ("Sound", "Movie", "Screen", "3D", "RichMedia") or (atype == "FileAttachment" and part != "3"):
                    page.delete_annot(annot)
                    removed_annots += 1
                    continue
                try:
                    annot.set_flags((annot.flags | pymupdf.PDF_ANNOT_IS_PRINT) & ~pymupdf.PDF_ANNOT_IS_HIDDEN & ~pymupdf.PDF_ANNOT_IS_INVISIBLE)
                    annot.update()
                except Exception:
                    pass

        # 3. 元数据：Info 与 XMP 保持一致
        now = datetime.now().astimezone()
        pdf_date = now.strftime("D:%Y%m%d%H%M%S") + now.strftime("%z")[:3] + "'" + now.strftime("%z")[3:] + "'"
        iso_date = now.isoformat(timespec="seconds")
        title = meta_src.get("title") or os.path.splitext(os.path.basename(input_path))[0]
        author = meta_src.get("author") or ""
        subject = meta_src.get("subject") or ""
        keywords = meta_src.get("keywords") or ""
        producer = "PDFOpen Studio PDF/A Engine (PyMuPDF)"
        doc.set_metadata({
            "title": title, "author": author, "subject": subject, "keywords": keywords,
            "creator": meta_src.get("creator") or "PDFOpen Studio", "producer": producer,
            "creationDate": pdf_date, "modDate": pdf_date,
        })
        creator_xml = f"<dc:creator><rdf:Seq><rdf:li>{_xmp_escape(author)}</rdf:li></rdf:Seq></dc:creator>" if author else ""
        desc_xml = f'<dc:description><rdf:Alt><rdf:li xml:lang="x-default">{_xmp_escape(subject)}</rdf:li></rdf:Alt></dc:description>' if subject else ""
        xmp = f"""<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdfaid:part>{part}</pdfaid:part>
      <pdfaid:conformance>{conf}</pdfaid:conformance>
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">{_xmp_escape(title)}</rdf:li></rdf:Alt></dc:title>
      {creator_xml}
      {desc_xml}
      <xmp:CreateDate>{iso_date}</xmp:CreateDate>
      <xmp:ModifyDate>{iso_date}</xmp:ModifyDate>
      <xmp:MetadataDate>{iso_date}</xmp:MetadataDate>
      <xmp:CreatorTool>{_xmp_escape(meta_src.get("creator") or "PDFOpen Studio")}</xmp:CreatorTool>
      <pdf:Producer>{_xmp_escape(producer)}</pdf:Producer>
      <pdf:Keywords>{_xmp_escape(keywords)}</pdf:Keywords>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"""
        doc.set_xml_metadata(xmp)

        # 4. sRGB OutputIntent（含必需的 ICC 配置文件流）
        icc_xref = doc.get_new_xref()
        doc.update_object(icc_xref, "<< /N 3 /Alternate /DeviceRGB >>")
        doc.update_stream(icc_xref, _srgb_icc_bytes())
        oi_xref = doc.get_new_xref()
        doc.update_object(
            oi_xref,
            f"<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) "
            f"/Info (sRGB IEC61966-2.1) /RegistryName (http://www.color.org) /DestOutputProfile {icc_xref} 0 R >>",
        )
        doc.xref_set_key(cat, "OutputIntents", f"[{oi_xref} 0 R]")

        # 5. 文件标识符（PDF/A 要求 trailer 中存在 /ID）
        import hashlib
        file_id = hashlib.md5(f"{input_path}{iso_date}".encode("utf-8")).hexdigest()
        try:
            doc.xref_set_key(-1, "ID", f"[<{file_id}><{file_id}>]")
        except Exception:
            pass

        page_count = len(doc)
        # PDF/A-1 不允许对象流 / 交叉引用流
        _save_to(doc, output_path, input_path, garbage=3, deflate=True, clean=True, use_objstms=0)

        # 6. 输出自检
        checks = []
        with pymupdf.open(output_path) as chk:
            unembedded = sorted({f[3] for p in chk for f in p.get_fonts(full=True) if f[1] == "n/a" and f[2] != "Type3"})
            checks.append({"item": "所有字体已嵌入", "ok": not unembedded, "detail": ", ".join(unembedded)})
            checks.append({"item": "未加密", "ok": not chk.is_encrypted})
            oi = chk.xref_get_key(chk.pdf_catalog(), "OutputIntents")
            oi_ok = oi[0] != "null" and "DestOutputProfile" in chk.xref_object(int(oi[1].strip("[] ").split()[0])) if oi[0] == "array" else False
            checks.append({"item": "包含 sRGB OutputIntent（含 ICC）", "ok": bool(oi_ok)})
            checks.append({"item": "XMP 声明 PDF/A 标识", "ok": f"<pdfaid:part>{part}</pdfaid:part>" in (chk.get_xml_metadata() or "")})
            if part == "1":
                transparent = [i + 1 for i, p in enumerate(chk) if _page_has_transparency(chk, p)]
                checks.append({"item": "无透明度 (PDF/A-1)", "ok": not transparent, "detail": ",".join(map(str, transparent))})
        all_ok = all(c["ok"] for c in checks)

        return {
            "success": True,
            "outputPath": output_path,
            "conformance": f"PDF/A-{part}{conf.lower()}",
            "pageCount": page_count,
            "rasterizedPages": [i + 1 for i in raster_pages],
            "removedAnnotations": removed_annots,
            "checks": checks,
            "selfCheckPassed": all_ok,
        }
    except Exception as e:
        return {"success": False, "error": f"PDF/A 转换失败: {e}"}


def compress_pdf(input_path: str, output_path: str, level: str = "medium") -> Dict[str, Any]:
    """图像降采样 + JPEG 重编码 + 字体子集化 + 对象去重与流压缩"""
    try:
        presets = {"low": (220, 85), "medium": (150, 72), "high": (96, 55)}
        dpi_target, quality = presets.get(level, presets["medium"])
        before = os.path.getsize(input_path)

        doc = pymupdf.open(input_path)
        if doc.needs_pass:
            return {"success": False, "error": "文档已加密，请先解密后再压缩"}
        page_count = len(doc)

        images_rewritten = True
        try:
            doc.rewrite_images(dpi_threshold=dpi_target + 20, dpi_target=dpi_target, quality=quality)
        except Exception:
            images_rewritten = False
        try:
            doc.subset_fonts()
        except Exception:
            pass

        tmp_out = output_path + ".tmp_compress"
        doc.save(tmp_out, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True, use_objstms=1)
        doc.close()

        after = os.path.getsize(tmp_out)
        if after >= before:
            # 已经是最优体积：保留原文件内容，避免“压缩后反而变大”
            os.remove(tmp_out)
            if os.path.abspath(input_path) != os.path.abspath(output_path):
                shutil.copyfile(input_path, output_path)
            after = before
            optimized = False
        else:
            os.replace(tmp_out, output_path)
            optimized = True

        return {
            "success": True,
            "outputPath": output_path,
            "pageCount": page_count,
            "originalSize": before,
            "compressedSize": after,
            "ratio": round((1 - after / before) * 100, 1) if before else 0,
            "optimized": optimized,
            "imagesRewritten": images_rewritten,
        }
    except Exception as e:
        return {"success": False, "error": f"压缩失败: {e}"}


def repair_pdf(input_path: str, output_path: str) -> Dict[str, Any]:
    """MuPDF 打开时会自动重建损坏的交叉引用表；再做一次彻底的对象清理与重写"""
    try:
        try:
            doc = pymupdf.open(input_path)
        except Exception:
            with open(input_path, "rb") as f:
                doc = pymupdf.open(stream=f.read(), filetype="pdf")
        if doc.needs_pass:
            return {"success": False, "error": "文档已加密，请先解密后再修复"}
        was_damaged = bool(getattr(doc, "is_repaired", False))
        page_count = len(doc)
        # 逐页检查可解析性，记录无法渲染的页面
        bad_pages = []
        for i in range(page_count):
            try:
                doc[i].get_text("text")
            except Exception:
                bad_pages.append(i + 1)
        _save_to(doc, output_path, input_path, garbage=4, deflate=True, clean=True)
        with pymupdf.open(output_path) as chk:
            final_pages = len(chk)
        return {
            "success": True,
            "outputPath": output_path,
            "pageCount": final_pages,
            "wasDamaged": was_damaged,
            "badPages": bad_pages,
        }
    except Exception as e:
        return {"success": False, "error": f"修复失败（文件可能损坏过于严重）: {e}"}


def sanitize_pdf(input_path: str, output_path: str) -> Dict[str, Any]:
    """清除元数据、XMP、JavaScript、嵌入附件、缩略图、自动执行动作等隐私与安全风险内容"""
    try:
        doc = pymupdf.open(input_path)
        if doc.needs_pass:
            return {"success": False, "error": "文档已加密，请先解密"}
        embedded = len(doc.embfile_names())
        had_js = "/JavaScript" in doc.xref_object(doc.pdf_catalog()) or any(
            "/JavaScript" in (doc.xref_object(x) or "") for x in range(1, min(doc.xref_length(), 5000))
        )
        meta_keys = [k for k, v in (doc.metadata or {}).items() if v and k not in ("format", "encryption")]

        doc.scrub(
            attached_files=True,
            clean_pages=True,
            embedded_files=True,
            hidden_text=False,   # 保留隐形文字层（OCR 双层 PDF 依赖它）
            javascript=True,
            metadata=True,
            redactions=True,
            redact_images=0,
            remove_links=False,  # 保留正常超链接
            reset_fields=False,  # 保留已填写的表单内容
            reset_responses=True,
            thumbnails=True,
            xml_metadata=True,
        )
        cat = doc.pdf_catalog()
        for key in ("OpenAction", "AA", "PieceInfo"):
            doc.xref_set_key(cat, key, "null")
        for page in doc:
            doc.xref_set_key(page.xref, "AA", "null")
            doc.xref_set_key(page.xref, "PieceInfo", "null")

        page_count = len(doc)
        _save_to(doc, output_path, input_path, garbage=4, deflate=True, clean=True)
        return {
            "success": True,
            "outputPath": output_path,
            "pageCount": page_count,
            "removed": {
                "metadataFields": meta_keys,
                "embeddedFiles": embedded,
                "javascript": bool(had_js),
            },
        }
    except Exception as e:
        return {"success": False, "error": f"隐私清理失败: {e}"}


# -------------------------------------------------------------
# 中日韩等非拉丁文字的水印 / 页码 / 贝茨编号
# pdf-lib 的标准字体只支持 WinAnsi，无法绘制中文；这里使用 PyMuPDF 内置的 CJK 字体（写入时自动子集嵌入）
# -------------------------------------------------------------
def _cjk_font():
    try:
        return pymupdf.Font("cjk")
    except Exception:
        return pymupdf.Font("china-s")


def _hex_to_rgb(color: Optional[str], default=(0.6, 0.6, 0.6)):
    try:
        h = (color or "").lstrip("#")
        if len(h) == 6:
            return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except Exception:
        pass
    return default


def _write_text(page, font, text: str, fontsize: float, x: float, y_top: float, color, opacity: float, rotate_deg: float = 0.0):
    """在页面坐标 (x, y_top) 处（左上原点，y 为文字顶部）写入文字，可绕文字中心旋转"""
    width = font.text_length(text, fontsize=fontsize)
    baseline = pymupdf.Point(x, y_top + fontsize * 0.88)
    tw = pymupdf.TextWriter(page.rect, opacity=max(0.0, min(1.0, opacity)), color=color)
    tw.append(baseline, text, font=font, fontsize=fontsize)
    morph = None
    if rotate_deg:
        pivot = pymupdf.Point(x + width / 2, y_top + fontsize / 2)
        # 实测：TextWriter 的 morph 使用 PDF 原生坐标方向，正角度即为视觉上的逆时针（与 pdf-lib degrees() 一致）
        morph = (pivot, pymupdf.Matrix(rotate_deg))
    tw.write_text(page, morph=morph)


def add_text_watermark(input_path: str, output_path: str, spec: Dict[str, Any]) -> Dict[str, Any]:
    try:
        text = str(spec.get("text") or "").strip()
        if not text:
            return {"success": False, "error": "水印文字不能为空"}
        font = _cjk_font()
        doc = pymupdf.open(input_path)
        total = len(doc)
        size = float(spec.get("fontSize") or 48)
        opacity = float(spec.get("opacity") if spec.get("opacity") is not None else 0.25)
        rotation = float(spec.get("rotation") if spec.get("rotation") is not None else 45)
        position = spec.get("position") or "center"
        color = _hex_to_rgb(spec.get("color"))
        pages = [p - 1 for p in (spec.get("pages") or []) if 1 <= int(p) <= total] or list(range(total))

        for idx in pages:
            page = doc[idx]
            w, h = page.rect.width, page.rect.height
            if position == "tiled":
                fs = size * 0.7
                tw_len = font.text_length(text, fontsize=fs)
                step_x, step_y = tw_len + 120, fs + 120
                y = -h * 0.5
                while y < h * 1.5:
                    x = -w * 0.5
                    while x < w * 1.5:
                        _write_text(page, font, text, fs, x, y, color, opacity * 0.8, rotation)
                        x += step_x
                    y += step_y
            elif position in ("header", "footer"):
                fs = 14.0
                tw_len = font.text_length(text, fontsize=fs)
                y_top = 26 if position == "header" else h - 26 - fs
                _write_text(page, font, text, fs, (w - tw_len) / 2, y_top, color, opacity)
            else:
                tw_len = font.text_length(text, fontsize=size)
                _write_text(page, font, text, size, (w - tw_len) / 2, (h - size) / 2, color, opacity, rotation)

        _save_to(doc, output_path, input_path, garbage=3, deflate=True)
        return {"success": True, "outputPath": output_path, "pageCount": total}
    except Exception as e:
        return {"success": False, "error": f"添加水印失败: {e}"}


def stamp_page_texts(input_path: str, output_path: str, spec: Dict[str, Any]) -> Dict[str, Any]:
    """按页写入短文本（页码 / 贝茨编号），spec.items = [{page: 1 起始, text}]"""
    try:
        font = _cjk_font()
        doc = pymupdf.open(input_path)
        size = float(spec.get("fontSize") or 10)
        color = _hex_to_rgb(spec.get("color"), default=(0.25, 0.25, 0.25))
        position = spec.get("position") or "bottom-center"
        margin = float(spec.get("margin") or 24)
        for item in spec.get("items") or []:
            idx = int(item.get("page", 0)) - 1
            if idx < 0 or idx >= len(doc):
                continue
            text = str(item.get("text") or "")
            if not text:
                continue
            page = doc[idx]
            w, h = page.rect.width, page.rect.height
            tw_len = font.text_length(text, fontsize=size)
            x = (w - tw_len) / 2
            if position.endswith("left"):
                x = margin
            elif position.endswith("right"):
                x = w - margin - tw_len
            y_top = margin if position.startswith("top") else h - margin - size
            _write_text(page, font, text, size, x, y_top, color, 1.0)
        page_count = len(doc)
        _save_to(doc, output_path, input_path, garbage=3, deflate=True)
        return {"success": True, "outputPath": output_path, "pageCount": page_count}
    except Exception as e:
        return {"success": False, "error": f"写入页面文字失败: {e}"}


def main():
    parser = argparse.ArgumentParser(description="PDFOpen Studio Python Intelligence Bridge")
    parser.add_argument("--action", required=True)
    parser.add_argument("--input", help="输入 PDF 路径")
    parser.add_argument("--secondInput", help="第二份输入 PDF 路径（用于对比/合并等）")
    parser.add_argument("--output", help="输出路径")
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--pages", help="页码列表，逗号分隔")
    parser.add_argument("--rect", help="矩形坐标，JSON 数组 [x0, y0, x1, y1]")
    parser.add_argument("--rects", help="多个矩形坐标，JSON 嵌套数组")
    parser.add_argument("--text", help="文本内容")
    parser.add_argument("--fontSize", type=float)
    parser.add_argument("--pattern", help="敏感词或正则表达式")
    parser.add_argument("--annotType", help="批注类型: highlight, underline, strikeout, ink, note")
    parser.add_argument("--points", help="点序列 JSON")
    parser.add_argument("--color", help="颜色 RGB 浮点 JSON [r, g, b]")
    parser.add_argument("--query", help="RAG 搜索查询语句")
    parser.add_argument("--mode", help="模式参数: grayscale, invert 等")
    parser.add_argument("--password", help="文档解密密码")
    parser.add_argument("--userPassword", help="文档加密用户密码")
    parser.add_argument("--ownerPassword", help="文档加密所有者密码")
    parser.add_argument("--permissions", help="文档权限 JSON")
    parser.add_argument("--toc", help="目录 JSON 字符串")
    parser.add_argument("--attachFile", help="附加嵌入文件路径")
    parser.add_argument("--p12Path", help="P12/PFX 私钥证书路径")
    parser.add_argument("--p12Password", help="P12/PFX 证书口令")
    parser.add_argument("--reason", help="签名理由")
    parser.add_argument("--location", help="签署地点")
    parser.add_argument("--tsaUrl", help="RFC 3161 TSA 授时服务器 URL")
    parser.add_argument("--conformance", help="PDF/A 级别: 1b, 2b")
    parser.add_argument("--images", help="图片路径列表 JSON")
    parser.add_argument("--format", help="目标图片格式: png, jpg, webp, tiff")
    parser.add_argument("--pageSize", help="页面规格: fit, A4")
    parser.add_argument("--level", help="压缩等级: low, medium, high")
    parser.add_argument("--noise", type=int, default=15, help="扫描件噪点强度 0-50")
    parser.add_argument("--angle", type=float, default=0.4, help="扫描件随机倾斜最大角度")

    args = parser.parse_args()

    if args.action == "check_env":
        # 逐个探测可选依赖，如实返回可用状态，而不是硬编码 success
        import importlib.util
        optional_modules = {
            "rapidocr_onnxruntime": "RapidOCR",
            "openpyxl": "OpenPyXL",
            "docx": "python-docx",
            "pptx": "python-pptx",
            "cryptography": "cryptography",
            "cv2": "OpenCV",
            "pyhanko": "pyHanko",
        }
        modules = {label: importlib.util.find_spec(mod) is not None for mod, label in optional_modules.items()}
        available = [label for label, ok in modules.items() if ok]
        missing = [label for label, ok in modules.items() if not ok]
        print(json.dumps({
            # OCR 引擎是核心依赖，缺失则视为未就绪
            "success": modules["RapidOCR"],
            "engine": " + ".join(["PyMuPDF"] + available),
            "version": pymupdf.__version__,
            "modules": modules,
            "missing": missing
        }))
        return

    if args.action == "ocr_sandwich":
        res = make_searchable_pdf(args.input, args.output, dpi=args.dpi)
        print(json.dumps(res))
        return

    if args.action == "extract_tables":
        pages = [int(p.strip()) for p in args.pages.split(",")] if args.pages else None
        res = extract_tables_to_excel(args.input, args.output, pages_to_extract=pages)
        print(json.dumps(res))
        return

    if args.action == "get_text_blocks":
        res = get_page_text_blocks(args.input, args.page)
        print(json.dumps(res))
        return

    if args.action == "edit_text":
        rect = json.loads(args.rect) if args.rect else [0, 0, 0, 0]
        res = edit_text_block(args.input, args.output, args.page, rect, args.text, args.fontSize)
        print(json.dumps(res))
        return

    if args.action == "redact":
        rects = json.loads(args.rects) if args.rects else None
        fill_col = json.loads(args.color) if args.color else [0, 0, 0]
        res = redact_document(args.input, args.output, args.page, rects, args.pattern, fill_col)
        print(json.dumps(res))
        return

    if args.action == "add_annot":
        rect = json.loads(args.rect) if args.rect else None
        pts = json.loads(args.points) if args.points else None
        col = json.loads(args.color) if args.color else [1.0, 0.85, 0.0]
        res = add_annotation(args.input, args.output, args.page, args.annotType, rect, pts, col, args.text or "")
        print(json.dumps(res))
        return

    if args.action == "rag_query":
        res = query_document_rag(args.input, args.query, top_k=3)
        print(json.dumps(res))
        return

    if args.action == "scanner_effect":
        res = apply_scanner_effect(
            args.input, args.output, dpi=args.dpi,
            noise=max(0, min(50, args.noise)), angle=max(0.0, min(5.0, args.angle))
        )
        print(json.dumps(res))
        return

    if args.action == "auto_deskew":
        res = auto_deskew_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "remove_blank_pages":
        res = remove_blank_pages(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "grayscale_invert":
        mode = args.mode or "grayscale"
        res = grayscale_or_invert(args.input, args.output, mode=mode)
        print(json.dumps(res))
        return

    if args.action == "compare_documents":
        res = compare_documents(args.input, args.secondInput, args.output, dpi=args.dpi or 150)
        print(json.dumps(res))
        return

    if args.action == "pdf_to_word":
        res = convert_pdf_to_word(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "get_toc":
        res = get_pdf_toc(args.input)
        print(json.dumps(res))
        return

    if args.action == "set_toc":
        toc_items = json.loads(args.toc) if args.toc else []
        res = set_pdf_toc(args.input, args.output, toc_items)
        print(json.dumps(res))
        return

    if args.action == "split_by_blank_pages":
        res = split_by_blank_pages(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "auto_rotate":
        res = auto_rotate_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "encrypt_pdf":
        res = encrypt_pdf(args.input, args.output, user_pw=os.environ.get("PDFOPEN_USER_PASSWORD") or args.userPassword or args.password or "", owner_pw=os.environ.get("PDFOPEN_OWNER_PASSWORD") or args.ownerPassword or "", permissions_json=args.permissions or "")
        print(json.dumps(res))
        return

    if args.action == "remove_password":
        res = remove_pdf_password(args.input, os.environ.get("PDFOPEN_PASSWORD") or args.password or "", args.output)
        print(json.dumps(res))
        return

    if args.action == "add_attachment":
        res = add_pdf_attachment(args.input, args.attachFile, args.output)
        print(json.dumps(res))
        return

    if args.action == "extract_attachments":
        res = extract_pdf_attachments(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "validate_signatures":
        res = validate_pdf_signatures(args.input)
        print(json.dumps(res))
        return

    if args.action == "split_by_barcode":
        res = split_by_barcode(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "sign_p12":
        # 口令优先从环境变量读取，避免出现在进程命令行中被其他本地进程看到
        p12_password = os.environ.get("PDFOPEN_P12_PASSWORD") or args.p12Password or args.password or ""
        res = sign_pdf_p12(
            args.input,
            args.p12Path or "",
            p12_password,
            args.output,
            reason=args.reason or "Document Approved",
            location=args.location or "Desktop Client",
            tsa_url=args.tsaUrl or "",
            page=args.page or 1,
            rect=json.loads(args.rect) if args.rect else None,
        )
        print(json.dumps(res))
        return

    if args.action == "convert_to_pdfa":
        res = convert_to_pdfa(args.input, args.output, conformance=args.conformance or "2b")
        print(json.dumps(res))
        return

    if args.action == "text_watermark":
        res = add_text_watermark(args.input, args.output, json.loads(args.text or "{}"))
        print(json.dumps(res))
        return

    if args.action == "stamp_page_texts":
        res = stamp_page_texts(args.input, args.output, json.loads(args.text or "{}"))
        print(json.dumps(res))
        return

    if args.action == "compress_pdf":
        res = compress_pdf(args.input, args.output, level=args.level or "medium")
        print(json.dumps(res))
        return

    if args.action == "repair_pdf":
        res = repair_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "sanitize_pdf":
        res = sanitize_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "split_by_bookmarks":
        res = split_by_bookmarks(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "text_to_pdf":
        res = convert_text_or_markdown_to_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "comic_to_pdf":
        res = convert_comic_to_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "pdf_to_html":
        res = convert_pdf_to_html(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "pdf_to_pptx":
        res = convert_pdf_to_pptx(args.input, args.output, dpi=args.dpi or 150)
        print(json.dumps(res))
        return

    if args.action == "office_to_pdf":
        res = convert_office_to_pdf(args.input, args.output)
        print(json.dumps(res))
        return

    if args.action == "images_to_pdf":
        img_list = json.loads(args.images) if args.images else []
        res = convert_images_to_pdf(img_list, args.output, page_size=args.pageSize or "fit")
        print(json.dumps(res))
        return

    if args.action == "pdf_to_images":
        pages = [int(p.strip()) for p in args.pages.split(",")] if args.pages else None
        res = convert_pdf_to_images(args.input, args.output, img_format=args.format or "png", dpi=args.dpi or 200, pages=pages)
        print(json.dumps(res))
        return

    # 未知 action：返回结构化错误，避免 Node 侧出现“无法解析 JSON”的模糊提示
    print(json.dumps({"success": False, "error": f"未知的操作类型: {args.action}"}))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # 兜底：任何未捕获异常都以 JSON 形式返回给主进程
        print(json.dumps({"success": False, "error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False))
        sys.exit(0)

