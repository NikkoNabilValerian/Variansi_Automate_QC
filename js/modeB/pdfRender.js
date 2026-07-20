// ============================================================
// PDF RENDER MODULE — ubah file upload (PDF atau gambar) jadi array <canvas>,
// satu canvas per halaman. Pakai pdf.js (Mozilla) untuk PDF; gambar langsung
// digambar ke satu canvas. Semua proses di browser, tidak ada upload ke server.
// ============================================================

const PdfRender = (() => {
  /**
   * Render satu File (PDF atau gambar) menjadi array canvas.
   * @param {File} file
   * @returns {Promise<HTMLCanvasElement[]>}
   */
  async function renderFileToCanvases(file) {
    if (file.type === "application/pdf") {
      return renderPdfToCanvases(file);
    }
    if (file.type.startsWith("image/")) {
      const canvas = await renderImageToCanvas(file);
      return [canvas];
    }
    throw new Error(`Tipe file tidak didukung: ${file.type || "(tidak dikenali)"}`);
  }

  /** Render semua file (multi-upload) jadi satu array canvas gabungan, urut sesuai file. */
  async function renderFilesToCanvases(fileList) {
    const allCanvases = [];
    for (const file of fileList) {
      const canvases = await renderFileToCanvases(file);
      allCanvases.push(...canvases);
    }
    return allCanvases;
  }

  async function renderImageToCanvas(file) {
    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas;
  }

  async function renderPdfToCanvases(file) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("pdf.js belum termuat. Cek koneksi internet / CDN pdf.js.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const canvases = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: CONFIG_B.PDF_RENDER_SCALE });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");

      await page.render({ canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
    }

    return canvases;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  return { renderFileToCanvases, renderFilesToCanvases };
})();
