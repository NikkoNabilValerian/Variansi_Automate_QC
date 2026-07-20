// ============================================================
// RULES ENGINE MODULE (Mode B) — Fase 0-3: hanya tipe 'field_presence'.
// Tipe 'style_check' dan 'image_region_check' menyusul di fase berikutnya.
// Pencocokan pakai fuzzy match (Levenshtein distance) untuk toleransi typo OCR.
// ============================================================

const RulesEngineB = (() => {
  /** Levenshtein distance klasik (bukan ML) — dipakai untuk toleransi typo hasil OCR. */
  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // hapus
          dp[i][j - 1] + 1, // tambah
          dp[i - 1][j - 1] + cost // ganti
        );
      }
    }
    return dp[m][n];
  }

  /**
   * Cek apakah keyword (bisa multi-kata) muncul di dalam teks, dengan toleransi
   * fuzzy per kata (jarak edit <= maxDistance). Substring match dicoba dulu (lebih cepat
   * & akurat); fuzzy jadi fallback untuk toleransi typo OCR ringan.
   */
  function fuzzyContains(haystack, keyword, maxDistance = 2) {
    const h = haystack.toLowerCase();
    const k = keyword.toLowerCase().trim();

    if (h.includes(k)) return true;

    // Fallback fuzzy: cek tiap window kata di haystack sepanjang jumlah kata keyword
    const keywordWords = k.split(/\s+/);
    const haystackWords = h.split(/\s+/).filter(Boolean);

    for (let i = 0; i <= haystackWords.length - keywordWords.length; i++) {
      const window = haystackWords.slice(i, i + keywordWords.length).join(" ");
      const dist = levenshtein(window, k);
      if (dist <= maxDistance) return true;
    }
    return false;
  }

  function buildFinding(rule, pageIndex) {
    return {
      ruleId: rule.id,
      section: rule.section || "-",
      pedoman_ref: rule.pedoman_ref || "-",
      message: rule.message_template,
      severity: rule.severity || "wajib",
      type: rule.type,
      pageIndex: pageIndex ?? null,
    };
  }

  /**
   * Jalankan rule field_presence terhadap gabungan teks OCR seluruh halaman.
   * @param {Array<{pageIndex:number, text:string}>} ocrResults
   * @param {object} rulesConfig - hasil parse rules-mode-b.json
   * @returns {Array} findings
   */
  function runFieldPresenceChecks(ocrResults, rulesConfig) {
    const combinedText = ocrResults.map((r) => r.text).join(" \n ");
    const findings = [];

    (rulesConfig.rules || []).forEach((rule) => {
      if (rule.type !== "field_presence") return; // tipe lain (style_check, dll) belum diimplementasikan di fase ini

      const found = rule.match_keywords.some((k) => fuzzyContains(combinedText, k));
      if (!found) {
        findings.push(buildFinding(rule));
      }
    });

    return findings;
  }

  return { runFieldPresenceChecks, fuzzyContains, levenshtein };
})();
