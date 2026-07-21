// ============================================================
// STYLE HEURISTICS MODULE — deteksi bold/italic murni pengolahan citra klasik:
// - Bold: ink density (rasio piksel hitam) setelah binarisasi Otsu.
// - Italic: sudut kemiringan (slant) dominan tepi glyph via Sobel edge detection.
// TIDAK ADA machine learning / model AI di modul ini.
// ============================================================

const StyleHeuristics = (() => {
  const BOLD_DENSITY_FACTOR = 1.15; // density > baseline * factor => bold (dikalibrasi ulang dari 1.25, terlalu ketat di data uji nyata)
  const ITALIC_ANGLE_THRESHOLD_DEG = 8; // |slant| > ini => italic

  /** Ambil ImageData dari region bbox pada canvas, dengan sedikit padding. */
  function cropImageData(canvas, bbox, padding = 2) {
    const x0 = Math.max(0, Math.floor(bbox.x0 - padding));
    const y0 = Math.max(0, Math.floor(bbox.y0 - padding));
    const x1 = Math.min(canvas.width, Math.ceil(bbox.x1 + padding));
    const y1 = Math.min(canvas.height, Math.ceil(bbox.y1 + padding));
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);

    const ctx = canvas.getContext("2d");
    return ctx.getImageData(x0, y0, w, h);
  }

  /** Ubah ImageData RGBA jadi array grayscale (luminance). */
  function toGrayscale(imageData) {
    const { data, width, height } = imageData;
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return { gray, width, height };
  }

  /** Otsu's method (rumus statistik klasik) — cari threshold optimal pemisah teks/background. */
  function otsuThreshold(gray) {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;

    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * histogram[t];

    let sumB = 0;
    let wB = 0;
    let maxVariance = 0;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }
    return threshold;
  }

  /**
   * Hitung ink density (rasio piksel "tinta"/gelap) pada region bbox setelah binarisasi Otsu.
   * Density tinggi → kemungkinan bold (goresan lebih tebal).
   */
  function computeInkDensity(canvas, bbox) {
    const imageData = cropImageData(canvas, bbox);
    const { gray } = toGrayscale(imageData);
    if (gray.length === 0) return 0;

    const threshold = otsuThreshold(gray);
    let darkCount = 0;
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] < threshold) darkCount++;
    }
    return darkCount / gray.length;
  }

  /**
   * Hitung baseline ink density "normal" dari baris-baris REFERENSI yang mirip ukuran
   * font (tinggi bbox) dengan baris target — supaya perbandingan bold adil (apple-to-apple),
   * bukan membandingkan judul section (font besar) dengan body text (font kecil) yang
   * kebetulan sudah banyak kata bold-nya sendiri (mis. daftar "Skor 0...Skor 6").
   * @param {HTMLCanvasElement} canvas
   * @param {Array} allLines - semua baris di halaman (punya .bbox, .text)
   * @param {object} targetBbox - bbox baris yang sedang dinilai (dikecualikan dari baseline)
   */
  function computeBaselineDensityForLine(canvas, allLines, targetBbox) {
    const targetHeight = targetBbox.y1 - targetBbox.y0;

    const candidates = (allLines || [])
      .map((l) => l.bbox)
      .filter(Boolean)
      .filter((b) => {
        const isSameLine =
          Math.abs(b.x0 - targetBbox.x0) < 2 && Math.abs(b.y0 - targetBbox.y0) < 2;
        if (isSameLine) return false; // jangan bandingkan baris dengan dirinya sendiri
        const h = b.y1 - b.y0;
        if (h <= 0) return false;
        const ratio = h / targetHeight;
        return ratio >= 0.7 && ratio <= 1.4; // toleransi ukuran font mirip (±40%)
      });

    // Kalau baris dengan ukuran font mirip terlalu sedikit (<3), baseline tidak reliable —
    // fallback ke seluruh baris halaman supaya tetap ada pembanding, walau kurang ideal.
    const pool = candidates.length >= 3 ? candidates : (allLines || []).map((l) => l.bbox).filter(Boolean);

    return computeBaselineDensity(canvas, pool);
  }

  /**
   * Hitung baseline ink density "normal" dari beberapa region referensi (baris-baris lain
   * di halaman yang sama), dipakai sebagai pembanding untuk deteksi bold relatif.
   */
  function computeBaselineDensity(canvas, referenceBboxes) {
    if (!referenceBboxes || referenceBboxes.length === 0) return 0.12; // fallback konservatif
    const densities = referenceBboxes
      .map((bbox) => computeInkDensity(canvas, bbox))
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (densities.length === 0) return 0.12;
    // Pakai median supaya tidak terpengaruh outlier (baris yang sudah bold/heading lain)
    const mid = Math.floor(densities.length / 2);
    return densities.length % 2 !== 0
      ? densities[mid]
      : (densities[mid - 1] + densities[mid]) / 2;
  }

  /** Sobel edge detection (rumus klasik pengolahan citra) — hasil magnitude tiap piksel. */
  function sobelMagnitude(gray, width, height) {
    const Gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const Gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const mag = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sx = 0;
        let sy = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const val = gray[(y + dy) * width + (x + dx)];
            sx += val * Gx[k];
            sy += val * Gy[k];
            k++;
          }
        }
        mag[y * width + x] = Math.sqrt(sx * sx + sy * sy);
      }
    }
    return mag;
  }

  /**
   * Estimasi sudut kemiringan (slant) dominan glyph pada region bbox, via Sobel edge +
   * regresi linear centroid-x tiap baris piksel. Italic → glyph miring ke kanan di bagian atas.
   * @returns {number} sudut dalam derajat dari vertikal (0 = tegak lurus normal)
   */
  function computeSlantAngle(canvas, bbox) {
    const imageData = cropImageData(canvas, bbox);
    const { gray, width, height } = toGrayscale(imageData);
    if (width < 4 || height < 4) return 0;

    const mag = sobelMagnitude(gray, width, height);

    // Threshold edge: pakai persentil sederhana (rata-rata + 1 stdev) supaya adaptif per crop
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < mag.length; i++) {
      sum += mag[i];
      sumSq += mag[i] * mag[i];
    }
    const mean = sum / mag.length;
    const std = Math.sqrt(Math.max(0, sumSq / mag.length - mean * mean));
    const edgeThreshold = mean + std;

    // Untuk tiap baris y, hitung centroid-x piksel edge (weighted by magnitude)
    const rowCentroids = []; // { y, x }
    for (let y = 0; y < height; y++) {
      let weightedX = 0;
      let weightSum = 0;
      for (let x = 0; x < width; x++) {
        const m = mag[y * width + x];
        if (m > edgeThreshold) {
          weightedX += x * m;
          weightSum += m;
        }
      }
      if (weightSum > 0) {
        rowCentroids.push({ y, x: weightedX / weightSum });
      }
    }

    if (rowCentroids.length < 4) return 0; // data tidak cukup untuk regresi, anggap tegak

    // Regresi linear sederhana: x = a + b*y  →  slope b menunjukkan kemiringan per baris
    const n = rowCentroids.length;
    let sumY = 0;
    let sumX = 0;
    let sumXY = 0;
    let sumYY = 0;
    rowCentroids.forEach(({ y, x }) => {
      sumY += y;
      sumX += x;
      sumXY += x * y;
      sumYY += y * y;
    });
    const denom = n * sumYY - sumY * sumY;
    if (denom === 0) return 0;
    const slope = (n * sumXY - sumX * sumY) / denom; // dx per dy

    // slope dx/dy → sudut dari vertikal (garis tegak lurus = slope 0 = 0 derajat)
    const angleRad = Math.atan(slope);
    return (angleRad * 180) / Math.PI;
  }

  function isBold(density, baselineDensity) {
    return density > baselineDensity * BOLD_DENSITY_FACTOR;
  }

  function isItalic(angleDeg) {
    return Math.abs(angleDeg) > ITALIC_ANGLE_THRESHOLD_DEG;
  }

  /**
   * Hitung confidence sederhana (0-1) untuk temuan style — makin jauh dari ambang batas,
   * makin tinggi keyakinan. Dipakai untuk urutkan tampilan review (confidence rendah ditaruh
   * di atas supaya lebih diteliti user).
   */
  function boldConfidence(density, baselineDensity) {
    const ratio = baselineDensity > 0 ? density / baselineDensity : 1;
    // ratio 1.0 (persis baseline, ambigu) → confidence rendah; makin jauh dari 1.25 → makin yakin
    const distanceFromThreshold = Math.abs(ratio - BOLD_DENSITY_FACTOR);
    return Math.max(0.3, Math.min(0.95, 0.5 + distanceFromThreshold));
  }

  function italicConfidence(angleDeg) {
    const distance = Math.abs(Math.abs(angleDeg) - ITALIC_ANGLE_THRESHOLD_DEG);
    return Math.max(0.3, Math.min(0.9, 0.4 + distance / 15));
  }

  return {
    computeInkDensity,
    computeBaselineDensity,
    computeBaselineDensityForLine,
    computeSlantAngle,
    isBold,
    isItalic,
    boldConfidence,
    italicConfidence,
    BOLD_DENSITY_FACTOR,
    ITALIC_ANGLE_THRESHOLD_DEG,
  };
})();