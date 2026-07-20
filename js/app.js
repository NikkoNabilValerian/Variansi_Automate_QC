// ============================================================
// APP MODULE — menghubungkan Auth, FormsApi, Checks, PdfReport ke UI.
// ============================================================

(function () {
  const el = {
    statusDot: document.getElementById("statusDot"),
    statusText: document.getElementById("statusText"),
    btnLogin: document.getElementById("btnLogin"),
    btnLogout: document.getElementById("btnLogout"),
    formLinkInput: document.getElementById("formLinkInput"),
    btnCheck: document.getElementById("btnCheck"),
    checkAlert: document.getElementById("checkAlert"),
    resultsCard: document.getElementById("resultsCard"),
    formMeta: document.getElementById("formMeta"),
    summaryBar: document.getElementById("summaryBar"),
    findingsTableBody: document.getElementById("findingsTableBody"),
    btnDownloadPdf: document.getElementById("btnDownloadPdf"),
    configWarning: document.getElementById("configWarning"),
  };

  let lastFormData = null;
  let lastFindings = null;
  let lastFormId = null;
  let rulesConfig = null;

  function setLoggedInUI(loggedIn) {
    el.statusDot.classList.toggle("online", loggedIn);
    el.statusText.textContent = loggedIn
      ? "Sudah login — siap mengecek form."
      : "Belum login.";
    el.btnLogin.classList.toggle("hidden", loggedIn);
    el.btnLogout.classList.toggle("hidden", !loggedIn);
    el.btnCheck.disabled = !loggedIn;
  }

  function showAlert(container, message, type = "error") {
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    container.classList.remove("hidden");
  }

  function clearAlert(container) {
    container.innerHTML = "";
    container.classList.add("hidden");
  }

  async function loadRules() {
    const res = await fetch(CONFIG.RULES_PATH);
    if (!res.ok) throw new Error("Gagal memuat rules.json");
    return res.json();
  }

  function renderResults(formData, findings, formId) {
    el.resultsCard.classList.remove("hidden");

    el.formMeta.innerHTML = `
      <div class="form-meta"><strong>Judul Form:</strong> ${escapeHtml(formData.info?.title || "-")}</div>
      <div class="form-meta"><strong>Form ID:</strong> ${escapeHtml(formId)}</div>
    `;

    const wajibCount = findings.filter((f) => f.severity === "wajib").length;
    const disarankanCount = findings.filter((f) => f.severity === "disarankan").length;

    el.summaryBar.innerHTML = `
      <div class="summary-chip"><strong>${findings.length}</strong>Total Temuan</div>
      <div class="summary-chip"><strong>${wajibCount}</strong>Wajib Diperbaiki</div>
      <div class="summary-chip"><strong>${disarankanCount}</strong>Disarankan</div>
    `;

    if (findings.length === 0) {
      el.findingsTableBody.innerHTML = `
        <tr><td colspan="5" style="text-align:center; color:var(--success); font-weight:600;">
          ✅ Tidak ada temuan. Form sudah sesuai rule Mode A.
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

    el.resultsCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function runCheck() {
    clearAlert(el.checkAlert);
    el.resultsCard.classList.add("hidden");

    const url = el.formLinkInput.value.trim();
    if (!url) {
      showAlert(el.checkAlert, "Paste link Google Form terlebih dahulu.", "warning");
      return;
    }

    const extracted = FormsApi.extractFormId(url);
    if (!extracted) {
      showAlert(
        el.checkAlert,
        "Tidak bisa menemukan Form ID dari link tersebut. Pastikan ini link editor Google Form (mengandung <code>/forms/d/&lt;ID&gt;/edit</code>).",
        "error"
      );
      return;
    }
    if (typeof extracted === "object" && extracted.publicOnly) {
      showAlert(
        el.checkAlert,
        "Link ini adalah link publik hasil publish (<code>/forms/d/e/...</code>), bukan link editor. Mode A butuh link <strong>editor</strong> (buka form di Google Forms lalu salin URL address bar saat mode edit).",
        "error"
      );
      return;
    }

    const formId = extracted;

    el.btnCheck.disabled = true;
    el.btnCheck.innerHTML = `<span class="spinner"></span>Memeriksa...`;

    try {
      if (!rulesConfig) {
        rulesConfig = await loadRules();
      }

      const formData = await FormsApi.fetchForm(formId, Auth.getToken());
      const findings = Checks.runAll(formData, rulesConfig);

      lastFormData = formData;
      lastFindings = findings;
      lastFormId = formId;

      renderResults(formData, findings, formId);
    } catch (err) {
      if (err instanceof FormsApi.FormsApiError && err.status === 401) {
        showAlert(
          el.checkAlert,
          "Sesi login sudah kedaluwarsa. Silakan klik tombol Login lagi, lalu ulangi pengecekan.",
          "error"
        );
        setLoggedInUI(false);
      } else {
        showAlert(el.checkAlert, escapeHtml(err.message || String(err)), "error");
      }
    } finally {
      el.btnCheck.disabled = !Auth.isLoggedIn();
      el.btnCheck.textContent = "Cek Form";
    }
  }

  async function downloadPdf() {
    if (!lastFormData || !lastFindings) return;
    el.btnDownloadPdf.disabled = true;
    el.btnDownloadPdf.textContent = "Membuat PDF...";
    try {
      const pdfBytes = await PdfReport.generate({
        formTitle: lastFormData.info?.title,
        formId: lastFormId,
        checkedAt: new Date().toLocaleString("id-ID"),
        findings: lastFindings,
      });
      const safeTitle = (lastFormData.info?.title || "form").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
      PdfReport.triggerDownload(pdfBytes, `QC_ModeA_${safeTitle}.pdf`);
    } catch (err) {
      showAlert(el.checkAlert, `Gagal membuat PDF: ${escapeHtml(err.message)}`, "error");
    } finally {
      el.btnDownloadPdf.disabled = false;
      el.btnDownloadPdf.textContent = "Download PDF Laporan";
    }
  }

  function initAuth() {
    try {
      Auth.init(
        (token) => {
          setLoggedInUI(true);
        },
        (err) => {
          console.error("Login error:", err);
          showAlert(el.checkAlert, "Login gagal atau dibatalkan. Coba lagi.", "error");
        }
      );
    } catch (e) {
      showAlert(
        el.checkAlert,
        "Gagal inisialisasi Google Identity Services. Cek koneksi internet dan reload halaman.",
        "error"
      );
      console.error(e);
    }
  }

  function checkConfig() {
    if (CONFIG.CLIENT_ID.includes("GANTI_DENGAN_CLIENT_ID_ANDA")) {
      el.configWarning.classList.remove("hidden");
      el.btnLogin.disabled = true;
    }
  }

  function bindEvents() {
    el.btnLogin.addEventListener("click", () => Auth.login());
    el.btnLogout.addEventListener("click", () => {
      Auth.logout();
      setLoggedInUI(false);
      el.resultsCard.classList.add("hidden");
    });
    el.btnCheck.addEventListener("click", runCheck);
    el.btnDownloadPdf.addEventListener("click", downloadPdf);
    el.formLinkInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runCheck();
    });
  }

  window.addEventListener("DOMContentLoaded", () => {
    checkConfig();
    bindEvents();
    setLoggedInUI(false);
    // GIS script has `defer`, jadi kita init setelah window load untuk mastikan `google` sudah ada.
    window.addEventListener("load", initAuth);
  });
})();
