# LEX — Sistema de Gestión Jurídica

Aplicación de escritorio para estudios de abogados. Gestión de casos, clientes, plazos, facturas, seguimiento, documentación legal y notificaciones por correo.

## Requisitos

- **Node.js** v18+
- **Electron** (incluido en `node_modules`)
- Cuenta Microsoft Outlook personal o empresarial (para calendario y correo)

## Instalación

```bash
cd LEX
npm install
```

## Ejecución

**IMPORTANTE:** No usar `npm start` — usar directamente el ejecutable de Electron:

```bash
cd node_modules\electron\dist
.\electron.exe .
```

O desde PowerShell:

```powershell
Start-Process "C:\Users\CASA\Desktop\TODOS LOS PROYECTOS\PROYECTO 5\LEX\node_modules\electron\dist\electron.exe" -WorkingDirectory "C:\Users\CASA\Desktop\TODOS LOS PROYECTOS\PROYECTO 5\LEX"
```

## Credenciales de acceso

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| admin | admin123 | Administrador |

## Funcionalidades principales

### Dashboard
- Estadísticas en tiempo real: total casos, casos activos, clientes, plazos pendientes/vencidos
- Gráficos de distribución por tipo y estado de caso
- Agenda del día: plazos locales + eventos de Outlook
- Salud del estudio (indicador general)

### Casos
- Crear, editar, eliminar casos
- Filtros por estado (Activo, Pendiente, Archivado)
- Número de caso generado automáticamente
- Detalle con seguimiento, documentos y plazos vinculados

### Clientes
- Registro de clientes con nombre, cédula/RIF, email, teléfono
- Asociación con casos

### Documentos
- Subir documentos vinculados a casos
- Vista previa y descarga
- Eliminación de archivos

### Plazos y Calendario
- **Calendario visual** sincronizado con Outlook (vista mensual)
- Crear/editar plazos con fecha, hora, estado
- **Notificación por correo al agendar**: casilla "Notificar al cliente por correo" que envía automáticamente un email tipo Agendamiento
- Cada plazo nuevo se sincroniza como evento en el Calendario de Outlook
- Estados: Pendiente → Completado / Vencido

### Seguimiento
- Agregar notas de seguimiento vinculadas a un caso
- Historial cronológico por caso

### Facturación
- Registrar facturas con cliente, monto (CLP), estado
- Estados: Pendiente, Pagada
- Montos con formato de pesos chilenos

### Documentación Legal
- Tipos: Contrato, Poder, Demanda, Contestación, Otros
- Generación automática de documentos legales a partir de plantillas

### Plazos Legales
- Plazos con categorías: Prescripción, Caducidad, Apelación, Revisión, etc.
- Estados: Vigente, Vencido, Prorrogado

### Notificaciones (Correo)
- **Tipos disponibles:** Agendamiento / Cita, Audiencia, Vencimiento de Plazo, Estado del Caso, Solicitud de Documentos, Personalizado
- Plantillas automáticas por tipo
- Envío por **Outlook** (primario) o **SMTP** (respaldo)
- Reenvío de correos desde el historial
- Historial completo con estado de envío

### Reportes
- Estadísticas y métricas del estudio
- Exportación a formato visual

### Gestión de Usuarios
- Crear, editar y eliminar usuarios
- Roles: Administrador, Abogado, Asistente
- Control de permisos por sección

---

## Conexiones externas

### Microsoft Outlook (Calendar + Correo)
- Client ID: `084a3e9f-a9f4-43f7-89f9-d229cf97853e` (aplicación pública open source)
- Tenant: `consumers`
- Cuenta conectada: `lexconsiliumconsul@outlook.com`
- **Sync de plazos → Calendario Outlook** activo por defecto
- Envío de correo vía Graph API (Outlook) con fallback SMTP

### Inteligencia Artificial (Gemini)
- Modelo: `gemini-3.6-flash` (Google Generative Language API)
- API key guardada en BD (configuración)

---

## Archivos principales

| Archivo | Función |
|---------|---------|
| `main.js` | Backend Electron — IPC handlers, BD SQLite, Graph API Outlook, envío de correo |
| `renderer.js` | Lógica de interfaz — navegación, formularios, calendario, gráficos, notificaciones |
| `index.html` | Estructura HTML — todas las secciones, modales, formularios |
| `styles.css` | Estilos — tema oscuro, cards, tablas, calendario, badges |
| `package.json` | Dependencias — electron, electron-builder |

## Base de datos

Ubicación: `%APPDATA%\LEX\lex.db` (SQLite)

**Tablas principales:**
- `usuarios` — acceso y roles
- `casos` — expedientes jurídicos
- `clientes` — datos de clientes
- `documentos` — archivos vinculados
- `plazos` — fechas límite + outlook_event_id
- `seguimiento` — notas de seguimiento
- `facturas` — facturación
- `doclegales` — documentación legal generada
- `plazoslegales` — plazos legales especiales
- `notificaciones` — historial de correos enviados
- `config` — configuración del sistema (IA, Outlook, SMTP)

---

## Empaquetado como .exe

```bash
npm run dist
```

Usa `electron-builder` para generar instalador Windows.

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| `npm start` no funciona | Usar directamente `electron.exe .` |
| No se envían correos | Verificar conexión Outlook en Configuración |
| API de IA no responde | Verificar API key y modelo en BD |
| Tabla sin columna Acciones | Aumentar ancho de ventana o scroll horizontal |
| Plazos no se ven en calendario | Verificar que sync Outlook está activo |

---

## Licencia

Uso interno — Estudio Jurídico CMR
