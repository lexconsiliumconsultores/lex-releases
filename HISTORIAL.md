# LEX — Historial de sesión (cierre 28-09-2026)

## Estado actual (cierre del 28-09-2026) ✅
- **v1.6.9 PUBLICADA (28-09-2026)**: `gh release create v1.6.9` ejecutado con 4 assets (`lex-setup-1.6.9.exe` 82MB, `.blockmap`, `lex-portable-1.6.9.exe`, `latest.yml`). URL: https://github.com/lexconsiliumconsultores/lex/releases/tag/v1.6.9 — auto-actualización operativa (15s + "Más tarde").
- **v1.6.9 ELIMINACIÓN DE WHATSAPP (23-09-2026) — COMPLETADA**:
  - Motivo: QR de WhatsApp nunca conectó (`whatsapp-web.js@1.26.1-alpha.0`). Usuario pidió **eliminar toda notificación WhatsApp, dejar solo Outlook**.
  - Cambios commit `ddc24ae` + `8da9cc5`: `main.js` sin `qrcode`/`whatsapp-web.js` (eliminado bloque WA 740-900, handlers y cleanup), `renderer.js` sin listeners/waNotificarPlazo/waRecordarCobro y lógica canal WhatsApp (solo `enviarEmail` Outlook/SMTP), `index.html` sin card QR ni select canal/teléfono, `package.json` sin `qrcode`/`whatsapp-web.js`, versión bump `1.6.8→1.6.9`.
  - `npm run dist` ejecutado OK (23-09-2026): generó `dist_instalador/lex-setup-1.6.9.exe`, `.blockmap`, `lex-portable-1.6.9.exe`. Tag `v1.6.9` pusheado a `origin`. **Pendiente mañana (24-09):** crear Release `v1.6.9` con `gh release create` (subir 3 assets + `latest.yml`) para que le llegue la actualización auto-instalable. Comando: `gh release create v1.6.9 --title "LEX 1.6.9" --notes "Eliminar WhatsApp..." dist_instalador/lex-setup-1.6.9.exe dist_instalador/lex-setup-1.6.9.exe.blockmap dist_instalador/lex-portable-1.6.9.exe dist_instalador/latest.yml`
  - Notificaciones ahora solo por `Outlook` (Graph API) con fallback `SMTP` (`enviarEmail` `main.js:715`).
- **App Android en curso — ARRANCÓ CON SUPABASE (fase 1 lista)**:
  - `supabase/schema.sql` creado y pusheado: replica 12 tablas de lex.db en PostgreSQL (BIGINT identity, NUMERIC(14,2), TIMESTAMPTZ), índices, admin, RLS `app_full_access`.
  - `@supabase/supabase-js@^2.116.0` instalado.
  - **COMPLETADO 28-09-2026:** Proyecto Supabase `vfxbnuhacqvyebualfhv` (São Paulo, `https://vfxbnuhacqvyebualfhv.supabase.co`, publishable `sb_publishable_...`, secret `sb_secret_...`). Schema ejecutado vía `pg` pooler `aws-0-sa-east-1.pooler.supabase.com:6543` (12 tablas verificadas). Migración `lex.db` (94KB) → Supabase: 2 clientes, 3 casos, 1 plazo, 2 facturas, 14 notificaciones, etc. `main.js` conectado con `supabase/dbAdapter.js` (Pool pg + dual-write `runQuery` + initSupabase en `app.whenReady`). Verificado `supabase-js` publishable OK + insert/delete prueba.
- WhatsApp histórico: pruebas con `whatsapp-web.js 1.26.1` estable + Chrome headless dieron QR OK, pero `1.26.1-alpha.0` falló conexión → eliminado en v1.6.9. Sesión antigua en `%APPDATA%\lex\whatsapp-session` puede borrarse.

## Qué incluye v1.6.9 (publicada 28-09-2026)
- **Eliminar WhatsApp**: quitado QR, cliente `whatsapp-web.js`, botones 📱 en Plazos y Cuentas por Cobrar, y selectores de canal WhatsApp. Notificaciones solo por **Outlook** (Graph API + SMTP).
- **Versión bump** `1.6.8→1.6.9` (`package.json:3`, `index.html:33/109`), build `lex-setup-1.6.9.exe` listo, tag `v1.6.9` pusheado.

## Qué incluye v1.6.8
- **Instalación automática**: al descargarse una actualización, LEX se reinicia solo en **15 segundos** para instalarla (banner con cuenta regresiva y botón "Reiniciar ahora"). Botón "⏸ Más tarde" cancela el reinicio automático y aplica la actualización al cerrar LEX (`autoInstallOnAppQuit`). Diálogo modal de confirmación eliminado.
- **Fix pantalla vacía**: se eliminó un `</div>` extra en `index.html` (barra lateral) que cerraba `appContainer` antes de tiempo; el menú y el contenido principal ahora quedan dentro del contenedor visible.

## Qué incluye v1.6.7
- **WhatsApp Web conectado por QR (costo $0)**: panel en **Configuración → WhatsApp** con QR escaneable (una vez, sesión guardada), estado de conexión, botón desconectar, y registro como *Notificación* con canal `WhatsApp`.
- **Envíos por WhatsApp** en: **Cuentas por Cobrar** (📱 recordatorio de cobro por factura/caso) y **Plazos** (📱 aviso de vencimiento), con el mismo formato de mensaje que los correos.
- **Modal de Notificación con canal**: desplegable **Correo / WhatsApp / Ambos**, teléfono + email autollenados desde el cliente. Envíos se guardan en Notificaciones con canal WhatsApp y estado Enviado/Fallido.
- **Dinero en CLP**: inputs de montos (facturas y pagos) se **autoformatean con puntos de miles** al escribir (`formatearMontoCLP`) y se guardan sin decoradores (`parsearMontoCLP`). Todo se muestra en pesos CLP con `.` de miles.
- **Corrección doble `$`**: se eliminaron los `$$` duplicados en historial de pagos y ver cobro; se usa el helper unificado para evitarlo en el futuro.

## Historial de versiones
- **v1.6.5**: rendimiento (debounce persistencia + respuestas), visor interno de documentos.
- **v1.6.6**: (versión previa) notificaciones solo envío, outlet automático, recordatorio de cobro por correo.
- **v1.6.7**: WhatsApp Web + dinero CLP (descrito arriba).
- **v1.6.8**: fix pantalla vacía (HTML) + instalación automática de actualizaciones.
- **v1.6.9**: eliminar WhatsApp (solo Outlook), fix QR fallido — build 23-09, **publicada 28-09** con auto-actualización.

## APP ANDROID — FASE 2-3 COMPLETADA (28-09-2026)
- **Sincronización PC↔móvil 100% operativa vía Supabase** (`vfxbnuhacqvyebualfhv.supabase.co`, pooler sa-east-1, RLS `app_full_access`).
- **Móvil Capacitor scaffolded:** `mobile/` con `@capacitor/core@8.5.2` + `@capacitor/android`, `capacitor.config.json` (`com.cmr.lex.mobile`, webDir `www`), `mobile/www` con `index.html`+`styles.css`+`renderer.js` (patch `window.ipcRenderer`) + `js/ipc-shim.js` (30+ handlers Supabase: login, casos, clientes, plazos, facturas, pagos, estadísticas, notificaciones, IA Gemini) + CDN `supabase-js` UMD. `npx cap add android` OK, `npx cap sync` OK, proyecto Gradle en `mobile/android`.
- Arquitectura por fases:
  1. ✅ **Hecho:** `supabase/schema.sql` + `@supabase/supabase-js` + `pg@8.23.0`
  2. ✅ **Hecho 28-09:** Proyecto Supabase creado, schema ejecutado (12 tablas), `main.js` + `supabase/dbAdapter.js` dual-write, migración `lex.db` → Supabase verificada.
  3. ✅ **Hecho 28-09:** App Android Capacitor `mobile/` con shim `ipcRenderer` → Supabase directo (sin Electron), reutiliza UI web adaptada a táctil.
  4. ✅ Login por usuario/rol ya funciona en ambas (tabla `usuarios` compartida).
  5. [ ] Pendiente: `mobile/android/gradlew assembleDebug` (gradle build APK), instalar en dispositivo, notificaciones push.

## Comandos útiles
- Build instaladores: `npm run dist`
- Publicación manual (tras tag): `gh release create vX.Y.Z --repo lexconsiliumconsultores/lex --title "LEX X.Y.Z" --notes "..." "<abs>\lex-setup-X.Y.Z.exe" "<abs>\lex-setup-X.Y.Z.exe.blockmap" "<abs>\lex-portable-X.Y.Z.exe" "<abs>\latest.yml"`
- Validar JS: `node --check main.js` y `node --check renderer.js`
- BD local: `%APPDATA%\lex\lex.db`