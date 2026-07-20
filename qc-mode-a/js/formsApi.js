// ============================================================
// FORMS API MODULE — ekstrak Form ID dari link & fetch struktur form
// ============================================================

const FormsApi = (() => {
  /**
   * Ekstrak Form ID dari berbagai bentuk link Google Form.
   * Mendukung: /forms/d/<id>/edit, /forms/d/<id>/viewform, /forms/d/e/<id>/viewform (form publik)
   * Untuk link publik (/d/e/...) itu bukan formId asli yang bisa dipakai API —
   * kita tetap coba ambil, tapi beri catatan ke user kalau gagal.
   */
  function extractFormId(url) {
    if (!url || typeof url !== "string") return null;

    // Bentuk editor: /forms/d/<FORM_ID>/edit atau /forms/d/<FORM_ID>/...
    let match = url.match(/\/forms\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1] && match[1] !== "e") {
      return match[1];
    }

    // Bentuk publik: /forms/d/e/<PUBLISHED_ID>/viewform — TIDAK sama dengan formId asli.
    const publicMatch = url.match(/\/forms\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (publicMatch) {
      return { publicOnly: true, publishedId: publicMatch[1] };
    }

    return null;
  }

  class FormsApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "FormsApiError";
      this.status = status;
    }
  }

  /**
   * Ambil struktur form dari Forms API.
   * @param {string} formId
   * @param {string} accessToken
   * @returns {Promise<object>} form JSON
   * @throws {FormsApiError}
   */
  async function fetchForm(formId, accessToken) {
    if (!accessToken) {
      throw new FormsApiError(
        "Belum login / token tidak ada. Silakan login dengan Google terlebih dahulu.",
        401
      );
    }

    let res;
    try {
      res = await fetch(`${CONFIG.FORMS_API_BASE}/${formId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (networkErr) {
      throw new FormsApiError(
        "Gagal menghubungi Google Forms API. Cek koneksi internet Anda.",
        0
      );
    }

    if (res.ok) {
      return res.json();
    }

    switch (res.status) {
      case 401:
        throw new FormsApiError(
          "Sesi login sudah kedaluwarsa (token expired ±1 jam). Silakan login ulang.",
          401
        );
      case 403:
        throw new FormsApiError(
          "Anda tidak punya akses (Editor/Viewer) ke form ini. Mode A hanya bisa dipakai oleh pemilik/kolaborator form.",
          403
        );
      case 404:
        throw new FormsApiError(
          "Form tidak ditemukan. Cek kembali link/Form ID — pastikan ini link editor (bukan link publik 'viewform' hasil publish).",
          404
        );
      default:
        throw new FormsApiError(`Gagal mengambil data form (status ${res.status}).`, res.status);
    }
  }

  return { extractFormId, fetchForm, FormsApiError };
})();
