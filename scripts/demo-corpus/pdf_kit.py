"""
Thin wrapper over reportlab, with the same call shape as `docx_kit`.

The PDFs are drawn rather than exported from Word, because the container this
was built in carries `libreoffice-core` without the Writer filters and cannot
convert a .docx at all. What matters for the corpus survives the change:
headings are set in a larger bold face than body text and registered as PDF
outline entries, so the ingest's heading detection has a signal to read
(ADR-18), and tables are real table cells rather than space-aligned text.

Liberation Sans is embedded explicitly. reportlab's built-in Helvetica is
WinAnsi-encoded and would drop every Polish diacritic — the corpus is mostly
Polish, so this is not cosmetic.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

FONT_DIR = "/usr/share/fonts/truetype/liberation"
BRAND_BLUE = colors.HexColor("#252D53")
BRAND_RED = colors.HexColor("#CB1D3D")
GREY = colors.HexColor("#5B6178")
RULE = colors.HexColor("#D4D7E3")

_registered = False


def _register_fonts() -> None:
    global _registered
    if _registered:
        return
    pdfmetrics.registerFont(TTFont("Body", f"{FONT_DIR}/LiberationSans-Regular.ttf"))
    pdfmetrics.registerFont(TTFont("Body-Bold", f"{FONT_DIR}/LiberationSans-Bold.ttf"))
    pdfmetrics.registerFont(TTFont("Body-Italic", f"{FONT_DIR}/LiberationSans-Italic.ttf"))
    pdfmetrics.registerFontFamily(
        "Body", normal="Body", bold="Body-Bold", italic="Body-Italic"
    )
    _registered = True


STYLES = {
    "title": ParagraphStyle(
        "title", fontName="Body-Bold", fontSize=21, leading=25,
        textColor=BRAND_BLUE, spaceAfter=3,
    ),
    "subtitle": ParagraphStyle(
        "subtitle", fontName="Body", fontSize=9.5, leading=13,
        textColor=GREY, spaceAfter=16,
    ),
    "h1": ParagraphStyle(
        "h1", fontName="Body-Bold", fontSize=16, leading=19,
        textColor=BRAND_BLUE, spaceBefore=16, spaceAfter=7,
    ),
    "h2": ParagraphStyle(
        "h2", fontName="Body-Bold", fontSize=12.5, leading=15,
        textColor=BRAND_BLUE, spaceBefore=12, spaceAfter=5,
    ),
    "h3": ParagraphStyle(
        "h3", fontName="Body-Bold", fontSize=11, leading=14,
        textColor=BRAND_BLUE, spaceBefore=9, spaceAfter=4,
    ),
    "body": ParagraphStyle(
        "body", fontName="Body", fontSize=10, leading=14.5,
        alignment=TA_LEFT, spaceAfter=7,
    ),
    "bodyBold": ParagraphStyle(
        "bodyBold", fontName="Body-Bold", fontSize=10, leading=14.5, spaceAfter=7,
    ),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=8.8, leading=11.6),
    "cellHead": ParagraphStyle(
        "cellHead", fontName="Body-Bold", fontSize=8.8, leading=11.6,
        textColor=colors.white,
    ),
    "caption": ParagraphStyle(
        "caption", fontName="Body", fontSize=8, leading=10.5, textColor=GREY,
        spaceAfter=8,
    ),
}

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 2.2 * cm
MARGIN_Y = 2.0 * cm
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X


class PdfDocument:
    """Collects flowables; `save()` renders them."""

    def __init__(self, language: str = "pl-PL"):
        _register_fonts()
        self.language = language
        self.story: list = []
        self.footer = ""
        self._outline_counter = 0

    def save(self, path: str) -> None:
        footer = self.footer

        def decorate(canvas, doc):
            canvas.saveState()
            canvas.setFont("Body", 7.5)
            canvas.setFillColor(GREY)
            canvas.setStrokeColor(RULE)
            canvas.line(MARGIN_X, MARGIN_Y - 6, PAGE_WIDTH - MARGIN_X, MARGIN_Y - 6)
            canvas.drawString(MARGIN_X, MARGIN_Y - 17, footer)
            canvas.drawRightString(
                PAGE_WIDTH - MARGIN_X, MARGIN_Y - 17, f"str. {canvas.getPageNumber()}"
            )
            canvas.restoreState()

        frame = Frame(
            MARGIN_X,
            MARGIN_Y,
            CONTENT_WIDTH,
            PAGE_HEIGHT - 2 * MARGIN_Y,
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        template = BaseDocTemplate(
            path,
            pagesize=A4,
            leftMargin=MARGIN_X,
            rightMargin=MARGIN_X,
            topMargin=MARGIN_Y,
            bottomMargin=MARGIN_Y,
            title=self.title_text,
            author="Acme Industries sp. z o.o.",
            lang=self.language,
        )
        template.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=decorate)])
        template.build(list(self.story))

    title_text = ""


def new_document(language: str = "pl-PL") -> PdfDocument:
    return PdfDocument(language)


def title(document: PdfDocument, text: str, subtitle: str | None = None) -> None:
    document.title_text = text
    document.story.append(Paragraph(text, STYLES["title"]))
    if subtitle:
        document.story.append(Paragraph(subtitle, STYLES["subtitle"]))


class _Outline(Paragraph):
    """A heading that also writes a PDF outline entry."""

    def __init__(self, text: str, style, level: int, key: str):
        super().__init__(text, style)
        self._level = level
        self._key = key

    def draw(self):
        super().draw()
        self.canv.bookmarkPage(self._key)
        self.canv.addOutlineEntry(
            self.getPlainText(), self._key, level=self._level - 1, closed=False
        )


def heading(document: PdfDocument, text: str, level: int = 1) -> None:
    document._outline_counter += 1
    style = STYLES[f"h{min(level, 3)}"]
    document.story.append(
        _Outline(text, style, min(level, 3), f"h{document._outline_counter}")
    )


def para(document: PdfDocument, text: str, bold: bool = False) -> None:
    document.story.append(Paragraph(text, STYLES["bodyBold" if bold else "body"]))


def bullets(document: PdfDocument, items: list[str]) -> None:
    document.story.append(
        ListFlowable(
            [ListItem(Paragraph(item, STYLES["body"]), leftIndent=16) for item in items],
            bulletType="bullet",
            bulletFontName="Body",
            bulletFontSize=8,
            start="•",
            leftIndent=14,
        )
    )
    document.story.append(Spacer(1, 6))


def numbered(document: PdfDocument, items: list[str]) -> None:
    document.story.append(
        ListFlowable(
            [ListItem(Paragraph(item, STYLES["body"]), leftIndent=18) for item in items],
            bulletType="1",
            bulletFontName="Body",
            bulletFontSize=9.5,
            leftIndent=16,
        )
    )
    document.story.append(Spacer(1, 6))


def table(document: PdfDocument, headers: list[str], rows: list[list[str]],
          widths: list[float] | None = None) -> None:
    data = [[Paragraph(str(label), STYLES["cellHead"]) for label in headers]]
    data.extend(
        [[Paragraph(str(value), STYLES["cell"]) for value in row] for row in rows]
    )

    if widths:
        scale = CONTENT_WIDTH / sum(width * cm for width in widths)
        column_widths = [width * cm * scale for width in widths]
    else:
        column_widths = [CONTENT_WIDTH / len(headers)] * len(headers)

    built = Table(data, colWidths=column_widths, repeatRows=1, hAlign="LEFT")
    built.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("GRID", (0, 0), (-1, -1), 0.5, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F7FA")]),
            ]
        )
    )
    document.story.append(built)
    document.story.append(Spacer(1, 10))


def caption(document: PdfDocument, text: str) -> None:
    document.story.append(Paragraph(text, STYLES["caption"]))


def footer_note(document: PdfDocument, text: str) -> None:
    document.footer = text


def keep_together(document: PdfDocument, count: int) -> None:
    """Glue the last `count` flowables so a heading does not end a page alone."""
    tail = document.story[-count:]
    del document.story[-count:]
    document.story.append(KeepTogether(tail))
