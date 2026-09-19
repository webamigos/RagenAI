#!/usr/bin/env python3
"""
Build the demo corpus into `files/`.

    pip install openpyxl python-docx reportlab
    python3 scripts/demo-corpus/generate.py

Deterministic: the same inputs give byte-comparable content, so regenerating
after an edit produces a diff of what changed and nothing else. The generated
files are committed, because the point of this directory is that somebody
running a demo can upload them without installing Python.
"""

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import build_docx  # noqa: E402
import build_pdf  # noqa: E402
import build_xlsx  # noqa: E402

OUT = HERE / "files"

CORPUS = [
    ("katalog-produktow-2026.pdf", build_pdf.product_catalogue),
    ("umowa-serwisowa-sla.pdf", build_pdf.service_agreement),
    ("raport-roczny-2025.pdf", build_pdf.annual_report),
    ("employee-handbook-2026.pdf", build_pdf.employee_handbook),
    ("cennik-2026.xlsx", build_xlsx.price_list),
    ("sprzedaz-2025.xlsx", build_xlsx.sales_report),
    ("stany-magazynowe-2026-03.xlsx", build_xlsx.stock_report),
    ("budzet-marketingowy-2026.xlsx", build_xlsx.marketing_budget),
    ("umowa-ramowa-dostawy.docx", build_docx.framework_agreement),
    ("procedura-reklamacyjna.docx", build_docx.complaints_procedure),
    ("protokol-zarzadu-2026-02.docx", build_docx.board_minutes),
    ("faq-dzial-handlowy.docx", build_docx.sales_faq),
]


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, build in CORPUS:
        path = OUT / name
        build(str(path))
        print(f"  {name:<34} {path.stat().st_size / 1024:>7.1f} KB")
    print(f"\n{len(CORPUS)} files in {OUT}")


if __name__ == "__main__":
    main()
