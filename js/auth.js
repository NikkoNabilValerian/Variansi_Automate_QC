// ============================================================
// AUTH MODULE — Google Identity Services (OAuth token client, implicit flow)
// Tidak ada backend, tidak ada Client Secret. Token hanya disimpan di memori JS.
// ============================================================

const Auth = (() => {
  let accessToken = null;
  let tokenClient = null;
  let onChangeCallback = null;

  /**
   * Inisialisasi token client. Harus dipanggil setelah script GIS
   * (https://accounts.google.com/gsi/client) selesai load.
   */
  function init(onLoginSuccess, onLoginError) {
    if (typeof google === "undefined" || !google.accounts) {
      throw new Error(
        "Google Identity Services belum termuat. Cek koneksi internet atau apakah script GIS gagal load."
      );
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: (response) => {
        if (response.error) {
          onLoginError && onLoginError(response);
          return;
        }
        accessToken = response.access_token;
        onLoginSuccess && onLoginSuccess(accessToken);
      },
      error_callback: (err) => {
        onLoginError && onLoginError(err);
      },
    });
  }

  /** Trigger popup login Google. */
  function login() {
    if (!tokenClient) {
      throw new Error("Auth belum di-init. Panggil Auth.init() dulu.");
    }
    tokenClient.requestAccessToken();
  }

  /** Minta ulang token (dipakai saat 401 / token expired). */
  function reauth() {
    if (!tokenClient) return;
    tokenClient.requestAccessToken({ prompt: "" });
  }

  /** Hapus token dari memori (logout lokal — tidak revoke di server Google). */
  function logout() {
    if (accessToken && google.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
  }

  function getToken() {
    return accessToken;
  }

  function isLoggedIn() {
    return !!accessToken;
  }

  return { init, login, reauth, logout, getToken, isLoggedIn };
})();
