// ============================================================
// PDF REPORT MODULE — cover ringkasan + tabel temuan, pakai pdf-lib.
// TIDAK ADA canvas/anotasi gambar sama sekali (Mode A tidak punya screenshot).
// ============================================================

const PdfReport = (() => {
  const PAGE_W = 595.28; // A4 pt
  const PAGE_H = 841.89;
  const MARGIN = 40;

  const COL_WIDTHS = {
    no: 28,
    section: 110,
    pedoman: 130,
    temuan: 200,
    status: 65,
  };

  function wrapText(text, font, size, maxWidth) {
    const words = String(text || "-").split(/\s+/);
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : ["-"];
  }

  async function generate({ formTitle, formId, checkedAt, findings }) {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ---------- COVER PAGE ----------
    const cover = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 120;

    cover.drawText("Laporan QC Otomatis — Google Form", {
      x: MARGIN,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= 30;
    cover.drawText("Mode A — Google Forms API (Non-AI, Rule-Based)", {
      x: MARGIN,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.45),
    });

    y -= 60;
    const metaLines = [
      ["Judul Form", formTitle || "-"],
      ["Form ID", formId || "-"],
      ["Waktu Pemeriksaan", checkedAt],
      ["Jumlah Temuan", String(findings.length)],
      ["Status Keseluruhan", findings.length === 0 ? "LOLOS (tidak ada temuan)" : "ADA TEMUAN — perlu diperbaiki"],
    ];
    metaLines.forEach(([label, value]) => {
      cover.drawText(`${label}`, { x: MARGIN, y, size: 11, font: fontBold, color: rgb(0.15, 0.15, 0.2) });
      cover.drawText(`${value}`, { x: MARGIN + 160, y, size: 11, font: fontRegular, color: rgb(0.2, 0.2, 0.25) });
      y -= 22;
    });

    y -= 20;
    cover.drawText(
      "Catatan: Mode A hanya memeriksa kelengkapan field, status wajib-diisi, urutan section,",
      { x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.45, 0.45, 0.5) }
    );
    y -= 13;
    cover.drawText(
      "dan tipe pertanyaan — berdasarkan data terstruktur dari Google Forms API. Pemeriksaan",
      { x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.45, 0.45, 0.5) }
    );
    y -= 13;
    cover.drawText(
      "tampilan visual (bold/italic/header/tema) TIDAK dicakup karena API tidak menyediakan data itu.",
      { x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.45, 0.45, 0.5) }
    );

    // ---------- FINDINGS TABLE PAGE(S) ----------
    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let cursorY = PAGE_H - MARGIN;
    const rowFontSize = 8.5;
    const lineHeight = 11;
    const cellPad = 4;

    function drawHeaderRow(p, yPos) {
      let x = MARGIN;
      const headers = [
        ["No", COL_WIDTHS.no],
        ["Item/Section", COL_WIDTHS.section],
        ["Pedoman yang Dilanggar", COL_WIDTHS.pedoman],
        ["Temuan", COL_WIDTHS.temuan],
        ["Status", COL_WIDTHS.status],
      ];
      p.drawRectangle({
        x: MARGIN,
        y: yPos - 16,
        width: PAGE_W - MARGIN * 2,
        height: 16,
        color: rgb(0.9, 0.92, 0.96),
      });
      headers.forEach(([label, w]) => {
        p.drawText(label, { x: x + cellPad, y: yPos - 12, size: 9, font: fontBold, color: rgb(0.1, 0.1, 0.15) });
        x += w;
      });
      return yPos - 16;
    }

    cursorY = drawHeaderRow(page, cursorY);

    const rows = findings.length
      ? findings
      : [{ section: "-", pedoman_ref: "-", message: "Tidak ada temuan. Form sudah sesuai rule Mode A.", severity: "ok" }];

    rows.forEach((f, idx) => {
      const noText = findings.length ? String(idx + 1) : "-";
      const sectionLines = wrapText(f.section, fontRegular, rowFontSize, COL_WIDTHS.section - cellPad * 2);
      const pedomanLines = wrapText(f.pedoman_ref, fontRegular, rowFontSize, COL_WIDTHS.pedoman - cellPad * 2);
      const temuanLines = wrapText(f.message, fontRegular, rowFontSize, COL_WIDTHS.temuan - cellPad * 2);
      const statusText = findings.length ? "Belum Diperbaiki" : "OK";

      const rowLineCount = Math.max(sectionLines.length, pedomanLines.length, temuanLines.length, 1);
      const rowHeight = rowLineCount * lineHeight + cellPad * 2;

      if (cursorY - rowHeight < MARGIN) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        cursorY = PAGE_H - MARGIN;
        cursorY = drawHeaderRow(page, cursorY);
      }

      const rowTop = cursorY;
      const rowBottom = rowTop - rowHeight;

      page.drawRectangle({
        x: MARGIN,
        y: rowBottom,
        width: PAGE_W - MARGIN * 2,
        height: rowHeight,
        borderColor: rgb(0.85, 0.86, 0.9),
        borderWidth: 0.5,
      });

      let colX = MARGIN;
      const cols = [
        { lines: [noText], w: COL_WIDTHS.no },
        { lines: sectionLines, w: COL_WIDTHS.section },
        { lines: pedomanLines, w: COL_WIDTHS.pedoman },
        { lines: temuanLines, w: COL_WIDTHS.temuan },
        { lines: [statusText], w: COL_WIDTHS.status },
      ];

      cols.forEach((col) => {
        let textY = rowTop - cellPad - 8;
        col.lines.forEach((line) => {
          page.drawText(line, {
            x: colX + cellPad,
            y: textY,
            size: rowFontSize,
            font: fontRegular,
            color: rgb(0.15, 0.15, 0.2),
          });
          textY -= lineHeight;
        });
        colX += col.w;
      });

      cursorY = rowBottom;
    });

    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  }

  function triggerDownload(pdfBytes, filename) {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return { generate, triggerDownload };
})();
