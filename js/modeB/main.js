// ============================================================
// APP MODULE (Mode B) — Fase 4: menghubungkan PdfRender, OcrEngine, RulesEngineB,
// StyleHeuristics, Annotator, PdfBuilderB ke UI. Termasuk layar review manusia
// (accept/reject) sebelum PDF final dibuat — sesuai prinsip desain Mode B.
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
    reviewList: document.getElementById("reviewListB"),
    ocrTextPreview: document.getElementById("ocrTextPreviewB"),
    pagePreviewGrid: document.getElementById("pagePreviewGridB"),
    btnGeneratePdf: document.getElementById("btnGeneratePdfB"),
    pdfGenAlert: document.getElementById("pdfGenAlertB"),
  };

  let selectedFiles = [];
  let rulesConfig = null;

  // State hasil pipeline, dipakai ulang saat user accept/reject temuan
  let state = {
    canvases: [],
    ocrResults: [],
    findings: [], // semua findings (accepted: true/false per item)
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showAlert(target, message, type = "error") {
    target.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    target.classList.remove("hidden");
  }
  function clearAlert(target) {
    target.innerHTML = "";
    target.classList.add("hidden");
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
    clearAlert(el.alertBox);
    const files = Array.from(fileListRaw);
    if (files.length === 0) return;

    const errors = validateFiles(files);
    if (errors.length > 0) {
      showAlert(el.alertBox, errors.map(escapeHtml).join("<br>"), "error");
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

  /** Judul singkat callout untuk anotasi, disesuaikan dengan tipe rule. */
  function shortCalloutTitle(finding) {
    if (finding.type === "style_check") {
      if (/bold/i.test(finding.ruleId)) return "JUDUL SECTION TIDAK BOLD";
      if (/italic/i.test(finding.ruleId)) return "DESKRIPSI SECTION BELUM ITALIC";
      return "FORMAT TIDAK SESUAI PEDOMAN";
    }
    return "KELENGKAPAN FIELD";
  }

  /** Urutkan: confidence rendah dulu (butuh lebih teliti direview), lalu per halaman. */
  function sortForReview(findings) {
    return [...findings].sort((a, b) => {
      const ca = a.confidence ?? 1;
      const cb = b.confidence ?? 1;
      if (ca !== cb) return ca - cb;
      return (a.pageIndex ?? -1) - (b.pageIndex ?? -1);
    });
  }

  function renderReviewList() {
    const sorted = sortForReview(state.findings);

    if (sorted.length === 0) {
      el.reviewList.innerHTML = `
        <div class="alert alert-info">
          ✅ Tidak ada temuan sama sekali (field_presence maupun style_check).
        </div>`;
      return;
    }

    el.reviewList.innerHTML = sorted
      .map((f) => {
        const confBadge =
          f.confidence != null
            ? `<span class="confidence-badge ${f.confidence < 0.5 ? "conf-low" : "conf-ok"}">Keyakinan: ${Math.round(f.confidence * 100)}%</span>`
            : "";
        const pageLabel = f.pageIndex != null ? `Halaman ${f.pageIndex + 1}` : "-";
        return `
        <div class="review-item ${f.accepted ? "" : "rejected"}" data-index="${f._idx}">
          <label class="review-checkbox">
            <input type="checkbox" ${f.accepted ? "checked" : ""} data-toggle-index="${f._idx}" />
          </label>
          <div class="review-body">
            <div class="review-top-row">
              <span class="badge badge-belum">${escapeHtml(f.type === "style_check" ? "Format" : "Kelengkapan")}</span>
              <span class="review-page">${pageLabel}</span>
              ${confBadge}
            </div>
            <div class="review-message">${escapeHtml(f.message)}</div>
            <div class="review-ref">${escapeHtml(f.pedoman_ref)}</div>
          </div>
        </div>`;
      })
      .join("");

    // Bind checkbox toggle
    el.reviewList.querySelectorAll("input[data-toggle-index]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const idx = Number(e.target.getAttribute("data-toggle-index"));
        const finding = state.findings.find((f) => f._idx === idx);
        if (finding) finding.accepted = e.target.checked;
        e.target.closest(".review-item").classList.toggle("rejected", !e.target.checked);
        updateSummary();
      });
    });
  }

  function updateSummary() {
    const accepted = state.findings.filter((f) => f.accepted);
    const wajibCount = accepted.filter((f) => f.severity === "wajib").length;

    el.summaryBar.innerHTML = `
      <div class="summary-chip"><strong>${state.ocrResults.length}</strong>Halaman Dibaca</div>
      <div class="summary-chip"><strong>${state.findings.length}</strong>Total Temuan Otomatis</div>
      <div class="summary-chip"><strong>${accepted.length}</strong>Diterima (masuk PDF)</div>
      <div class="summary-chip"><strong>${wajibCount}</strong>Wajib Diperbaiki</div>
    `;
  }

  function renderResults() {
    el.resultsCard.classList.remove("hidden");
    updateSummary();
    renderReviewList();

    el.ocrTextPreview.textContent = state.ocrResults
      .map((r) => `--- Halaman ${r.pageIndex + 1} ---\n${r.text.trim()}`)
      .join("\n\n");

    el.resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runPipeline() {
    if (selectedFiles.length === 0) return;
    clearAlert(el.alertBox);
    clearAlert(el.pdfGenAlert);
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

      setProgress("Mengecek kelengkapan field & format (bold/italic)...");
      const findings = RulesEngineB.runAll(ocrResults, canvases, rulesConfig);

      // Default: findings dengan confidence tinggi (atau field_presence tanpa confidence)
      // otomatis tercentang; confidence rendah dibiarkan tidak tercentang supaya user lebih teliti.
      findings.forEach((f, idx) => {
        f._idx = idx;
        f.accepted = f.confidence == null ? true : f.confidence >= 0.5;
      });

      state = { canvases, ocrResults, findings };

      renderResults();
      setProgress(null);
    } catch (err) {
      console.error(err);
      showAlert(el.alertBox, escapeHtml(err.message || String(err)), "error");
      setProgress(null);
    } finally {
      el.btnRun.disabled = false;
    }
  }

  async function generateAnnotatedPdf() {
    clearAlert(el.pdfGenAlert);
    const accepted = state.findings.filter((f) => f.accepted);

    if (accepted.length === 0) {
      showAlert(
        el.pdfGenAlert,
        "Tidak ada temuan yang diterima. PDF akan tetap dibuat tanpa anotasi (form dianggap sudah sesuai berdasarkan temuan otomatis).",
        "warning"
      );
    }

    el.btnGeneratePdf.disabled = true;
    el.btnGeneratePdf.textContent = "Membuat PDF...";

    try {
      // Beri nomor urut global HANYA untuk temuan yang punya bbox (style_check) — itu yang dianotasi
      const styleAccepted = accepted.filter((f) => f.bbox && f.pageIndex != null);
      styleAccepted.forEach((f, i) => {
        f.number = i + 1;
        f.calloutTitle = `TEMUAN ${f.number}: ${shortCalloutTitle(f)}`;
      });

      const annotatedCanvases = state.canvases.map((canvas, pageIndex) => {
        const findingsOnPage = styleAccepted.filter((f) => f.pageIndex === pageIndex);
        if (findingsOnPage.length === 0) return canvas;
        return Annotator.annotatePage(canvas, findingsOnPage);
      });

      const pdfBytes = await PdfBuilderB.generate({
        checkedAt: new Date().toLocaleString("id-ID"),
        findings: accepted,
        annotatedCanvases,
      });

      PdfBuilderB.triggerDownload(pdfBytes, `QC_ModeB_${Date.now()}.pdf`);
    } catch (err) {
      console.error(err);
      showAlert(el.pdfGenAlert, `Gagal membuat PDF: ${escapeHtml(err.message)}`, "error");
    } finally {
      el.btnGeneratePdf.disabled = false;
      el.btnGeneratePdf.textContent = "Generate & Download PDF Hasil QC";
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
    el.btnGeneratePdf.addEventListener("click", generateAnnotatedPdf);
  }

  window.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    renderFileListInfo();
  });

  window.addEventListener("beforeunload", () => {
    OcrEngine.terminate();
  });
})();
