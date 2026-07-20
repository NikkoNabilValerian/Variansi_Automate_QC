// ============================================================
// KONFIGURASI — ISI CLIENT_ID SEBELUM DIJALANKAN
// ============================================================
// Client ID didapat dari Google Cloud Console (lihat README.md, Bagian 3).
// Client ID AMAN ditaruh publik di file ini (bukan rahasia).
// JANGAN PERNAH taruh "Client Secret" di file ini atau di kode frontend mana pun.

const CONFIG = {
  CLIENT_ID: "910024218137-bq996q3cq0c6qc29s242mnjmj5cs9c9k.apps.googleusercontent.com",

  // Scope paling minim: hanya baca struktur form, tidak bisa edit apa pun.
  SCOPES: "https://www.googleapis.com/auth/forms.body.readonly",

  FORMS_API_BASE: "https://forms.googleapis.com/v1/forms",

  // Path ke rules.json (relatif terhadap index.html)
  RULES_PATH: "rules.json",
};
