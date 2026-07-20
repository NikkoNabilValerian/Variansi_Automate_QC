// ============================================================
// ANNOTATOR MODULE — gambar kotak merah + lingkaran nomor + callout kuning
// di atas canvas halaman, untuk temuan yang punya bbox (hasil style_check).
// Murni Canvas API, tidak ada library tambahan.
// ============================================================

const Annotator = (() => {
  const RED = "rgb(204,0,0)";
  const YELLOW_BG = "rgb(255, 247, 214)";
  const YELLOW_BORDER = "rgb(204,0,0)";

  function wrapTextCanvas(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  /** Gambar 1 kotak merah + lingkaran nomor di titik (x1, y0) kotak. */
  function drawBoxAndNumber(ctx, box, number) {
    const { x0, y0, x1, y1 } = box;

    ctx.strokeStyle = RED;
    ctx.lineWidth = 4;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    ctx.beginPath();
    ctx.fillStyle = RED;
    ctx.arc(x1, y0, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), x1, y0);
  }

  /** Gambar callout kuning (kotak catatan) di bawah bbox, dengan word-wrap manual. */
  function drawYellowCallout(ctx, x, yTop, title, desc, status, maxWidth) {
    const paddingX = 10;
    const paddingY = 8;
    const titleFontSize = 13;
    const bodyFontSize = 12;
    const lineHeight = 16;

    ctx.font = `bold ${titleFontSize}px sans-serif`;
    const titleLines = wrapTextCanvas(ctx, title, maxWidth - paddingX * 2);

    ctx.font = `${bodyFontSize}px sans-serif`;
    const descLines = wrapTextCanvas(ctx, desc, maxWidth - paddingX * 2);

    ctx.font = `bold ${bodyFontSize}px sans-serif`;
    const statusLines = wrapTextCanvas(ctx, `Status: ${status}`, maxWidth - paddingX * 2);

    const totalLines = titleLines.length + descLines.length + statusLines.length;
    const boxHeight = totalLines * lineHeight + paddingY * 2 + 6;

    ctx.fillStyle = YELLOW_BG;
    ctx.strokeStyle = YELLOW_BORDER;
    ctx.lineWidth = 2;
    ctx.fillRect(x, yTop, maxWidth, boxHeight);
    ctx.strokeRect(x, yTop, maxWidth, boxHeight);

    let cursorY = yTop + paddingY + titleFontSize;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = RED;
    ctx.font = `bold ${titleFontSize}px sans-serif`;
    titleLines.forEach((line) => {
      ctx.fillText(line, x + paddingX, cursorY);
      cursorY += lineHeight;
    });

    ctx.fillStyle = "rgb(60,60,60)";
    ctx.font = `${bodyFontSize}px sans-serif`;
    descLines.forEach((line) => {
      ctx.fillText(line, x + paddingX, cursorY);
      cursorY += lineHeight;
    });

    ctx.fillStyle = RED;
    ctx.font = `bold ${bodyFontSize}px sans-serif`;
    statusLines.forEach((line) => {
      ctx.fillText(line, x + paddingX, cursorY);
      cursorY += lineHeight;
    });

    return boxHeight;
  }

  /**
   * Jika canvas tidak cukup tinggi untuk callout tambahan, buat canvas baru yang lebih
   * tinggi dan copy isi canvas lama ke dalamnya (sama seperti "extend canvas" versi Python).
   */
  function extendCanvasHeight(canvas, extraHeight) {
    const newCanvas = document.createElement("canvas");
    newCanvas.width = canvas.width;
    newCanvas.height = canvas.height + extraHeight;
    const ctx = newCanvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
    ctx.drawImage(canvas, 0, 0);
    return newCanvas;
  }

  /**
   * Terapkan seluruh findings (yang punya bbox) ke satu canvas halaman, mengembalikan
   * canvas baru (kemungkinan lebih tinggi jika callout meluber ke bawah halaman).
   * @param {HTMLCanvasElement} originalCanvas
   * @param {Array} findingsOnPage - findings dengan bbox, sudah punya nomor urut global
   * @returns {HTMLCanvasElement} canvas hasil anotasi
   */
  function annotatePage(originalCanvas, findingsOnPage) {
    let canvas = document.createElement("canvas");
    canvas.width = originalCanvas.width;
    canvas.height = originalCanvas.height;
    canvas.getContext("2d").drawImage(originalCanvas, 0, 0);

    // Urutkan dari atas ke bawah supaya callout tidak saling tumpang tindih secara acak
    const sorted = [...findingsOnPage].sort((a, b) => a.bbox.y0 - b.bbox.y0);

    sorted.forEach((finding) => {
      let ctx = canvas.getContext("2d");
      const box = finding.bbox;
      const calloutWidth = Math.min(420, canvas.width - box.x0 - 20);
      const calloutX = box.x0;
      let calloutY = box.y1 + 14;

      // Ukur dulu tinggi callout yang dibutuhkan (pakai context sementara untuk font metrics)
      const measureCtx = canvas.getContext("2d");
      measureCtx.font = "bold 13px sans-serif";
      const titleLinesCount = wrapTextCanvas(
        measureCtx,
        finding.calloutTitle,
        calloutWidth - 20
      ).length;
      measureCtx.font = "12px sans-serif";
      const descLinesCount = wrapTextCanvas(measureCtx, finding.message, calloutWidth - 20).length;
      const statusLinesCount = 1;
      const estimatedCalloutHeight =
        (titleLinesCount + descLinesCount + statusLinesCount) * 16 + 16 + 6;

      if (calloutY + estimatedCalloutHeight > canvas.height) {
        const needed = calloutY + estimatedCalloutHeight - canvas.height + 20;
        canvas = extendCanvasHeight(canvas, needed);
        ctx = canvas.getContext("2d");
      }

      drawBoxAndNumber(ctx, box, finding.number);
      drawYellowCallout(
        ctx,
        calloutX,
        calloutY,
        finding.calloutTitle,
        finding.message,
        "BELUM DIPERBAIKI",
        calloutWidth
      );
    });

    return canvas;
  }

  return { annotatePage, drawBoxAndNumber, drawYellowCallout, extendCanvasHeight };
})();
