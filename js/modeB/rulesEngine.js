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

  function buildFinding(rule, pageIndex, bbox, matchedText, confidence) {
    return {
      ruleId: rule.id,
      section: rule.section || rule.target || "-",
      pedoman_ref: rule.pedoman_ref || "-",
      message: rule.message_template.replace("{text}", matchedText || ""),
      severity: rule.severity || "wajib",
      type: rule.type,
      pageIndex: pageIndex ?? null,
      bbox: bbox || null,
      confidence: confidence ?? null,
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

  /**
   * Jalankan rule style_check (bold/italic) terhadap tiap baris OCR yang cocok dengan
   * match_keywords rule. Butuh canvas asli tiap halaman untuk crop region & hitung heuristik.
   * @param {Array<{pageIndex:number, canvas:HTMLCanvasElement, lines:Array}>} pagesData
   * @param {object} rulesConfig
   * @returns {Array} findings (dengan bbox & confidence untuk anotasi)
   */
  function runStyleChecks(pagesData, rulesConfig) {
    const findings = [];
    const styleRules = (rulesConfig.rules || []).filter((r) => r.type === "style_check");
    if (styleRules.length === 0) return findings;

    pagesData.forEach(({ pageIndex, canvas, lines }) => {
      if (!lines || lines.length === 0) return;

      // Baseline density dihitung sekali per halaman dari semua baris (median),
      // dipakai sebagai pembanding relatif untuk deteksi bold.
      const allBboxes = lines.map((l) => l.bbox).filter(Boolean);
      const baselineDensity = StyleHeuristics.computeBaselineDensity(canvas, allBboxes);

      styleRules.forEach((rule) => {
        lines.forEach((line) => {
          if (!line.bbox || !line.text) return;
          const matches = rule.match_keywords.some((k) =>
            fuzzyContains(line.text, k)
          );
          if (!matches) return;

          if (rule.expected_style === "bold") {
            const density = StyleHeuristics.computeInkDensity(canvas, line.bbox);
            const actuallyBold = StyleHeuristics.isBold(density, baselineDensity);
            if (rule.expected_style === "bold" && !actuallyBold) {
              const confidence = StyleHeuristics.boldConfidence(density, baselineDensity);
              findings.push(
                buildFinding(rule, pageIndex, line.bbox, line.text.trim(), confidence)
              );
            }
          } else if (rule.expected_style === "italic") {
            const angle = StyleHeuristics.computeSlantAngle(canvas, line.bbox);
            const actuallyItalic = StyleHeuristics.isItalic(angle);
            if (!actuallyItalic) {
              const confidence = StyleHeuristics.italicConfidence(angle);
              findings.push(
                buildFinding(rule, pageIndex, line.bbox, line.text.trim(), confidence)
              );
            }
          }
        });
      });
    });

    return findings;
  }

  /**
   * Jalankan seluruh rule (field_presence + style_check) sekaligus.
   * @param {Array} ocrResults - hasil OcrEngine.recognizeAll (punya text, words, lines per halaman)
   * @param {HTMLCanvasElement[]} canvases - canvas asli tiap halaman (untuk crop style_check)
   * @param {object} rulesConfig
   * @returns {Array} findings gabungan
   */
  function runAll(ocrResults, canvases, rulesConfig) {
    const fieldFindings = runFieldPresenceChecks(ocrResults, rulesConfig);

    const pagesData = ocrResults.map((r, idx) => ({
      pageIndex: r.pageIndex ?? idx,
      canvas: canvases[idx],
      lines: r.lines || [],
    }));
    const styleFindings = runStyleChecks(pagesData, rulesConfig);

    return [...fieldFindings, ...styleFindings];
  }

  return { runFieldPresenceChecks, runStyleChecks, runAll, fuzzyContains, levenshtein };
})();
