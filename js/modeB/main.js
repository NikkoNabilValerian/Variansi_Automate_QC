// ============================================================
// APP MODULE (Mode B) — menghubungkan PdfRender, OcrEngine, RulesEngineB ke UI.
// Fase 0-3: upload, render, OCR, field_presence. Belum ada style_check/annotator/pdfBuilder.
// ============================================================

(function () {
  const el = {
    fileInput: document.getElementById("fileInputB"),
    dropZone: document.getElementById("dropZoneB"),
    fileListInfo: document.getElementById("fileListInfoB"),
    btnRun: document.getElementById("btnRunB"),
    progressBox: document.getElementById("progressBoxB"),
    progressText: document.getElementById("progressTextB"),
    alertBox: document.getElementById("alertBoxB"),
    resultsCard: document.getElementById("resultsCardB"),
    summaryBar: document.getElementById("summaryBarB"),
    findingsTableBody: document.getElementById("findingsTableBodyB"),
    ocrTextPreview: document.getElementById("ocrTextPreviewB"),
    pagePreviewGrid: document.getElementById("pagePreviewGridB"),
  };

  let selectedFiles = [];
  let rulesConfig = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showAlert(message, type = "error") {
    el.alertBox.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    el.alertBox.classList.remove("hidden");
  }

  function clearAlert() {
    el.alertBox.innerHTML = "";
    el.alertBox.classList.add("hidden");
  }

  function setProgress(text) {
    if (text === null) {
      el.progressBox.classList.add("hidden");
      return;
    }
    el.progressBox.classList.remove("hidden");
    el.progressText.textContent = text;
  }

  function validateFiles(files) {
    const errors = [];
    files.forEach((f) => {
      if (!CONFIG_B.ACCEPTED_TYPES.includes(f.type)) {
        errors.push(`"${f.name}": tipe file tidak didukung (${f.type || "tidak dikenali"}).`);
      }
      const sizeMb = f.size / (1024 * 1024);
      if (sizeMb > CONFIG_B.MAX_FILE_SIZE_MB) {
        errors.push(`"${f.name}": ukuran ${sizeMb.toFixed(1)}MB melebihi batas ${CONFIG_B.MAX_FILE_SIZE_MB}MB.`);
      }
    });
    return errors;
  }

  function renderFileListInfo() {
    if (selectedFiles.length === 0) {
      el.fileListInfo.innerHTML = "";
      el.btnRun.disabled = true;
      return;
    }
    el.fileListInfo.innerHTML = selectedFiles
      .map((f) => `<div class="file-chip">📄 ${escapeHtml(f.name)} (${(f.size / 1024 / 1024).toFixed(1)}MB)</div>`)
      .join("");
    el.btnRun.disabled = false;
  }

  function handleFiles(fileListRaw) {
    clearAlert();
    const files = Array.from(fileListRaw);
    if (files.length === 0) return;

    const errors = validateFiles(files);
    if (errors.length > 0) {
      showAlert(errors.map(escapeHtml).join("<br>"), "error");
      return;
    }

    selectedFiles = files;
    renderFileListInfo();
  }

  async function loadRules() {
    const res = await fetch(CONFIG_B.RULES_PATH);
    if (!res.ok) throw new Error("Gagal memuat rules-mode-b.json");
    return res.json();
  }

  function renderPagePreviews(canvases) {
    el.pagePreviewGrid.innerHTML = "";
    canvases.forEach((canvas, idx) => {
      const wrapper = document.createElement("div");
      wrapper.className = "page-preview-item";
      const thumbCanvas = document.createElement("canvas");
      const scale = Math.min(1, 220 / canvas.width);
      thumbCanvas.width = canvas.width * scale;
      thumbCanvas.height = canvas.height * scale;
      const ctx = thumbCanvas.getContext("2d");
      ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      wrapper.appendChild(thumbCanvas);
      const label = document.createElement("div");
      label.className = "page-preview-label";
      label.textContent = `Halaman ${idx + 1}`;
      wrapper.appendChild(label);
      el.pagePreviewGrid.appendChild(wrapper);
    });
  }

  function renderResults(findings, ocrResults) {
    el.resultsCard.classList.remove("hidden");

    const wajibCount = findings.filter((f) => f.severity === "wajib").length;

    el.summaryBar.innerHTML = `
      <div class="summary-chip"><strong>${ocrResults.length}</strong>Halaman Dibaca</div>
      <div class="summary-chip"><strong>${findings.length}</strong>Total Temuan</div>
      <div class="summary-chip"><strong>${wajibCount}</strong>Wajib Diperbaiki</div>
    `;

    if (findings.length === 0) {
      el.findingsTableBody.innerHTML = `
        <tr><td colspan="5" style="text-align:center; color:var(--success); font-weight:600;">
          ✅ Tidak ada temuan field_presence. Semua keyword pedoman ditemukan pada hasil OCR.
        </td></tr>`;
    } else {
      el.findingsTableBody.innerHTML = findings
        .map(
          (f, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(f.section)}</td>
          <td>${escapeHtml(f.pedoman_ref)}</td>
          <td>${escapeHtml(f.message)}</td>
          <td><span class="badge badge-belum">Belum Diperbaiki</span></td>
        </tr>`
        )
        .join("");
    }

    // Preview teks OCR mentah (transparansi untuk user, supaya bisa cek kualitas OCR)
    el.ocrTextPreview.textContent = ocrResults
      .map((r) => `--- Halaman ${r.pageIndex + 1} ---\n${r.text.trim()}`)
      .join("\n\n");

    el.resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runPipeline() {
    if (selectedFiles.length === 0) return;
    clearAlert();
    el.resultsCard.classList.add("hidden");
    el.btnRun.disabled = true;

    try {
      if (!rulesConfig) {
        setProgress("Memuat rules...");
        rulesConfig = await loadRules();
      }

      setProgress("Membaca halaman (render PDF/gambar)...");
      const canvases = await PdfRender.renderFilesToCanvases(selectedFiles);
      renderPagePreviews(canvases);

      await OcrEngine.init((statusText) => setProgress(statusText));

      const ocrResults = await OcrEngine.recognizeAll(canvases, (pageIdx, total) => {
        setProgress(`Menjalankan OCR halaman ${pageIdx + 1} dari ${total}...`);
      });

      setProgress("Mengecek terhadap pedoman...");
      const findings = RulesEngineB.runFieldPresenceChecks(ocrResults, rulesConfig);

      renderResults(findings, ocrResults);
      setProgress(null);
    } catch (err) {
      console.error(err);
      showAlert(escapeHtml(err.message || String(err)), "error");
      setProgress(null);
    } finally {
      el.btnRun.disabled = false;
    }
  }

  function bindEvents() {
    el.fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

    el.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.dropZone.classList.add("dragover");
    });
    el.dropZone.addEventListener("dragleave", () => {
      el.dropZone.classList.remove("dragover");
    });
    el.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      el.dropZone.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });
    el.dropZone.addEventListener("click", () => el.fileInput.click());

    el.btnRun.addEventListener("click", runPipeline);
  }

  window.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    renderFileListInfo();
  });

  window.addEventListener("beforeunload", () => {
    OcrEngine.terminate();
  });
})();
