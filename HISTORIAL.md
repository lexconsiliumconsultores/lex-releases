# LEX — Historial de sesión (retomar el 14-09-2026)

## Estado actual
- Última versión en desarrollo: **v1.6.7** (WhatsApp Web + dinero CLP). No publicada aún.
- Las pruebas de WhatsApp (QR) se hicieron con la versión **estable de `whatsapp-web.js` 1.26.1 + Chrome del sistema** (headless, sin descargar Chromium) → QR generado correctamente. La versión inestable `1.26.1-alpha.0` no arrancó el navegador, por eso se usó la estable.
- **Nota sesión WhatsApp**: vive en `%APPDATA%\lex\whatsapp-session` (`LocalAuth`). El cliente se destruye limpiamente al salir (`window-all-closed` espera a `dbWriting`).

## Qué incluye v1.6.7
- **WhatsApp Web conectado por QR (costo $0)**: panel en **Configuración → WhatsApp** con QR escaneable (una vez, sesión guardada), estado de conexión, botón desconectar, y registro como *Notificación* con canal `WhatsApp`.
- **Envíos por WhatsApp** en: **Cuentas por Cobrar** (📱 recordatorio de cobro por factura/caso) y **Plazos** (📱 aviso de vencimiento), con el mismo formato de mensaje que los correos.
- **Modal de Notificación con canal**: desplegable **Correo / WhatsApp / Ambos**, teléfono + email autollenados desde el cliente. Envíos se guardan en Notificaciones con canal WhatsApp y estado Enviado/Fallido.
- **Dinero en CLP**: inputs de montos (facturas y pagos) se **autoformatean con puntos de miles** al escribir (`formatearMontoCLP`) y se guardan sin decoradores (`parsearMontoCLP`). Todo se muestra en pesos CLP con `.` de miles.
- **Corrección doble `$`**: se eliminaron los `$$` duplicados en historial de pagos y ver cobro; se usa el helper unificado para evitarlo en el futuro.

## Historial de versiones
- **v1.6.5**: rendimiento (debounce persistencia + respuestas), visor interno de documentos.
- **v1.6.6**: (versión previa) notificaciones solo envío, outlet automático, recordatorio de cobro por correo.
- **v1.6.7**: lo descrito arriba.

## Pendiente — APP ANDROID (decidido mañana, NO implementar)
- Usuario quiere: **mismo acceso que el escritorio** + **datos 100% sincronizados** PC↔móvil.
- Requiere mover la BD local (SQLite `lex.db`) a la nube.
- Opciones evaluadas: **Supabase** (Postgres + API automática + login + permisos, plan free) vs **Railway** (Postgres + API/backend propios, más trabajo). Recomendado: **Supabase**.
- Entorno verificado en el PC: Node 24.17.0, npm 11.13.0, Java JDK 21.0.11, `ANDROID_HOME=C:\Android\Sdk` (carpeta existe). **Falta:** Android Studio / SDK operativo y `adb` no está en PATH; no hay cuenta Supabase ni Railway aún.
- Arquitectura pensada (por fases):
  1. Crear proyecto Supabase (URL + anon key) y replicar tablas (casos, clientes, facturas, pagos, plazos, notificaciones, documentos, seguimientos, config) con SQL casi igual al actual.
  2. Conectar LEX (main.js) a Supabase en lugar de SQLite local; migrar los datos históricos una sola vez.
  3. App Android con **Capacitor** reutilizando la UI web (misma lógica, adaptada a táctil), hablando directo a Supabase (sin Electron/IPC).
  4. Login por usuario/rol en ambas plataformas.
  5. (Opcional) Notificaciones push de plazos y cobros.

## Comandos útiles
- Build instaladores: `npm run dist`
- Publicación manual (tras tag): `gh release create vX.Y.Z --repo lexconsiliumconsultores/lex --title "LEX X.Y.Z" --notes "..." "<abs>\lex-setup-X.Y.Z.exe" "<abs>\lex-setup-X.Y.Z.exe.blockmap" "<abs>\lex-portable-X.Y.Z.exe" "<abs>\latest.yml"`
- Validar JS: `node --check main.js` y `node --check renderer.js`
- BD local: `%APPDATA%\lex\lex.db`