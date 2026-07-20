// ============================================================
// CHECKS MODULE — rules engine berbasis data terstruktur Forms API.
// Semua cek di sini murni string/struktur matching. TIDAK ADA cek visual
// (bold/italic/warna/tema) karena Forms API memang tidak menyediakan data itu.
// ============================================================

const Checks = (() => {
  /** Bentuk objek "temuan" yang seragam untuk ditampilkan di tabel & PDF. */
  function buildFinding(rule, item) {
    return {
      section: rule.section || (item && item.title) || "-",
      pedoman_ref: rule.pedoman_ref || "-",
      message: rule.message_template,
      itemTitle: item ? item.title : null,
      severity: rule.severity || "wajib",
      ruleId: rule.id,
    };
  }

  function getAllText(formData) {
    return [
      formData?.info?.title || "",
      formData?.info?.description || "",
      ...(formData?.items || []).map((i) => `${i.title || ""} ${i.description || ""}`),
    ]
      .join(" ")
      .toLowerCase();
  }

  /** Cek keberadaan field/teks berdasarkan keyword. */
  function checkFieldPresence(formData, rule) {
    const allTexts = getAllText(formData);
    const found = rule.match_keywords.some((k) => allTexts.includes(k.toLowerCase()));
    return found ? null : buildFinding(rule);
  }

  /** Cek apakah field yang ditemukan sudah di-set required sesuai ekspektasi. */
  function checkRequired(formData, rule) {
    const items = formData?.items || [];
    const item = items.find((i) =>
      rule.match_keywords.some((k) => (i.title || "").toLowerCase().includes(k.toLowerCase()))
    );
    if (!item) return null; // ketiadaan field sudah ditangkap rule field_presence terpisah
    const isRequired = item.questionItem?.question?.required === true;
    return isRequired === rule.expected_required ? null : buildFinding(rule, item);
  }

  /** Urutan section: Identitas Responden harus sebelum Penutup. */
  function checkSectionOrder(formData) {
    const items = (formData?.items || []).filter((i) => i.title);
    const titles = items.map((i) => i.title.toLowerCase());

    const idxIdentitas = titles.findIndex(
      (t) => t.includes("identitas") || t.includes("nama lengkap")
    );
    const idxPenutup = titles.findIndex(
      (t) => t.includes("terima kasih") || t.includes("penutup")
    );

    const findings = [];

    if (idxIdentitas === -1) {
      findings.push(
        buildFinding({
          id: "section-order-identitas-missing",
          section: "Identitas Responden",
          severity: "wajib",
          pedoman_ref: "Struktur Urutan Section",
          message_template: "Section 'Identitas Responden' tidak terdeteksi pada form.",
        })
      );
    }

    if (idxPenutup !== -1 && idxIdentitas !== -1 && idxPenutup < idxIdentitas) {
      findings.push(
        buildFinding({
          id: "section-order-penutup-before-identitas",
          section: "Penutup",
          severity: "wajib",
          pedoman_ref: "Struktur Urutan Section",
          message_template:
            "Section 'Penutup' muncul sebelum 'Identitas Responden' — urutan tidak sesuai alur Pedoman.",
        })
      );
    }

    return findings;
  }

  /** Pertanyaan yang judulnya terindikasi "skala/skor/penilaian" harus pakai grid/scale, bukan free text. */
  function checkScaleUsesGrid(formData) {
    const findings = [];
    (formData?.items || []).forEach((i) => {
      const q = i.questionItem?.question;
      if (!q) return;
      const looksLikeScale = /skor|skala|penilaian/i.test(i.title || "");
      if (looksLikeScale && !q.rowQuestion && !q.scaleQuestion) {
        findings.push(
          buildFinding(
            {
              id: "scale-not-grid",
              section: i.title,
              severity: "disarankan",
              pedoman_ref: "Jenis Pertanyaan Sesuai Anjuran",
              message_template: `Pertanyaan '${i.title}' terindikasi skala penilaian tapi bukan tipe grid/scale.`,
            },
            i
          )
        );
      }
    });
    return findings;
  }

  /**
   * Jalankan seluruh rules.json + cek struktural tambahan terhadap formData.
   * @param {object} formData - hasil dari FormsApi.fetchForm
   * @param {object} rulesConfig - hasil parse rules.json ({ rules: [...] })
   * @returns {Array} daftar findings
   */
  function runAll(formData, rulesConfig) {
    const findings = [];

    (rulesConfig.rules || []).forEach((rule) => {
      let result = null;
      if (rule.type === "field_presence") {
        result = checkFieldPresence(formData, rule);
      } else if (rule.type === "required_check") {
        result = checkRequired(formData, rule);
      }
      if (Array.isArray(result)) {
        findings.push(...result);
      } else if (result) {
        findings.push(result);
      }
    });

    findings.push(...checkSectionOrder(formData));
    findings.push(...checkScaleUsesGrid(formData));

    return findings;
  }

  return {
    checkFieldPresence,
    checkRequired,
    checkSectionOrder,
    checkScaleUsesGrid,
    runAll,
    buildFinding,
  };
})();
