"""
Thin wrapper over python-docx so the document builders read as content.

Two things here are not cosmetic. Headings use Word's real `Heading N` styles
rather than bold paragraphs, because the ingest's heading detection reads
structure and a bold paragraph is not structure (ADR-18). And the base font is
Arial, which LibreOffice substitutes with Liberation Sans when it renders the
PDFs — both are installed everywhere this runs, so the corpus looks the same on
the machine that builds it and the laptop that opens it.
"""

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BRAND_BLUE = RGBColor(0x25, 0x2D, 0x53)
BRAND_RED = RGBColor(0xCB, 0x1D, 0x3D)
GREY = RGBColor(0x5B, 0x61, 0x78)


def new_document(language: str = "pl-PL") -> Document:
    document = Document()

    normal = document.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10.5)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.15
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")

    language_element = normal.element.rPr.makeelement(qn("w:lang"), {})
    language_element.set(qn("w:val"), language)
    normal.element.rPr.append(language_element)

    for level, size in ((1, 16), (2, 13), (3, 11.5)):
        style = document.styles[f"Heading {level}"]
        style.font.name = "Arial"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = BRAND_BLUE
        style.paragraph_format.space_before = Pt(14 if level == 1 else 10)
        style.paragraph_format.space_after = Pt(6)

    for section in document.sections:
        section.top_margin = Cm(2.2)
        section.bottom_margin = Cm(2.2)
        section.left_margin = Cm(2.4)
        section.right_margin = Cm(2.4)

    return document


def title(document: Document, text: str, subtitle: str | None = None) -> None:
    paragraph = document.add_paragraph()
    run = paragraph.add_run(text)
    run.font.size = Pt(21)
    run.font.bold = True
    run.font.color.rgb = BRAND_BLUE
    paragraph.paragraph_format.space_after = Pt(2)

    if subtitle:
        paragraph = document.add_paragraph()
        run = paragraph.add_run(subtitle)
        run.font.size = Pt(10)
        run.font.color.rgb = GREY
        paragraph.paragraph_format.space_after = Pt(14)


def heading(document: Document, text: str, level: int = 1) -> None:
    document.add_heading(text, level=level)


def para(document: Document, text: str, bold: bool = False) -> None:
    paragraph = document.add_paragraph()
    run = paragraph.add_run(text)
    run.font.bold = bold


def bullets(document: Document, items: list[str]) -> None:
    for item in items:
        document.add_paragraph(item, style="List Bullet")


def numbered(document: Document, items: list[str]) -> None:
    for item in items:
        document.add_paragraph(item, style="List Number")


def table(document: Document, headers: list[str], rows: list[list[str]],
          widths: list[float] | None = None) -> None:
    built = document.add_table(rows=1, cols=len(headers))
    built.style = "Table Grid"
    built.alignment = WD_TABLE_ALIGNMENT.CENTER

    for index, label in enumerate(headers):
        cell = built.rows[0].cells[index]
        cell.text = ""
        run = cell.paragraphs[0].add_run(label)
        run.font.bold = True
        run.font.size = Pt(9.5)
        run.font.color.rgb = BRAND_BLUE

    for row in rows:
        cells = built.add_row().cells
        for index, value in enumerate(row):
            cells[index].text = ""
            run = cells[index].paragraphs[0].add_run(str(value))
            run.font.size = Pt(9.5)

    if widths:
        for row in built.rows:
            for index, width in enumerate(widths):
                row.cells[index].width = Cm(width)

    document.add_paragraph()


def caption(document: Document, text: str) -> None:
    paragraph = document.add_paragraph()
    run = paragraph.add_run(text)
    run.font.size = Pt(8.5)
    run.font.color.rgb = GREY
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT


def footer_note(document: Document, text: str) -> None:
    paragraph = document.sections[0].footer.paragraphs[0]
    run = paragraph.add_run(text)
    run.font.size = Pt(8)
    run.font.color.rgb = GREY
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
