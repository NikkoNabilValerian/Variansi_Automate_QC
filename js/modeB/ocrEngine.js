// ============================================================
// OCR ENGINE MODULE — wrapper Tesseract.js. Jalan di browser (WASM),
// traineddata bahasa di-load dari CDN saat runtime (bukan disimpan di repo).
// Tidak ada AI/ML model — OCR klasik berbasis pengenalan pola karakter.
// ============================================================

const OcrEngine = (() => {
  let worker = null;

  /**
   * Inisialisasi Tesseract worker sekali saja (dipakai ulang untuk semua halaman).
   * @param {function(string):void} onProgressLog - callback teks status singkat
   */
  async function init(onProgressLog) {
    if (typeof Tesseract === "undefined") {
      throw new Error("Tesseract.js belum termuat. Cek koneksi internet / CDN Tesseract.js.");
    }
    if (worker) return worker;

    onProgressLog && onProgressLog("Menyiapkan mesin OCR...");

    worker = await Tesseract.createWorker(CONFIG_B.OCR_LANGUAGES, 1, {
      logger: (m) => {
        if (!onProgressLog) return;
        if (m.status === "recognizing text") {
          onProgressLog(`Membaca teks... ${Math.round((m.progress || 0) * 100)}%`);
        } else if (m.status) {
          onProgressLog(m.status);
        }
      },
    });

    return worker;
  }

  /**
   * Jalankan OCR pada satu canvas halaman.
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<{text: string, words: Array, lines: Array}>} teks penuh + kata & baris per bounding box
   */
  async function recognizeCanvas(canvas) {
    if (!worker) {
      throw new Error("OcrEngine belum di-init. Panggil OcrEngine.init() dulu.");
    }
    const { data } = await worker.recognize(canvas);

    const words = (data.words || []).map((w) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox, // { x0, y0, x1, y1 }
    }));

    // 'lines' dibutuhkan untuk style_check (bold/italic dinilai per baris, bukan per kata,
    // supaya heuristik ink density/slant lebih stabil).
    const lines = (data.lines || []).map((l) => ({
      text: l.text,
      confidence: l.confidence,
      bbox: l.bbox,
    }));

    return { text: data.text || "", words, lines };
  }

  /**
   * Jalankan OCR pada beberapa canvas (multi-halaman) sekaligus.
   * @param {HTMLCanvasElement[]} canvases
   * @param {function(number, number):void} onPageProgress - (pageIndex, totalPages)
   * @returns {Promise<Array<{pageIndex:number, text:string, words:Array}>>}
   */
  async function recognizeAll(canvases, onPageProgress) {
    const results = [];
    for (let i = 0; i < canvases.length; i++) {
      onPageProgress && onPageProgress(i, canvases.length);
      const result = await recognizeCanvas(canvases[i]);
      results.push({ pageIndex: i, ...result });
    }
    return results;
  }

  async function terminate() {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  }

  return { init, recognizeCanvas, recognizeAll, terminate };
})();
