# LEX — Historial de sesión (retomar 24-09-2026)

## Estado actual (cierre del 23-09-2026)
- **v1.6.8 publicada** (2026-09-15): actualización **auto-instalable**. Release de GitHub con 4 assets (`lex-setup-1.6.8.exe`, `.blockmap`, `lex-portable-1.6.8.exe`, `latest.yml`). Incluye: fix del `</div>` extra en `index.html` + auto-instalación (reinicio 15s con "Más tarde").
- **v1.6.9 en curso — ELIMINACIÓN DE WHATSAPP (23-09-2026) — BUILD LISTO, RELEASE PENDIENTE**:
  - Motivo: QR de WhatsApp nunca conectó (`whatsapp-web.js@1.26.1-alpha.0`). Usuario pidió **eliminar toda notificación WhatsApp, dejar solo Outlook**.
  - Cambios commit `ddc24ae` + `8da9cc5`: `main.js` sin `qrcode`/`whatsapp-web.js` (eliminado bloque WA 740-900, handlers y cleanup), `renderer.js` sin listeners/waNotificarPlazo/waRecordarCobro y lógica canal WhatsApp (solo `enviarEmail` Outlook/SMTP), `index.html` sin card QR ni select canal/teléfono, `package.json` sin `qrcode`/`whatsapp-web.js`, versión bump `1.6.8→1.6.9`.
  - `npm run dist` ejecutado OK (23-09-2026): generó `dist_instalador/lex-setup-1.6.9.exe`, `.blockmap`, `lex-portable-1.6.9.exe`. Tag `v1.6.9` pusheado a `origin`. **Pendiente mañana (24-09):** crear Release `v1.6.9` con `gh release create` (subir 3 assets + `latest.yml`) para que le llegue la actualización auto-instalable. Comando: `gh release create v1.6.9 --title "LEX 1.6.9" --notes "Eliminar WhatsApp..." dist_instalador/lex-setup-1.6.9.exe dist_instalador/lex-setup-1.6.9.exe.blockmap dist_instalador/lex-portable-1.6.9.exe dist_instalador/latest.yml`
  - Notificaciones ahora solo por `Outlook` (Graph API) con fallback `SMTP` (`enviarEmail` `main.js:715`).
- **App Android en curso — ARRANCÓ CON SUPABASE (fase 1 lista)**:
  - `supabase/schema.sql` creado y pusheado: replica 12 tablas de lex.db en PostgreSQL (BIGINT identity, NUMERIC(14,2), TIMESTAMPTZ), índices, admin, RLS `app_full_access`.
  - `@supabase/supabase-js@^2.116.0` instalado.
  - **PENDIENTE para mañana:** 1) Crear proyecto supabase.com (nombre 'lex', free tier), copiar **Project URL + anon key + service_role**. 2) Ejecutar `supabase/schema.sql` en SQL Editor. 3) Conectar main.js a Supabase (reemplazar `runQuery`/`queryOne`/`queryAll` → `RETURNING id`). 4) Migrar lex.db una vez. 5) Verificar GET/POST.
- WhatsApp histórico: pruebas con `whatsapp-web.js 1.26.1` estable + Chrome headless dieron QR OK, pero `1.26.1-alpha.0` falló conexión → eliminado en v1.6.9. Sesión antigua en `%APPDATA%\lex\whatsapp-session` puede borrarse.

## Qué incluye v1.6.9 (en curso, 23-09-2026)
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
- **v1.6.9**: eliminar WhatsApp (solo Outlook), fix QR fallido — build listo 23-09, release pendiente.

## Pendiente — APP ANDROID (EN CURSO, Supabase elegido)
- Usuario quiere: **mismo acceso que el escritorio** + **datos 100% sincronizados** PC↔móvil. Evaluado: **Supabase** (Postgres + API + login + permisos, free) → elegido.
- Entorno verificado en el PC: Node 24.17.0, npm 11.13.0, Java JDK 21.0.11, `ANDROID_HOME=C:\Android\Sdk` (carpeta existe). **Falta:** Android Studio / SDK operativo, `adb` no está en PATH, no hay proyecto Supabase aún.
- Arquitectura por fases:
  1. ✅ **Hecho:** `supabase/schema.sql` (replica 12 tablas) + instalado `@supabase/supabase-js`.
  2. [ ] Crear proyecto Supabase (URL + keys), ejecutar el SQL, conectar main.js a Supabase (reemplazar SQLite), migrar datos históricos una vez.
  3. App Android con **Capacitor** reutilizando la UI web (misma lógica, adaptada a táctil), hablando directo a Supabase (sin Electron/IPC).
  4. Login por usuario/rol en ambas plataformas.
  5. (Opcional) Notificaciones push de plazos y cobros.

## Comandos útiles
- Build instaladores: `npm run dist`
- Publicación manual (tras tag): `gh release create vX.Y.Z --repo lexconsiliumconsultores/lex --title "LEX X.Y.Z" --notes "..." "<abs>\lex-setup-X.Y.Z.exe" "<abs>\lex-setup-X.Y.Z.exe.blockmap" "<abs>\lex-portable-X.Y.Z.exe" "<abs>\latest.yml"`
- Validar JS: `node --check main.js` y `node --check renderer.js`
- BD local: `%APPDATA%\lex\lex.db`