// ============================================================
// KONFIGURASI MODE B
// ============================================================

const CONFIG_B = {
  RULES_PATH: "rules-mode-b.json",

  // Bahasa OCR Tesseract.js. 'ind' = Bahasa Indonesia, 'eng' = Inggris (fallback).
  // Traineddata di-load otomatis oleh Tesseract.js dari CDN saat runtime (bukan disimpan di repo).
  OCR_LANGUAGES: "ind+eng",

  // Batas ukuran file upload (MB) supaya OCR di browser tidak macet.
  MAX_FILE_SIZE_MB: 15,

  // Tipe file yang diterima
  ACCEPTED_TYPES: ["image/png", "image/jpeg", "image/webp", "application/pdf"],

  // Skala render halaman PDF ke canvas (semakin tinggi = OCR lebih akurat, tapi lebih lambat)
  PDF_RENDER_SCALE: 2.0,
};
