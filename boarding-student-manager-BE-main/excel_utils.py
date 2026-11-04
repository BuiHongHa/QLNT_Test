import io
import csv
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from flask import Response

EXCEL_MIMETYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

def generate_excel_response(headers, data_rows, filename, sheet_name="Sheet1"):
    """
    Tạo workbook Excel (.xlsx) có định dạng chuẩn, trả về Flask Response để tải về.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_name

    # Kiểu header: Nền xanh navy (#00206D), chữ trắng in đậm, căn giữa
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="00206D", end_color="00206D", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    ws.row_dimensions[1].height = 28
    ws.append(headers)

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_align

    # Kiểu nội dung dữ liệu
    data_font = Font(name="Segoe UI", size=10)
    data_align = Alignment(vertical="center")
    thin_border = Border(
        left=Side(style="thin", color="E0E0E0"),
        right=Side(style="thin", color="E0E0E0"),
        top=Side(style="thin", color="E0E0E0"),
        bottom=Side(style="thin", color="E0E0E0")
    )

    for r_idx, row in enumerate(data_rows, start=2):
        ws.row_dimensions[r_idx].height = 22
        ws.append(list(row))
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=r_idx, column=col_idx)
            cell.font = data_font
            cell.alignment = data_align
            cell.border = thin_border

    # Tự động tính độ rộng cột hợp lý
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            val_str = str(cell.value or '')
            max_len = max(max_len, len(val_str))
        ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    # Đảm bảo filename có đuôi .xlsx
    if not filename.lower().endswith('.xlsx'):
        filename += '.xlsx'

    return Response(
        buf.getvalue(),
        mimetype=EXCEL_MIMETYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

def read_file_rows(file_storage):
    """
    Đọc dữ liệu từ file tải lên (hỗ trợ .xlsx, .xls và .csv).
    Trả về: (headers, list_of_dicts, list_of_raw_lists)
    """
    filename = (file_storage.filename or '').strip().lower()
    raw_bytes = file_storage.read()

    if filename.endswith('.xlsx') or filename.endswith('.xls'):
        wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
        ws = wb.active
        raw_rows = []
        for row in ws.iter_rows(values_only=True):
            if any(cell is not None and str(cell).strip() != '' for cell in row):
                cleaned_row = [str(cell).strip() if cell is not None else '' for cell in row]
                raw_rows.append(cleaned_row)

        if not raw_rows:
            return [], [], []

        headers = raw_rows[0]
        dict_rows = []
        for row_data in raw_rows[1:]:
            row_dict = {}
            for idx, h in enumerate(headers):
                if h:
                    val = row_data[idx] if idx < len(row_data) else ''
                    row_dict[h] = val
            dict_rows.append(row_dict)

        return headers, dict_rows, raw_rows[1:]

    # Fallback cho file .csv
    content = None
    for enc in ('utf-8-sig', 'utf-8', 'cp1258', 'cp1252', 'latin-1'):
        try:
            content = raw_bytes.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if content is None:
        return None, None, None

    stream = io.StringIO(content, newline=None)
    csv_reader = csv.reader(stream)
    raw_rows = [row for row in csv_reader if any(c.strip() for c in row)]

    if not raw_rows:
        return [], [], []

    headers = [c.strip() for c in raw_rows[0]]
    dict_rows = []
    for row_data in raw_rows[1:]:
        row_dict = {}
        for idx, h in enumerate(headers):
            if h:
                val = row_data[idx].strip() if idx < len(row_data) else ''
                row_dict[h] = val
        dict_rows.append(row_dict)

    return headers, dict_rows, raw_rows[1:]
