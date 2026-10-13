// Chequeo de actualizaciones para la APK: consulta GitHub releases y muestra
// un aviso si hay una version mas nueva. Al tocar "Descargar" abre el navegador
// del telefono con el APK mas reciente.
(function() {
  const APP_VERSION = '1.7.18';
  const API_URL = 'https://api.github.com/repos/lexconsiliumconsultores/lex/releases/latest';
  const APK_ASSET = 'app-release.apk';

  function check() {
    fetch(API_URL).then(r => r.ok ? r.json() : null).then(rel => {
      if (!rel || !rel.tag_name) return;
      const latest = rel.tag_name.replace(/^v/, '');
      if (latest === APP_VERSION) return;
      const asset = (rel.assets || []).find(a => a.name === APK_ASSET);
      if (!asset) return;
      const banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.className = 'active';
      banner.innerHTML =
        '<div class="update-banner-icon">⬇️</div>' +
        '<div class="update-banner-body">' +
        '<div class="update-banner-msg">Nueva version disponible: <b>v' + latest + '</b></div>' +
        '<div class="update-banner-actions">' +
        '<button class="update-banner-btn" id="apkDlBtn">Descargar</button>' +
        '<button class="update-banner-cancel" id="apkSkipBtn">Despues</button>' +
        '</div></div>';
      document.body.appendChild(banner);
      document.getElementById('apkDlBtn').onclick = function() {
        window.open(asset.browser_download_url, '_system');
      };
      document.getElementById('apkSkipBtn').onclick = function() {
        banner.remove();
      };
    }).catch(() => {});
  }

  // Esperar a que la app cargue para no estorbar el login
  setTimeout(check, 3000);
})();
