# LEX — Historial de sesión (retomar 16-09-2026)

## Estado actual (cierre del 15-09-2026)
- **v1.6.8 publicada** (2026-09-15): actualización **auto-instalable**. Release de GitHub con 4 assets (`lex-setup-1.6.8.exe`, `.blockmap`, `lex-portable-1.6.8.exe`, `latest.yml`). Incluye: fix del `</div>` extra en `index.html` que dejaba el menú/contenido fuera del contenedor visible, y actualización que se instala automáticamente (reinicio en 15s con opción "Más tarde").
- Última versión en desarrollo: **v1.6.8** (fix HTML + auto-instalación). Bugs/mejoras futuras → v1.6.9.
- **App Android en curso — ARRANCÓ CON SUPABASE (fase 1 lista)**:
  - `supabase/schema.sql` creado y pusheado: replica las 12 tablas de lex.db en PostgreSQL (id BIGINT identity, montos NUMERIC(14,2), TIMESTAMPTZ), con índices, INSERT del admin por defecto, RLS habilitado con política `app_full_access` (todas las tablas).
  - `@supabase/supabase-js@^2.116.0` instalado en `package.json` (npm tardó ~2 min; usar background con log).
  - **PENDIENTE para mañana:** 1) Crear proyecto en supabase.com (nombre 'lex', free tier, ~2 min), copiar desde Settings→API el **Project URL + anon key + service_role key**. 2) Ejecutar `supabase/schema.sql` en el SQL Editor. 3) Conectar main.js a Supabase en lugar de SQLite (el adaptador reemplaza `runQuery`/`queryOne`/`queryAll`; `runQuery` debe devolver `{lastId}` → `RETURNING id`). 4) Migrar datos de lex.db una vez. 5) Verificar GET/POST contra el proyecto.
  - Comando útil para probar conexión: `node -e "const {createClient}=require('@supabase/supabase-js'); ..."` con URL+key.
- Las pruebas de WhatsApp (QR) se hicieron con la versión **estable de `whatsapp-web.js` 1.26.1 + Chrome del sistema** (headless, sin descargar Chromium) → QR generado correctamente. La versión inestable `1.26.1-alpha.0` no arrancó el navegador, por eso se usó la estable.
- **Nota sesión WhatsApp**: vive en `%APPDATA%\lex\whatsapp-session` (`LocalAuth`). El cliente se destruye limpiamente al salir (`window-all-closed` espera a `dbWriting`).

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