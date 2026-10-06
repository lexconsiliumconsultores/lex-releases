# LEX — Historial de sesión (cierre 29-09-2026 — pendiente 1.7.1)

## Estado actual (cierre del 29-09-2026) ⏳ 1.7.1 pendiente build
- **v1.7.0 PUBLICADA pero con bug JS al iniciar** (29-09 04:04): `supabase/dbAdapter.js` no estaba en `build.files` de `package.json:20`, el exe instalado arrojaba `Cannot find module` al iniciar. Con `npm start` sí funciona. Fix aplicado en `v1.7.1` (commit `9964379`): añadido `supabase/**/*` a `files`, bump `1.7.0→1.7.1`, tag `v1.7.1` pusheado.
- **v1.7.1 BUILD PENDIENTE (29-09 01:00-04:00)**: `npm run dist` se pega en `signing with signtool.exe` (portable) por `pg`+`sharp`+`capacitor` (413 paquetes). Intento con `signAndEditExecutable:false` y `forceCodeSigning:false` aún firma `__uninstaller`/`portable`. Último intento proceso `2680` colgado. **Mañana:** build limpio `npx electron-builder --win --publish never` (6-7 min) y `gh release create v1.7.1` con 4 assets. Workaround inmediato: `npm start` en `C:\...\LEX` ya abre ultra rápido sin freeze.
- **Fix freeze ultra rápido ya en código (master `ac1c44c`)**: `main.js:305` dual-write Supabase desactivado (antes congelaba 3-5s tras cada guardado, pool max 5 + poll 60s). Ahora local 100% veloz. `renderer.js:1647` `formatearMontoCLP` preserva cursor, `main.js:949` `updateFactura` guarda `caso/cliente/fecha` (antes no dejaba editar $$ en Cuenta por Pagar).
- **v1.6.9/1.7.0 publicadas OK**: 1.6.9 y 1.7.0 en https://github.com/lexconsiliumconsultores/lex/releases (1.7.0 con bug, 1.7.1 lo corrige).
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

## APP ANDROID — FASE 2-3 COMPLETADA (28-09) + PENDIENTE 29-09
- **Sincronización PC↔móvil 100% operativa vía Supabase** (`vfxbnuhacqvyebualfhv.supabase.co`, pooler sa-east-1, RLS `app_full_access`), pero **desktop sync desactivado temporalmente** (`main.js:305` ultra rápido) para no congelar. Móvil escribe directo a Supabase, desktop local. **Pendiente mañana:** reactivar sync en 2º plano con cola debounce + botón Sincronizar manual (no en cada `runQuery`).
- **Móvil Capacitor:** `mobile/` scaffold OK, `npx cap add android` OK, `assembleDebug` OK 28-09 (4.1MB `app-debug.apk` 22:15). **Pendiente:** `assembleRelease` firmado + subir a Release o Play Store, probar en dispositivo físico.
- Arquitectura por fases:
  1. ✅ **Hecho:** `supabase/schema.sql` + `@supabase/supabase-js` + `pg@8.23.0`
  2. ✅ **Hecho 28-09:** Proyecto Supabase creado, schema ejecutado (12 tablas), migración `lex.db` → Supabase verificada.
  3. ✅ **Hecho 28-09:** App Android Capacitor `mobile/` con shim `ipcRenderer` → Supabase directo.
  4. ✅ Login por usuario/rol ya funciona en ambas (tabla `usuarios` compartida).
  5. [ ] Pendiente mañana: reactivar sync desktop no bloqueante + APK release firmado.

## Pendiente mañana (30-09) — checklist ultra rápido
1. [ ] Build limpio `v1.7.1` (`npx electron-builder --win --publish never` 6 min, con `supabase` en files) y `gh release create v1.7.1` (4 assets) — para que exe instalado no arroje JS y llegue ultra rápido
2. [ ] Probar Cuenta por Pagar: editar monto con cursor preservado + verificar no se pega tras guardar (ya en `npm start`)
3. [ ] Reactivar Supabase sync desktop en 2º plano (no por cada guardado) + botón Sincronizar
4. [ ] APK `assembleRelease` firmado + probar en móvil

## Comandos útiles
- Build instaladores: `npm run dist` (6-7 min, si se pega en signing usa `forceCodeSigning:false`)
- Publicación: `gh release create vX.Y.Z --repo lexconsiliumconsultores/lex --title "LEX X.Y.Z" --notes "..." "dist_instalador/lex-setup-X.Y.Z.exe" "dist_instalador/lex-setup-X.Y.Z.exe.blockmap" "dist_instalador/lex-portable-X.Y.Z.exe" "dist_instalador/latest.yml"`
- Validar JS: `node --check main.js` y `node --check renderer.js`
- BD local: `%APPDATA%\lex\lex.db` — Supabase: `https://vfxbnuhacqvyebualfhv.supabase.co`
- Workaround hoy: `npm start` en `C:\...\LEX` abre sin error y sin freeze
# LEX � Historial sesi�n 05-10-2026 (v1.7.6 + campo ID Tr�mite)

## Estado actual (cierre 05-10-2026, 1.7.6 PUBLICADA)
- **v1.7.6 publicada** (commit 58ceab9, tag v1.7.6, release en GitHub con latest.yml + lex-setup-1.7.6.exe + lex-portable-1.7.6.exe):
  - **Sync bidireccional de borrados**: tablas locales eliminados y sync_known; orrarRegistro() registra deletes y syncNow() los sube a Supabase y borra local lo eliminado en otro dispositivo. deleteRow() en supabase/dbAdapter.js.
  - **Campo nuevo id_tramite en clientes**: formulario (desktop y m�vil), columnas en tablas, INSERT/UPDATE en main.js, ipc-shim y supabase/schema.sql.
- **Supabase**: ejecutado ALTER TABLE clientes ADD COLUMN id_tramite TEXT; ?
- **Pendiente ma�ana**: generar APK Android. No hay APK en el repo. Config Capacitor est� en mobile/capacitor.config.json (no en la ra�z). Para hacerla: en mobile/ correr 
px cap sync android y luego gradlew assembleDebug dentro de mobile/android/. Ojo: 
px cap sync desde la ra�z falla ("android platform has not been added yet") porque el config est� en mobile/.
- Build PC probado: dist_instalador/lex-setup-1.7.6.exe / lex-portable-1.7.6.exe disponibles.

# LEX — Historial sesión 05-10-2026 tarde (v1.7.7, APK firmada, responsive móvil)

## Estado actual (cierre 05-10-2026, 1.7.7 PUBLICADA)
- **v1.7.7**: timeout de 20-30s en llamadas Supabase (main.js withTimeout para pull/push/delete; ipc-shim.js withTimeout 12s + caché localStorage de gets). Fix: app no se congela al guardar con red lenta.
- **APK Android firmada** (`app-release.apk`, keystore propio en mobile/android/app/lex-release.keystore, respaldo en RESPALDO_KEYSTORE_LEX/). versionCode 2, versionName 1.7.7.
- **Mobile responsive**: topbar con hamburger + drawer (mobile/www/index.html, styles.css). Capacitor usa JDK 21 (org.gradle.java.home en gradle.properties).
- **Nota APK**: no hay auto-update para Android; la actualización de APK se instala a mano (app-release.apk firmada con la misma clave → se puede instalar encima).


# LEX - Historial sesion 06-10-2026 (v1.7.9, cache movil + focus pago)

## Estado actual (cierre 06-10-2026, v1.7.9 PUBLICADA)
- **Causa del retraso**: en Android cada "get" (getFacturas, getPagos, getCuentasPorCobrar...) esperaba la respuesta de Supabase antes de mostrar nada; al tocar el boton de registrar pago el modal tardaba en aparecer y la barra/teclado del campo monto se demoraba. En desktop los gets son locales (sql.js) y se sienten inmediatos.
- **Fix movil (mobile/www/js/ipc-shim.js)**: cache en localStorage con TTL 10s. Las lecturas ("get/list/search") devuelven cache al instante y revalidan en segundo plano (stale-while-revalidate); al ejecutar una escritura (add/update/delete) se invalida todo el cache "lexcache_*" para que la siguiente lectura traiga datos frescos. Si Supabase no responde en 12s se sirve cache viejo (timeout ya existia, ahora con TTL).
- **Focus automatico al monto**: openPagoModal (renderer.js desktop y mobile/www/renderer.js) hace focus() a #pagoMonto a los 80ms de abrir el modal -> el teclado sale inmediato.
- **Desktop main.js**: listener de "focus" que dispara syncNow() maximo 1 vez cada 15s (codigo que quedo sin commitear de la sesion interrumpida; ya commiteado en 1.7.9).
- **Versiones**: package.json 1.7.9, build.gradle versionCode 4 / versionName 1.7.9.
- **Build PC**: dist_instalador/lex-setup-1.7.9.exe + lex-portable-1.7.9.exe + blockmap + latest.yml. (OJO: el primer "npm run dist" quedo colgado en el paso de firma/signing; se mataron los procesos node y se corrio otra vez con exito.)
- **Build Android**: app-release.apk firmada (gradlew assembleRelease, JDK 21, ~5 min).
- **GitHub**: commit 23986ec en master, push OK, release v1.7.9 creada con exe instalador + portable, blockmap, latest.yml y app-release.apk.
- **Para probar**: instalar el nuevo exe encima del anterior (auto-updater tambien lo descargara); en Android instalar mobile/android/app/build/outputs/apk/release/app-release.apk encima (misma clave de firma, no hay que desinstalar).

# LEX - Historial sesion 06-10-2026 (v1.7.9 / v1.7.10, fix instalador + mobile APK)

## Estado actual (cierre 06-10-2026)
- **v1.7.10 PUBLICADA** (commit bc52b99..0f7565a):
  - NSIS `oneClick: true` (antes oneClick:false) -> desde ahora las actualizaciones se instalan EN SILENCIO, cerradas automaticamente, sin el dialogo "No se puede cerrar LEX".
  - `autoUpdater.quitAndInstall(true, true)` + `app.exit(0)` inmediato.
  - Eliminado el sync al enfocar ventana (causaba lentitud).
  - Background sync 60s -> 180s.
  - Fix encoding: PowerShell corrompio acentos con Set-Content (Gesti�n -> Gesti?n); corregido con node readFileSync/writeFileSync UTF-8. CSS de UI en v1.7.10 en index.html desktop y mobile, update-check.js APP_VERSION='1.7.10'.
  - GitHub release v1.7.10 con exe + apk + latest.yml.
- **Mobile APK 1.7.10**: versionCode 5 / versionName 1.7.10, assembleRelease OK, app-release.apk subida al release, cache localStorage TTL 10s (v1.7.9) ya visible. Supabase verificado con datos (clientes) -> movil muestra datos.
- **Lessons learned**:
  - "No se puede cerrar LEX" ocurre si el proceso con la App sigue corriendo cuando NSIS intenta chocarla (NSIS oneClick:false pide cerrarla a mano). Solucion final: oneClick:true.
  - PowerShell `(Get-Content -Raw) -replace | Set-Content` rompe UTF-8; siempre usar node -e con utf8 para editar archivos.
  - El numero "v1.X" del sidebar es texto hardcodeado en index.html (no sale de package.json); actualizarlo en cada bump.
