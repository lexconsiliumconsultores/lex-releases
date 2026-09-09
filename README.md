# LEX — Sistema de Gestión Jurídica

Aplicación de escritorio (Electron) para estudios de abogados. Gestión de casos, clientes, plazos, facturas, seguimiento, documentación legal, notificaciones por correo (Outlook) y actualizaciones automáticas vía GitHub.

**Versión actual:** 1.6.1

---

## 📌 Estado del proyecto

| Aspecto | Estado |
|---------|--------|
| Código fuente | Subido a GitHub (repo privado) |
| Control de versiones | Git + tags semánticos (v1.6.1) |
| Instalador Windows | ✅ Generado (NSIS + portable) |
| Actualizaciones automáticas | ✅ electron-updater + GitHub Releases |
| Repositorio | `https://github.com/lexconsiliumconsultores/lex` |

---

## 🚀 Sistema de actualizaciones

LEX usa **electron-updater** conectado al repo de GitHub (privado). Al abrir la app:

1. Comprueba automáticamente la última versión (12s después de iniciar).
2. Si hay una nueva versión → **aviso en pantalla** (banner superior derecho) + notificación del sistema "Nueva versión disponible".
3. Descarga en segundo plano.
4. Al terminar → banner con botón **"Reiniciar"** y diálogo *"¿Desea reiniciar para aplicar la actualización?"*.

### Cómo publicar una actualización (manual paso a paso)

1. Editar la versión en `package.json`:
   ```json
   "version": "1.6.0"
   ```
2. Construir el instalador:
   ```bash
   npm run dist
   ```
3. Preparar los archivos de la Release (nombres que espera el updater):
   ```powershell
   New-Item -ItemType Directory -Path dist_release -Force | Out-Null
   Copy-Item "dist_instalador\LEX - Gestión Jurídica Setup 1.6.0.exe" "dist_release\lex-setup-1.6.0.exe" -Force
   Copy-Item "dist_instalador\LEX - Gestión Jurídica Setup 1.6.0.exe.blockmap" "dist_release\lex-setup-1.6.0.exe.blockmap" -Force
   Copy-Item "dist_instalador\latest.yml" "dist_release\latest.yml" -Force
   ```
4. Commit, push y tag:
   ```bash
   git add -A
   git commit -m "Version 1.6.0: ..."
   git push origin master
   git tag v1.6.0
   git push origin v1.6.0
   ```
5. Crear y publicar la Release:
   ```powershell
   gh release create v1.6.0 "RUTA_ABS\dist_release\lex-setup-1.6.0.exe" "RUTA_ABS\dist_release\lex-setup-1.6.0.exe.blockmap" "RUTA_ABS\dist_release\latest.yml" --repo lexconsiliumconsultores/lex --title "LEX 1.6.0" --notes "..." --draft=false
   ```
   > ⚠️ Verificar que la Release NO quede como borrador y que existan los **3 assets** (`.exe`, `.exe.blockmap`, `latest.yml`). Si falta el `.exe`:
   > `gh release upload v1.6.0 "RUTA_ABS\dist_release\lex-setup-1.6.0.exe" --repo lexconsiliumconsultores/lex --clobber`

### Token privado

Por ser repo **privado**, la app necesita un token para descargar la actualización. Está guardado en la BD local:
`config.clave = 'github_token'` (ubicación: `%APPDATA%\LEX\lex.db`).
`main.js` lo lee al iniciar y lo asigna a `process.env.GH_TOKEN`.

---

## Requisitos

- **Node.js** v18+
- **Electron** (incluido en `node_modules`)
- Cuenta Microsoft Outlook personal o empresarial (calendario y correo)
- **GitHub CLI (`gh`)** autenticado — para publicar Releases

## Instalación (desarrollo)

```bash
cd LEX
npm install
```

## Ejecución (desarrollo)

**IMPORTANTE:** No usar `npm start` — usar directamente el ejecutable de Electron:

```powershell
Start-Process "C:\Users\CASA\Desktop\TODOS LOS PROYECTOS\PROYECTO 5\LEX\node_modules\electron\dist\electron.exe" -WorkingDirectory "C:\Users\CASA\Desktop\TODOS LOS PROYECTOS\PROYECTO 5\LEX"
```

## Credenciales de acceso

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | Administrador |

---

## Funcionalidades principales

### Dashboard (estilo Glass / Lujo)
- Tarjetas KPI con efecto cristal, degradados esmeralda y dorado, orbes flotantes animados
- Indicador "Salud del Estudio" con semáforo (ÓPTIMO / ALERTA / CRÍTICO)
- Radar de vencimientos (próximas 48h con urgencia por horas)
- Agenda del día: plazos locales + eventos de Outlook
- Acciones rápidas (Registrar Cliente, Programar Plazo, Enviar Notificación)

### Casos
- Crear, editar, eliminar casos
- Filtros por estado (Activo, Pendiente, Archivado)
- Número de caso generado automáticamente
- Detalle con seguimiento, documentos y plazos vinculados

### Clientes
- Registro con nombre, cédula/RIF, email, teléfono
- Asociación con casos

### Documentos
- Subir, previsualizar, descargar y eliminar documentos vinculados a casos

### Plazos y Calendario
- **Calendario visual mensual sincronizado con Outlook** (chips de plazos LEX y eventos Outlook)
- Crear/editar plazos con fecha, hora, estado
- **Notificar al cliente por correo** al agendar (casilla en el modal)
- SinC de plazos → Calendario Outlook automático
- Estados: Pendiente → Completado / Vencido

### Seguimiento
- Notas de seguimiento por caso, historial cronológico

### Facturación
- Facturas con cliente, monto en **CLP** (pesos chilenos), estados Pendiente/Pagada

### Documentación Legal
- Tipos: Contrato, Poder, Demanda, Contestación, Otros
- Generación desde plantillas

### Plazos Legales
- Categorías: Prescripción, Caducidad, Apelación, Revisión, etc.

### Notificaciones (Correo)
- **Tipos:** Agendamiento / Cita, Audiencia, Vencimiento de Plazo, Estado del Caso, Solicitud de Documentos, Personalizado
- Plantillas automáticas, envío por **Outlook** (primario) o **SMTP** (respaldo)
- Historial con estado de envío y reenvío

### Reportes
- Métricas y exportación visual

### Gestión de Usuarios
- Roles: Administrador, Abogado, Asistente, con permisos por sección

---

## Conexiones externas

### Microsoft Outlook (Calendar + Correo)
- Client ID: `084a3e9f-a9f4-43f7-89f9-d229cf97853e` (aplicación pública open source)
- Tenant: `consumers`
- Cuenta conectada: `lexconsiliumconsul@outlook.com`
- Sync de plazos → Calendario Outlook (activo por defecto)
- Correo vía Graph API (Outlook) con fallback SMTP

### Inteligencia Artificial (Gemini)
- Modelo: `gemini-3.6-flash` (Google Generative Language API)
- API key guardada en BD (configuración)

---

## Archivos principales

| Archivo | Función |
|---------|---------|
| `main.js` | Backend — IPC handlers, BD SQLite, Graph API Outlook, correo, **autoUpdater** |
| `renderer.js` | UI — navegación, formularios, calendario, gráficos, notificaciones, **banner de actualización** |
| `index.html` | Estructura — secciones, modales, dashboard LUX |
| `styles.css` | Estilos — tema oscuro + **estilos Glass/Lujo + banner updates** |
| `package.json` | Versión, dependencias (`electron`, `electron-builder`, `electron-updater`) y config de build/publish |
| `.gitignore` | Excluye `node_modules`, `dist_instalador`, BD y logs |
| `README.md` | Este documento |

## Base de datos

Ubicación: `%APPDATA%\LEX\lex.db` (SQLite)

**Tablas:** `usuarios`, `casos`, `clientes`, `documentos`, `plazos`, `seguimiento`, `facturas`, `doclegales`, `plazoslegales`, `notificaciones`, `config`
**Claves de `config` en uso:** `ia_api_key`, `ia_modelo`, `outlook_*` (tokens/email/client_id/tenant/sync), `github_token`

---

## Empaquetado como .exe

```bash
npm run dist          # genera instalador NSIS (Setup) + portable
npm run dist:portable # solo portable
```

Salida en `dist_instalador/`. Para versionado correcto: subir la versión en `package.json` ANTES de compilar.

---

## Historial de versiones

| Versión | Fecha | Contenido |
|---------|-------|-----------|
| 1.6.1 | 2026-09-09 | **Icono del estudio** (`app_icon.ico`) en instalador, acceso directo de escritorio y barra de tareas |
| 1.6.0 | 2026-09-09 | **Correcciones**: script start compatible Windows, arranque de la app vía npm, Plazos Legales (lista vacía por doble indexación), Configuración sin banners SMTP/Outlook, gestión de usuarios restaurada |
| 1.5.0 | 2026-09-09 | **Actualizaciones automáticas** (electron-updater), banner de aviso de nueva versión, token GitHub privado, DB con `github_token`. Repo creado en GitHub, Release v1.5.0 publicada |
| 1.4.0 | 2026-09-09 | Empaquetado .exe inicial. **Dashboard Glass/Lujo** (esmeralda + dorado). **Calendario visual mensual** sincronizado con Outlook, **notificación automática al agendar** (tipo Agendamiento), moneda CLP, tablas con scroll horizontal, modal de notificación compacto, README |

### Ruta previa (antes de versionado formal)
1. Conexión a Outlook (application pública `084a3e9f-...`, tenant `consumers`, cuenta `lexconsiliumconsul@outlook.com`) — autorizada y funcional.
2. API key de Gemini `gemini-3.6-flash` configurada y verificada.
3. Corrección del envío de correo (Graph API: respuestas 202/204 sin cuerpo → `graphRequest` tolerante).
4. Moneda cambiada de Bs. a **CLP**.
5. Sección Configuración reducida a Gestión de Usuarios + Cerrar Sesión.

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `electron-builder` no se ejecuta | Usar `node node_modules/electron-builder/out/cli/cli.js --win` |
| App no se abre en desarrollo | Usar `electron.exe .` directamente (nada de `npm start`) |
| No aparecen los avisos de actualización | Verificar que es la versión instalada (no portable) y que la Release está publicada (no borrador) |
| La Release no se descarga | Confirmar los 3 assets y que el repo tiene `github_token` válido en la BD |
| No se envían correos | Verificar conexión Outlook en Configuración |
| API de IA no responde | Verificar API key y modelo en BD |
| Tabla sin columna Acciones | Scroll horizontal (ancho mínimo de tabla 860px) |

---

## Pendientes / Próximos pasos

- [ ] **App Android sincronizada** (Capacitor o Expo) — conversado, pendiente de decisión
- [ ] Ícono personalizado para la app (.ico) en el empaquetado
- [ ] Notificador perezoso de actualizaciones más visible (opcional)
- [ ] Publicar automáticamente usando solo `npm run dist -- --publish always` (verificado)

---

## Licencia

Uso interno — Estudio Jurídico CMR