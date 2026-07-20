// ============================================================
// PDF BUILDER MODULE (Mode B) — cover ringkasan + halaman form beranotasi.
// Beda dengan Mode A: di sini ADA gambar (screenshot form + anotasi kotak merah),
// karena Mode B memang punya gambar untuk dianotasi.
// ============================================================

const PdfBuilderB = (() => {
  const MARGIN = 40;

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

  /**
   * @param {object} opts
   * @param {string} opts.checkedAt
   * @param {Array} opts.findings - findings yang SUDAH melewati review user (accepted only),
   *   masing-masing punya { number?, pageIndex, bbox, message, pedoman_ref, section, type, confidence }
   * @param {number} opts.totalFieldFindings - jumlah temuan field_presence (tanpa bbox, cuma tabel)
   * @param {HTMLCanvasElement[]} opts.annotatedCanvases - hasil Annotator.annotatePage per halaman
   *   (index harus sejajar dengan pageIndex asli)
   */
  async function generate({ checkedAt, findings, annotatedCanvases }) {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fieldFindings = findings.filter((f) => f.type === "field_presence");
    const styleFindings = findings.filter((f) => f.type === "style_check");

    // ---------- COVER PAGE ----------
    const pageWCover = 595.28;
    const pageHCover = 841.89;
    const cover = pdfDoc.addPage([pageWCover, pageHCover]);
    let y = pageHCover - 100;

    cover.drawText("Laporan QC Otomatis — Google Form", {
      x: MARGIN,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= 26;
    cover.drawText("Mode B — Upload Screenshot/PDF (OCR + Heuristik Citra, Non-AI)", {
      x: MARGIN,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.45),
    });

    y -= 50;
    const metaLines = [
      ["Waktu Pemeriksaan", checkedAt],
      ["Jumlah Halaman", String(annotatedCanvases.length)],
      ["Total Temuan", String(findings.length)],
      ["  - Kelengkapan Field", String(fieldFindings.length)],
      ["  - Format Bold/Italic", String(styleFindings.length)],
    ];
    metaLines.forEach(([label, value]) => {
      cover.drawText(label, { x: MARGIN, y, size: 11, font: fontBold, color: rgb(0.15, 0.15, 0.2) });
      cover.drawText(value, { x: MARGIN + 190, y, size: 11, font: fontRegular, color: rgb(0.2, 0.2, 0.25) });
      y -= 20;
    });

    y -= 16;
    const notes = [
      "Legenda anotasi pada halaman berikut: kotak merah = area temuan, lingkaran nomor",
      "merah = urutan temuan, kotak kuning = judul temuan + penjelasan + status.",
      "",
      "Catatan keterbatasan: deteksi bold/italic bersifat heuristik (best-effort), sudah",
      "melalui tahap review manual sebelum PDF ini dibuat. Kelengkapan field murni",
      "pencarian teks hasil OCR — periksa juga preview teks OCR mentah di halaman web",
      "jika ada keraguan hasil pembacaan.",
    ];
    notes.forEach((line) => {
      cover.drawText(line, { x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.45, 0.45, 0.5) });
      y -= 13;
    });

    // ---------- TABEL TEMUAN FIELD_PRESENCE (tidak ada bbox untuk dianotasi di gambar) ----------
    if (fieldFindings.length > 0) {
      y -= 16;
      cover.drawText("Temuan Kelengkapan Field (tanpa anotasi visual):", {
        x: MARGIN,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.15),
      });
      y -= 18;

      fieldFindings.forEach((f, idx) => {
        const lines = wrapText(`${idx + 1}. ${f.message}`, fontRegular, 9, pageWCover - MARGIN * 2);
        lines.forEach((line) => {
          if (y < MARGIN) return; // (penyederhanaan: cukup jarang overflow di cover)
          cover.drawText(line, { x: MARGIN, y, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.25) });
          y -= 12;
        });
      });
    }

    // ---------- HALAMAN FORM BERANOTASI ----------
    for (let i = 0; i < annotatedCanvases.length; i++) {
      const canvas = annotatedCanvases[i];
      const pngDataUrl = canvas.toDataURL("image/png");
      const pngBytes = dataUrlToUint8Array(pngDataUrl);
      const pngImage = await pdfDoc.embedPng(pngBytes);

      // Skala gambar supaya muat di halaman A4 (atau lebih besar kalau canvas di-extend)
      const maxW = pageWCover - MARGIN * 2;
      const scale = Math.min(1, maxW / canvas.width);
      const drawW = canvas.width * scale;
      const drawH = canvas.height * scale;

      const page = pdfDoc.addPage([pageWCover, Math.max(pageHCover, drawH + MARGIN * 2)]);
      const pageH = page.getHeight();

      page.drawImage(pngImage, {
        x: MARGIN,
        y: pageH - MARGIN - drawH,
        width: drawW,
        height: drawH,
      });

      page.drawText(`Halaman ${i + 1} dari ${annotatedCanvases.length}`, {
        x: MARGIN,
        y: 16,
        size: 8,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.55),
      });
    }

    return pdfDoc.save();
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
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
