const { ipcRenderer } = require('electron');

let currentSection = 'dashboard';
let currentUser = null;
let updateBannerDismissed = false;

// ==================== AVISOS DE ACTUALIZACIÓN ====================
function showUpdateBanner(message, btnText, btnAction) {
  if (updateBannerDismissed) return;
  let banner = document.getElementById('updateBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'updateBanner';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <div class="update-banner-icon">🚀</div>
    <div class="update-banner-msg">${message}</div>
    <button class="update-banner-btn" id="updateBannerBtn">${btnText}</button>
    <button class="update-banner-close" id="updateBannerClose">✕</button>
  `;
  banner.classList.add('active');
  const closeBtn = document.getElementById('updateBannerClose');
  if (closeBtn) closeBtn.onclick = () => { updateBannerDismissed = true; banner.classList.remove('active'); };
  const btn = document.getElementById('updateBannerBtn');
  if (btn && btnAction) btn.onclick = btnAction;
}

ipcRenderer.on('update-available', (e, version) => {
  showUpdateBanner(`Nueva versión ${version} disponible. Descargando...`, '', null);
});

ipcRenderer.on('update-downloaded', (e, version) => {
  updateBannerDismissed = false;
  showUpdateBanner(`Versión ${version} descargada. Reinicia LEX para aplicar la actualización.`, 'Reiniciar', () => ipcRenderer.invoke('restartApp'));
});

ipcRenderer.on('update-error', (e, err) => {
  console.warn('Update check error:', err);
});

// ==================== AUTENTICACIÓN ====================
async function checkAuth() {
  const user = await ipcRenderer.invoke('getCurrentUser');
  if (user) {
    currentUser = user;
    showApp();
    updateUserDisplay();
    applyPermissions();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
}

async function handleLogin(e) {
  e.preventDefault();
  const usuario = document.getElementById('loginUsuario').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');
  
  const result = await ipcRenderer.invoke('login', usuario, password);
  if (result.success) {
    currentUser = result.user;
    errorDiv.style.display = 'none';
    showApp();
    updateUserDisplay();
    applyPermissions();
    loadDashboard();
  } else {
    errorDiv.textContent = result.error;
    errorDiv.style.display = 'block';
  }
}

function updateUserDisplay() {
  if (!currentUser) return;
  const initials = currentUser.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.querySelectorAll('.avatar, .avatar-small').forEach(el => el.textContent = initials);
  document.querySelectorAll('.user-name, .user-dropdown').forEach(el => el.textContent = currentUser.nombre);
  document.querySelectorAll('.user-role, .user-role-header').forEach(el => {
    const roles = { administrador: 'ADMINISTRADOR', abogado: 'ABOGADO', asistente: 'ASISTENTE' };
    el.textContent = roles[currentUser.rol] || currentUser.rol.toUpperCase();
  });
}

async function handleLogout() {
  await ipcRenderer.invoke('logout');
  currentUser = null;
  showLogin();
  document.getElementById('loginUsuario').value = '';
  document.getElementById('loginPassword').value = '';
}

// ==================== PERMISOS ====================
const permisos = {
  administrador: ['dashboard', 'casos', 'clientes', 'documentos', 'plazos', 'seguimiento', 'facturacion', 'doclegales', 'plazoslegales', 'notificaciones', 'reportes', 'configuracion'],
  abogado: ['dashboard', 'casos', 'clientes', 'documentos', 'plazos', 'seguimiento', 'facturacion', 'doclegales', 'plazoslegales', 'notificaciones', 'reportes'],
  asistente: ['dashboard', 'casos', 'clientes', 'documentos', 'plazos', 'seguimiento']
};

function applyPermissions() {
  if (!currentUser) return;
  const allowed = permisos[currentUser.rol] || permisos.asistente;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const section = btn.dataset.section;
    if (!allowed.includes(section)) {
      btn.style.display = 'none';
    } else {
      btn.style.display = 'flex';
    }
  });
  const configBtns = document.querySelectorAll('[onclick*="configuracion"]');
  configBtns.forEach(btn => {
    btn.style.display = allowed.includes('configuracion') ? '' : 'none';
  });
}

function hasPermission(section) {
  if (!currentUser) return false;
  const allowed = permisos[currentUser.rol] || permisos.asistente;
  return allowed.includes(section);
}

function isAdmin() {
  return currentUser && currentUser.rol === 'administrador';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSection = btn.dataset.section;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(currentSection).classList.add('active');
    loadSection(currentSection);
  });
});

function navigateTo(section) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.section === section) b.classList.add('active');
  });
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(section).classList.add('active');
  currentSection = section;
  loadSection(section);
}

function loadSection(section) {
  switch(section) {
    case 'dashboard': loadDashboard(); break;
    case 'casos': loadCasos(); break;
    case 'clientes': loadClientes(); break;
    case 'documentos': loadDocumentos(); break;
    case 'plazos': loadPlazos(); loadCalendario(); break;
    case 'seguimiento': loadSeguimientoList(); break;
    case 'facturacion': loadFacturas(); break;
    case 'doclegales': loadDocLegales(); break;
    case 'plazoslegales': loadPlazosLegales(); break;
    case 'notificaciones': loadNotificaciones(); break;
    case 'reportes': loadReportes(); break;
    case 'configuracion': loadConfiguracion(); break;
  }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  const stats = await ipcRenderer.invoke('getEstadisticas');
  document.getElementById('totalCasos').textContent = stats.totalCasos;
  document.getElementById('casosActivos').textContent = stats.casosActivos;
  document.getElementById('totalClientes').textContent = stats.totalClientes;

  // Salud del estudio
  const totalPlazos = stats.plazosPendientes;
  const casosInactivos = stats.totalCasos - stats.casosActivos;
  const plazosVencidos = stats.plazosVencidos || 0;
  let salud = 'ÓPTIMO';
  let saludClass = 'green';
  if (plazosVencidos > 0) { salud = 'CRÍTICO'; saludClass = 'red'; }
  else if (totalPlazos > 5) { salud = 'ALERTA'; saludClass = 'yellow'; }
  else if (casosInactivos > stats.casosActivos && stats.totalCasos > 0) { salud = 'ATENCIÓN'; saludClass = 'yellow'; }
  
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  if (statusDot && statusText) {
    statusDot.className = 'status-dot ' + saludClass;
    statusText.className = 'status-text ' + saludClass;
    statusText.textContent = salud;
  }

  // Radar de vencimientos (próximas 48h)
  const plazos = await ipcRenderer.invoke('getPlazos');
  const ahora = new Date();
  const en48h = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
  const radarPlazos = plazos.filter(p => {
    if (p.estado === 'Completado') return false;
    const fecha = new Date(p.fecha_limite);
    return fecha <= en48h;
  });

  const radarContainer = document.getElementById('radarContent');
  if (radarPlazos.length === 0) {
    radarContainer.innerHTML = '<div class="radar-empty"><span class="radar-icon">📡</span><h4>Radar despejado</h4><p>No hay plazos procesales ni vencimientos pendientes para las próximas 48 horas.</p></div>';
  } else {
    radarContainer.innerHTML = '<div class="radar-list">' + radarPlazos.map(p => {
      const fecha = new Date(p.fecha_limite);
      const diff = fecha - ahora;
      const horas = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      let urgencia = 'badge-pendiente';
      if (horas < 6) urgencia = 'badge-vencido';
      else if (horas < 12) urgencia = 'badge-proceso';
      return `<div class="radar-item"><div><strong>${escapeHtml(p.titulo)}</strong><br><span class="list-item-sub">${escapeHtml(p.caso_titulo)} • ${formatDate(p.fecha_limite)} ${p.hora || ''}</span></div><span class="badge ${urgencia}">${horas}h ${mins}m</span></div>`;
    }).join('') + '</div>';
  }

  // Agenda de hoy (plazos locales + eventos de Outlook)
  const proximosPlazos = plazos.filter(p => p.estado !== 'Completado').slice(0, 5);
  const plazosContainer = document.getElementById('proximosPlazos');
  const agendaCount = document.getElementById('agendaCount');

  let eventosOutlook = [];
  try {
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyFin = new Date();
    hoyFin.setHours(23, 59, 59, 999);
    const resOutlook = await ipcRenderer.invoke('getOutlookEvents', hoyInicio.toISOString(), hoyFin.toISOString());
    if (resOutlook && resOutlook.success) eventosOutlook = resOutlook.eventos || [];
  } catch (e) { eventosOutlook = []; }

  const totalAgenda = proximosPlazos.length + eventosOutlook.length;
  if (agendaCount) agendaCount.textContent = `${totalAgenda} Eventos`;

  if (proximosPlazos.length === 0 && eventosOutlook.length === 0) {
    plazosContainer.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📅</span><h4>Sin compromisos hoy</h4><p>No hay plazos o audiencias programadas para hoy.</p></div>';
  } else {
    const items = proximosPlazos.map(p => `
      <div class="list-item">
        <div>
          <div class="list-item-title">${escapeHtml(p.titulo)}</div>
          <div class="list-item-sub">${escapeHtml(p.caso_titulo)} • ${formatDate(p.fecha_limite)}</div>
        </div>
        <span class="badge badge-${getEstadoClass(p.estado)}">${p.estado}</span>
      </div>
    `);
    eventosOutlook.forEach(e => {
      const fecha = e.start ? new Date(e.start) : null;
      const hora = fecha ? fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      items.push(`
      <div class="list-item" style="border-color: rgba(0,120,215,0.5);">
        <div>
          <div class="list-item-title">🗓️ ${escapeHtml(e.subject)}</div>
          <div class="list-item-sub">Outlook • Hoy ${hora ? 'a las ' + hora : ''}</div>
        </div>
        <span class="badge badge-proceso">Outlook</span>
      </div>
      `);
    });
    plazosContainer.innerHTML = items.join('');
  }
}

// ==================== CASOS ====================
async function loadCasos() {
  const casos = await ipcRenderer.invoke('getCasos');
  renderCasos(casos);
}

function renderCasos(casos) {
  const tbody = document.getElementById('casosTable');
  if (casos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay casos registrados</td></tr>';
    return;
  }
  tbody.innerHTML = casos.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.numero_caso)}</strong></td>
      <td>${escapeHtml(c.titulo)}</td>
      <td>${escapeHtml(c.cliente_nombre) || '-'}</td>
      <td>${escapeHtml(c.tipo) || '-'}</td>
      <td><span class="badge badge-${getEstadoClass(c.estado)}">${escapeHtml(c.estado)}</span></td>
      <td>${escapeHtml(c.abogado) || '-'}</td>
      <td>${formatDate(c.fecha_apertura)}</td>
      <td class="actions">
        <button class="btn btn-primary btn-sm" onclick="openSeguimiento(${c.id})" title="Seguimiento">📝</button>
        <button class="btn btn-secondary btn-sm" onclick="notificarClienteCaso(${c.cliente_id}, ${c.id})" title="Enviar correo">✉️</button>
        <button class="btn btn-secondary btn-sm" onclick="editCaso(${c.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCaso(${c.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function openCasoModal(caso = null) {
  await loadClientesSelect();
  document.getElementById('casoModalTitle').textContent = caso ? 'Editar Caso' : 'Nuevo Caso';
  document.getElementById('casoId').value = caso ? caso.id : '';
  if (caso) {
    document.getElementById('casoNumero').value = caso.numero_caso;
    document.getElementById('casoTitulo').value = caso.titulo;
    document.getElementById('casoCliente').value = caso.cliente_id || '';
    document.getElementById('casoTipo').value = caso.tipo || '';
    document.getElementById('casoEstado').value = caso.estado;
    document.getElementById('casoAbogado').value = caso.abogado || '';
    document.getElementById('casoDescripcion').value = caso.descripcion || '';
  } else {
    const nuevoNumero = await ipcRenderer.invoke('generarNumeroCaso');
    document.getElementById('casoNumero').value = nuevoNumero;
    document.getElementById('casoTitulo').value = '';
    document.getElementById('casoCliente').value = '';
    document.getElementById('casoTipo').value = '';
    document.getElementById('casoEstado').value = 'Activo';
    document.getElementById('casoAbogado').value = '';
    document.getElementById('casoDescripcion').value = '';
  }
  document.getElementById('casoModal').classList.add('active');
}

async function editCaso(id) {
  const casos = await ipcRenderer.invoke('getCasos');
  const caso = casos.find(c => c.id === id);
  if (caso) openCasoModal(caso);
}

async function saveCaso(e) {
  e.preventDefault();
  const caso = {
    id: document.getElementById('casoId').value || null,
    titulo: document.getElementById('casoTitulo').value,
    cliente_id: document.getElementById('casoCliente').value || null,
    tipo: document.getElementById('casoTipo').value,
    estado: document.getElementById('casoEstado').value,
    abogado: document.getElementById('casoAbogado').value,
    descripcion: document.getElementById('casoDescripcion').value
  };
  if (caso.id) {
    await ipcRenderer.invoke('updateCaso', caso);
  } else {
    await ipcRenderer.invoke('addCaso', caso);
  }
  closeModal('casoModal');
  loadCasos();
}

async function deleteCaso(id) {
  if (confirm('¿Está seguro de eliminar este caso?')) {
    await ipcRenderer.invoke('deleteCaso', id);
    loadCasos();
  }
}

async function notificarClienteCaso(clienteId, casoId) {
  if (!clienteId) {
    alert('Este caso no tiene un cliente asignado. Asigne un cliente primero.');
    return;
  }
  openNotifModal(casoId, clienteId);
}

// ==================== CLIENTES ====================
async function loadClientes() {
  const clientes = await ipcRenderer.invoke('getClientes');
  renderClientes(clientes);
}

function renderClientes(clientes) {
  const tbody = document.getElementById('clientesTable');
  if (clientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay clientes registrados</td></tr>';
    return;
  }
  tbody.innerHTML = clientes.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.nombre)}</strong></td>
      <td>${escapeHtml(c.cedula) || '-'}</td>
      <td>${escapeHtml(c.telefono) || '-'}</td>
      <td>${escapeHtml(c.email) || '-'}</td>
      <td>${escapeHtml(c.direccion) || '-'}</td>
      <td>${formatDate(c.fecha_registro)}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="editCliente(${c.id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCliente(${c.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function openClienteModal(cliente = null) {
  document.getElementById('clienteModalTitle').textContent = cliente ? 'Editar Cliente' : 'Nuevo Cliente';
  document.getElementById('clienteId').value = cliente ? cliente.id : '';
  document.getElementById('clienteNombre').value = cliente ? cliente.nombre : '';
  document.getElementById('clienteCedula').value = cliente ? cliente.cedula || '' : '';
  document.getElementById('clienteTelefono').value = cliente ? cliente.telefono || '' : '';
  document.getElementById('clienteEmail').value = cliente ? cliente.email || '' : '';
  document.getElementById('clienteDireccion').value = cliente ? cliente.direccion || '' : '';
  document.getElementById('clienteModal').classList.add('active');
}

async function editCliente(id) {
  const clientes = await ipcRenderer.invoke('getClientes');
  const cliente = clientes.find(c => c.id === id);
  if (cliente) openClienteModal(cliente);
}

async function saveCliente(e) {
  e.preventDefault();
  const cliente = {
    id: document.getElementById('clienteId').value || null,
    nombre: document.getElementById('clienteNombre').value,
    cedula: document.getElementById('clienteCedula').value,
    telefono: document.getElementById('clienteTelefono').value,
    email: document.getElementById('clienteEmail').value,
    direccion: document.getElementById('clienteDireccion').value
  };
  if (cliente.id) {
    await ipcRenderer.invoke('updateCliente', cliente);
  } else {
    await ipcRenderer.invoke('addCliente', cliente);
  }
  closeModal('clienteModal');
  loadClientes();
}

async function deleteCliente(id) {
  if (confirm('¿Está seguro de eliminar este cliente?')) {
    await ipcRenderer.invoke('deleteCliente', id);
    loadClientes();
  }
}

// ==================== DOCUMENTOS ====================
async function loadDocumentos() {
  const documentos = await ipcRenderer.invoke('getDocumentos');
  const tbody = document.getElementById('documentosTable');
  if (documentos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay documentos registrados</td></tr>';
    return;
  }
  const casos = await ipcRenderer.invoke('getCasos');
  tbody.innerHTML = documentos.map(d => {
    const caso = casos.find(c => c.id === d.caso_id);
    return `
      <tr>
        <td><strong>${escapeHtml(d.nombre)}</strong></td>
        <td>${escapeHtml(d.tipo) || '-'}</td>
        <td>${caso ? escapeHtml(caso.titulo) : '-'}</td>
        <td>${formatDate(d.fecha_subida)}</td>
        <td class="actions">
          <button class="btn btn-danger btn-sm" onclick="deleteDocumento(${d.id})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openDocumentoModal() {
  await loadCasosSelect('docCaso');
  document.getElementById('docNombre').value = '';
  document.getElementById('docRuta').value = '';
  document.getElementById('documentoModal').classList.add('active');
}

async function selectFile() {
  const ruta = await ipcRenderer.invoke('selectFile');
  if (ruta) document.getElementById('docRuta').value = ruta;
}

async function saveDocumento(e) {
  e.preventDefault();
  const doc = {
    caso_id: document.getElementById('docCaso').value,
    nombre: document.getElementById('docNombre').value,
    tipo: document.getElementById('docTipo').value,
    ruta: document.getElementById('docRuta').value
  };
  await ipcRenderer.invoke('addDocumento', doc);
  closeModal('documentoModal');
  loadDocumentos();
}

async function deleteDocumento(id) {
  if (confirm('¿Está seguro de eliminar este documento?')) {
    await ipcRenderer.invoke('deleteDocumento', id);
    loadDocumentos();
  }
}

// ==================== CALENDARIO AGENDA ====================
let calendarioAnio = new Date().getFullYear();
let calendarioMes = new Date().getMonth();
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

async function loadCalendario() {
  const anio = calendarioAnio, mes = calendarioMes;
  const mesEl = document.getElementById('calendarioMesActual');
  if (mesEl) {
    const nombre = new Date(anio, mes, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    mesEl.textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }

  const plazos = await ipcRenderer.invoke('getPlazos');
  const inicio = new Date(anio, mes, 1);
  const fin = new Date(anio, mes + 1, 0, 23, 59, 59, 999);
  let eventosOutlook = [];
  try {
    const res = await ipcRenderer.invoke('getOutlookEvents', inicio.toISOString(), fin.toISOString());
    if (res && res.success) eventosOutlook = res.eventos || [];
  } catch (e) { eventosOutlook = []; }

  const porDia = {};
  plazos.forEach(p => {
    if (!p.fecha_limite) return;
    const d = String(p.fecha_limite).split('T')[0];
    (porDia[d] = porDia[d] || []).push({ tipo: 'plazo', item: p });
  });
  eventosOutlook.forEach(ev => {
    if (!ev.start) return;
    const f = new Date(ev.start);
    const d = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    (porDia[d] = porDia[d] || []).push({ tipo: 'outlook', item: ev });
  });

  renderCalendario(anio, mes, porDia);
}

function cambiarMesCalendario(step) {
  const d = new Date(calendarioAnio, calendarioMes + step, 1);
  calendarioAnio = d.getFullYear();
  calendarioMes = d.getMonth();
  loadCalendario();
}

function renderCalendario(anio, mes, porDia) {
  const container = document.getElementById('calendarioAgenda');
  const primerDia = new Date(anio, mes, 1).getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const hoy = new Date();
  const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  let html = '<div class="calendario-grid">';
  DIAS_SEMANA.forEach(d => html += `<div class="calendario-day-header">${d}</div>`);
  for (let i = 0; i < primerDia; i++) html += '<div class="calendario-dia empty"></div>';
  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaStr = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const esHoy = fechaStr === hoyStr;
    let chips = '';
    (porDia[fechaStr] || []).forEach(ev => {
      if (ev.tipo === 'plazo') {
        chips += `<span class="calendario-chip chip-plazo" onclick="openPlazoModal(${ev.item.id})" title="Plazo: ${escapeHtml(ev.item.titulo)}">${escapeHtml(ev.item.titulo)}</span>`;
      } else {
        chips += `<span class="calendario-chip chip-outlook" title="Outlook: ${escapeHtml(ev.item.subject)}">${escapeHtml(ev.item.subject)}</span>`;
      }
    });
    html += `<div class="calendario-dia${esHoy ? ' hoy' : ''}">
      <div class="calendario-dia-num">${dia}</div>
      <div class="calendario-chip-list">${chips}</div>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// ==================== PLAZOS ====================
async function loadPlazos() {
  const plazos = await ipcRenderer.invoke('getPlazos');
  const tbody = document.getElementById('plazosTable');
  if (plazos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay plazos registrados</td></tr>';
    return;
  }
  tbody.innerHTML = plazos.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.titulo)}</strong></td>
      <td>${escapeHtml(p.caso_titulo)}</td>
      <td>${formatDate(p.fecha_limite)}</td>
      <td>${escapeHtml(p.hora) || '-'}</td>
      <td><span class="badge badge-${getEstadoClass(p.estado)}">${escapeHtml(p.estado)}</span></td>
      <td>${escapeHtml(p.notas) || '-'}</td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" onclick="editPlazo(${p.id})" title="Editar">✏️</button>
        <button class="btn btn-secondary btn-sm" onclick="notificarPlazo(${p.id})" title="Enviar correo">✉️</button>
        <button class="btn btn-secondary btn-sm" onclick="togglePlazoEstado(${p.id}, '${escapeHtml(p.estado)}')">✓</button>
        <button class="btn btn-danger btn-sm" onclick="deletePlazo(${p.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function openPlazoModal(plazo = null) {
  await loadCasosSelect('plazoCaso');
  document.getElementById('plazoModalTitle').textContent = plazo ? 'Editar Plazo' : 'Nuevo Plazo';
  document.getElementById('plazoId').value = plazo ? plazo.id : '';
  document.getElementById('plazoNotificar').checked = false;
  if (plazo) {
    document.getElementById('plazoCaso').value = plazo.caso_id || '';
    document.getElementById('plazoTitulo').value = plazo.titulo || '';
    document.getElementById('plazoFecha').value = plazo.fecha_limite ? plazo.fecha_limite.split('T')[0] : '';
    document.getElementById('plazoHora').value = plazo.hora || '';
    document.getElementById('plazoEstado').value = plazo.estado || 'Pendiente';
    document.getElementById('plazoNotas').value = plazo.notas || '';
  } else {
    document.getElementById('plazoTitulo').value = '';
    document.getElementById('plazoFecha').value = '';
    document.getElementById('plazoHora').value = '';
    document.getElementById('plazoEstado').value = 'Pendiente';
    document.getElementById('plazoNotas').value = '';
  }
  document.getElementById('plazoModal').classList.add('active');
}

async function editPlazo(id) {
  const plazos = await ipcRenderer.invoke('getPlazos');
  const plazo = plazos.find(p => p.id === id);
  if (plazo) openPlazoModal(plazo);
}

async function savePlazo(e) {
  e.preventDefault();
  const esNuevo = !document.getElementById('plazoId').value;
  const notificar = document.getElementById('plazoNotificar').checked;
  const plazo = {
    id: esNuevo ? null : document.getElementById('plazoId').value,
    caso_id: document.getElementById('plazoCaso').value,
    titulo: document.getElementById('plazoTitulo').value,
    fecha_limite: document.getElementById('plazoFecha').value,
    hora: document.getElementById('plazoHora').value,
    estado: document.getElementById('plazoEstado').value,
    notas: document.getElementById('plazoNotas').value
  };
  if (esNuevo) {
    await ipcRenderer.invoke('addPlazo', plazo);
    if (notificar && plazo.caso_id) {
      await notificarAgendamiento(plazo);
    }
  } else {
    await ipcRenderer.invoke('updatePlazo', plazo);
  }
  closeModal('plazoModal');
  loadPlazos();
  loadCalendario();
}

async function notificarAgendamiento(plazo) {
  const casos = await ipcRenderer.invoke('getCasos');
  const caso = casos.find(c => c.id == plazo.caso_id);
  if (!caso || !caso.cliente_id) {
    alert('El caso no tiene un cliente asignado; el plazo se guardó sin correo.');
    return;
  }
  const clientes = await ipcRenderer.invoke('getClientes');
  const cliente = clientes.find(c => c.id == caso.cliente_id);
  if (!cliente || !cliente.email) {
    alert('El cliente no tiene correo registrado; el plazo se guardó sin notificación.');
    return;
  }
  const fecha = formatDate(plazo.fecha_limite);
  const hora = plazo.hora ? ` a las ${plazo.hora}` : '';
  const mensaje = `Estimado/a ${cliente.nombre}, le informamos que se ha programado una cita/agendamiento "${plazo.titulo}" de su caso ${caso.numero_caso} - ${caso.titulo} para el ${fecha}${hora}. Atentamente, CMR Jurídico.`;
  const asunto = `LEX - Agendamiento - ${caso.titulo}`;
  const res = await ipcRenderer.invoke('enviarEmail', cliente.email, asunto, mensaje);
  await ipcRenderer.invoke('addNotificacion', {
    caso_id: caso.id, cliente_id: cliente.id, tipo: 'Agendamiento', mensaje,
    email: cliente.email, canal: res.success ? res.canal || 'Outlook' : '', estado: res.success ? 'Enviado' : 'Fallido'
  });
  if (res.success) {
    alert(`✓ Correo de agendamiento enviado a ${cliente.email}`);
  } else {
    alert(`El plazo se guardó pero no se pudo enviar el correo:\n${res.error}`);
  }
}

async function togglePlazoEstado(id, estadoActual) {
  const nuevoEstado = estadoActual === 'Completado' ? 'Pendiente' : 'Completado';
  await ipcRenderer.invoke('updatePlazo', { id, estado: nuevoEstado });
  loadPlazos();
}

async function deletePlazo(id) {
  if (confirm('¿Está seguro de eliminar este plazo?')) {
    await ipcRenderer.invoke('deletePlazo', id);
    loadPlazos();
  }
}

async function notificarPlazo(plazoId) {
  const plazos = await ipcRenderer.invoke('getPlazos');
  const plazo = plazos.find(p => p.id === plazoId);
  if (!plazo) return;
  const casos = await ipcRenderer.invoke('getCasos');
  const caso = casos.find(c => c.id === plazo.caso_id);
  if (!caso || !caso.cliente_id) {
    alert('El caso no tiene un cliente asignado.');
    return;
  }
  openNotifModal(caso.id, caso.cliente_id);
  document.getElementById('notifTipo').value = 'Plazo';
  const fechaPlazo = formatDate(plazo.fecha_limite);
  const horaPlazo = plazo.hora ? ` a las ${plazo.hora}` : '';
  document.getElementById('notifMensaje').value = 
    `Estimado/a cliente, le recordamos que el plazo "${plazo.titulo}" de su caso ${caso.numero_caso} - ${caso.titulo} vence el ${fechaPlazo}${horaPlazo}. Por favor, tome las acciones necesarias. Atentamente, CMR Jurídico.`;
}

// ==================== SEGUIMIENTO ====================
async function loadSeguimientoList() {
  const casos = await ipcRenderer.invoke('getCasos');
  const tbody = document.getElementById('seguimientoTable');
  if (casos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay casos registrados. Cree un caso primero.</td></tr>';
    return;
  }
  const allNotas = [];
  for (const c of casos) {
    const notas = await ipcRenderer.invoke('getSeguimiento', c.id);
    if (notas.length > 0) {
      allNotas.push({ caso: c, notas: notas, ultimaNota: notas[0] });
    }
  }
  if (allNotas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay seguimientos registrados. Abra un caso y agregue notas.</td></tr>';
    return;
  }
  tbody.innerHTML = allNotas.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.caso.numero_caso)}</strong></td>
      <td>${escapeHtml(item.caso.titulo)}</td>
      <td>${escapeHtml(item.ultimaNota.nota).substring(0, 60)}${item.ultimaNota.nota.length > 60 ? '...' : ''}</td>
      <td>${formatDate(item.ultimaNota.fecha)}</td>
    </tr>
  `).join('');
}

async function openSeguimiento(casoId) {
  const casos = await ipcRenderer.invoke('getCasos');
  const caso = casos.find(c => c.id === casoId);
  if (!caso) return;

  document.getElementById('seguimientoCasoId').value = casoId;
  document.getElementById('seguimientoCasoTitle').textContent = `${caso.numero_caso} - ${caso.titulo}`;
  document.getElementById('seguimientoNota').value = '';

  const notas = await ipcRenderer.invoke('getSeguimiento', casoId);
  const container = document.getElementById('seguimientoNotas');
  
  if (notas.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-state-icon">📝</span><h4>Sin notas</h4><p>Agregue la primera nota de seguimiento.</p></div>';
  } else {
    container.innerHTML = notas.map(n => `
      <div class="seguimiento-item">
        <div class="seguimiento-header">
          <span class="seguimiento-autor">${escapeHtml(n.autor) || 'Sistema'}</span>
          <span class="seguimiento-fecha">${formatDate(n.fecha)}</span>
        </div>
        <div class="seguimiento-texto">${escapeHtml(n.nota)}</div>
      </div>
    `).join('');
  }

  document.getElementById('seguimientoModal').classList.add('active');
}

async function saveSeguimiento(e) {
  e.preventDefault();
  const casoId = document.getElementById('seguimientoCasoId').value;
  const nota = document.getElementById('seguimientoNota').value.trim();
  if (!nota) return;

  await ipcRenderer.invoke('addSeguimiento', {
    caso_id: parseInt(casoId),
    nota: nota,
    autor: 'CMR'
  });

  document.getElementById('seguimientoNota').value = '';
  openSeguimiento(parseInt(casoId));
}

// ==================== NOTIFICACIONES ====================
async function loadNotificaciones() {
  const notifs = await ipcRenderer.invoke('getNotificaciones');
  const tbody = document.getElementById('notificacionesTable');
  if (notifs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay notificaciones enviadas</td></tr>';
    return;
  }
  tbody.innerHTML = notifs.map(n => `
    <tr>
      <td>${formatDate(n.fecha)}</td>
      <td><span class="badge badge-${getTipoNotifClass(n.tipo)}">${escapeHtml(n.tipo)}</span></td>
      <td>${escapeHtml(n.cliente_nombre) || '-'}</td>
      <td>${escapeHtml(n.caso_titulo) || '-'}</td>
      <td>${escapeHtml(n.email) || '-'}</td>
      <td class="notif-msg">${escapeHtml(n.mensaje).substring(0, 80)}${n.mensaje.length > 80 ? '...' : ''}</td>
      <td><span class="badge badge-${getEstadoNotifClass(n.estado)}">${escapeHtml(n.estado)}${n.canal ? ' · ' + escapeHtml(n.canal) : ''}</span></td>
      <td class="actions">
        <button class="btn btn-secondary btn-sm" title="Reenviar correo" onclick="reenviarNotificacion(${n.id}, this.dataset.email, 'Reenvío LEX', this.dataset.msg)" data-email="${escapeHtml(n.email || '')}" data-msg="${escapeHtml(n.mensaje)}">✉️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteNotificacion(${n.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function openNotifModal(casoId = null, clienteId = null) {
  await loadCasosSelect('notifCaso');
  await loadClientesSelect('notifCliente');
  document.getElementById('notifTipo').value = 'Personalizado';
  document.getElementById('notifEmail').value = '';
  document.getElementById('notifMensaje').value = '';
  if (casoId) {
    document.getElementById('notifCaso').value = casoId;
    await cargarClienteCaso();
  }
  if (clienteId) {
    document.getElementById('notifCliente').value = clienteId;
    await cargarEmailCliente();
  }
  plantillaNotificacion();
  document.getElementById('notifModal').classList.add('active');
}

async function cargarClienteCaso() {
  const casoId = document.getElementById('notifCaso').value;
  if (!casoId) return;
  const clientes = await ipcRenderer.invoke('getClientes');
  const select = document.getElementById('notifCliente');
  select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
    clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

async function cargarEmailCliente() {
  const clienteId = document.getElementById('notifCliente').value;
  if (!clienteId) return;
  const clientes = await ipcRenderer.invoke('getClientes');
  const cliente = clientes.find(c => c.id == clienteId);
  if (cliente && cliente.email) {
    document.getElementById('notifEmail').value = cliente.email;
  }
}

async function plantillaNotificacion() {
  const tipo = document.getElementById('notifTipo').value;
  const casoId = document.getElementById('notifCaso').value;
  let casos = [];
  if (casoId) casos = await ipcRenderer.invoke('getCasos');
  const caso = casos.find(c => c.id == casoId);
  const nombreCaso = caso ? `${caso.numero_caso} - ${caso.titulo}` : '[Caso]';
  const plantillas = {
    'Agendamiento': `Estimado/a cliente, le informamos que se ha programado una cita referente al caso ${nombreCaso}. Le confirmaremos la fecha y hora por este medio. Atentamente, CMR Jurídico.`,
    'Audiencia': `Estimado/a cliente, le informamos que tiene programada una audiencia referente al caso ${nombreCaso}. Le solicitamos confirmar su asistencia. Atentamente, CMR Jurídico.`,
    'Plazo': `Estimado/a cliente, le recordamos que se aproxima un plazo importante en su caso ${nombreCaso}. Por favor, tome las acciones necesarias. Atentamente, CMR Jurídico.`,
    'Estado': `Estimado/a cliente, le comunicamos una actualización en el estado de su caso ${nombreCaso}. Para más detalles, favor contactar a su abogado. Atentamente, CMR Jurídico.`,
    'Solicitud': `Estimado/a cliente, necesitamos que nos proporcione documentación pendiente para su caso ${nombreCaso}. Favor enviar a la brevedad posible. Atentamente, CMR Jurídico.`,
    'Personalizado': ''
  };
  document.getElementById('notifMensaje').value = plantillas[tipo] || '';
}

async function sendNotificacion(e) {
  e.preventDefault();
  const tipo = document.getElementById('notifTipo').value || 'Personalizado';
  const casoId = document.getElementById('notifCaso').value || null;
  const clienteId = document.getElementById('notifCliente').value || null;
  const email = document.getElementById('notifEmail').value;
  const mensaje = document.getElementById('notifMensaje').value;
  const caso = casoId ? (await ipcRenderer.invoke('getCasos')).find(c => c.id == casoId) : null;
  const asunto = caso ? `LEX - ${tipo} - ${caso.titulo}` : `LEX - ${tipo}`;
  const res = await ipcRenderer.invoke('enviarEmail', email, asunto, mensaje);
  let estado;
  if (res.success) {
    estado = 'Enviado';
  } else {
    if (confirm(`No se pudo enviar el correo:\n${res.error}\n\n¿Abrir el programa de correo para hacerlo manualmente?`)) {
      window.open(`mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`);
      estado = 'Manual';
    } else {
      return;
    }
  }
  await ipcRenderer.invoke('addNotificacion', {
    caso_id: casoId, cliente_id: clienteId, tipo, mensaje, email, canal: res.canal || '', estado
  });
  closeModal('notifModal');
  loadNotificaciones();
}

async function reenviarNotificacion(id, email, asunto, mensaje) {
  const res = await ipcRenderer.invoke('enviarEmail', email, asunto, mensaje);
  if (res.success) {
    alert('Correo reenviado.');
  } else {
    alert(`No se pudo reenviar:\n${res.error}`);
  }
}

async function deleteNotificacion(id) {
  if (confirm('¿Eliminar esta notificación del historial?')) {
    await ipcRenderer.invoke('deleteNotificacion', id);
    loadNotificaciones();
  }
}

function getTipoNotifClass(tipo) {
  const classes = { 'Audiencia': 'activo', 'Plazo': 'vencido', 'Estado': 'proceso', 'Solicitud': 'pendiente', 'Personalizado': 'cerrado' };
  return classes[tipo] || 'pendiente';
}

function getEstadoNotifClass(estado) {
  if (!estado) return 'pendiente';
  if (estado === 'Enviado') return 'activo';
  return 'proceso';
}

// ==================== REPORTES ====================
async function loadReportes() {
  const stats = await ipcRenderer.invoke('getEstadisticas');
  const tipoContainer = document.getElementById('reporteTipo');
  const maxTipo = Math.max(...stats.porTipo.map(t => t.total), 1);
  tipoContainer.innerHTML = stats.porTipo.map(t => `
    <div class="reporte-item">
      <span>${escapeHtml(t.tipo) || 'Sin tipo'}</span>
      <div class="reporte-bar"><div class="reporte-bar-fill" style="width: ${(t.total / maxTipo) * 100}%"></div></div>
      <span>${t.total}</span>
    </div>
  `).join('') || '<div class="empty-state">No hay datos</div>';

  const estadoContainer = document.getElementById('reporteEstado');
  const maxEstado = Math.max(...stats.porEstado.map(e => e.total), 1);
  estadoContainer.innerHTML = stats.porEstado.map(e => `
    <div class="reporte-item">
      <span>${escapeHtml(e.estado)}</span>
      <div class="reporte-bar"><div class="reporte-bar-fill" style="width: ${(e.total / maxEstado) * 100}%"></div></div>
      <span>${e.total}</span>
    </div>
  `).join('') || '<div class="empty-state">No hay datos</div>';

  document.getElementById('reporteResumen').innerHTML = `
    <div class="reporte-item"><span>Total de Casos</span><strong>${stats.totalCasos}</strong></div>
    <div class="reporte-item"><span>Casos Activos</span><strong>${stats.casosActivos}</strong></div>
    <div class="reporte-item"><span>Total de Clientes</span><strong>${stats.totalClientes}</strong></div>
    <div class="reporte-item"><span>Plazos Pendientes</span><strong>${stats.plazosPendientes}</strong></div>
    <div class="reporte-item"><span>Plazos Vencidos</span><strong>${stats.plazosVencidos || 0}</strong></div>
  `;
}

// ==================== CUENTAS POR COBRAR ====================
async function loadFacturas() {
  const facturas = await ipcRenderer.invoke('getFacturas');
  const tbody = document.getElementById('facturasTable');
  const totalFac = facturas.reduce((s, f) => s + (f.monto || 0), 0);
  const totalPagado = facturas.reduce((s, f) => s + (f.pagado || 0), 0);
  const totalSaldo = facturas.reduce((s, f) => s + ((f.monto || 0) - (f.pagado || 0)), 0);
  const vencidas = facturas.filter(f => {
    if (!f.fecha_vencimiento || ['Pagada'].includes(f.estado)) return false;
    return new Date(f.fecha_vencimiento) < new Date();
  }).length;

  document.getElementById('totalFacturado').textContent = '$' + totalFac.toLocaleString('es-CL', { minimumFractionDigits: 0 });
  document.getElementById('totalCobrado').textContent = '$' + totalPagado.toLocaleString('es-CL', { minimumFractionDigits: 0 });
  document.getElementById('saldoPendiente').textContent = '$' + totalSaldo.toLocaleString('es-CL', { minimumFractionDigits: 0 });
  document.getElementById('facturasVencidas').textContent = vencidas;

  tbody.innerHTML = facturas.map(f => {
    const saldo = (f.monto || 0) - (f.pagado || 0);
    const vencida = f.fecha_vencimiento && !['Pagada'].includes(f.estado) && new Date(f.fecha_vencimiento) < new Date();
    const estadoClass = f.estado === 'Pagada' ? 'ok' : f.estado === 'Parcial' ? 'proceso' : vencida ? 'error' : 'pendiente';
    return `<tr ${vencida ? 'style="background: rgba(239,68,68,0.05);"' : ''}>
      <td><strong>${f.numero}</strong></td>
      <td>${escapeHtml(f.cliente_nombre || '-')}</td>
      <td>${escapeHtml(f.caso_titulo || '-')}</td>
      <td style="max-width: 180px;">${escapeHtml(f.concepto || '')}</td>
      <td>$${(f.monto || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</td>
      <td class="color-green">$${(f.pagado || 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</td>
      <td class="color-${saldo > 0 ? (vencida ? 'red' : 'yellow') : 'green'}"><strong>$${saldo.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</strong></td>
      <td>${f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : '-'}${vencida ? ' ⚠️' : ''}</td>
      <td><span class="badge badge-${estadoClass}">${f.estado}</span></td>
      <td>
        <button class="btn-icon" onclick="openPagoModal(${f.id})" title="Registrar Pago">💵</button>
        <button class="btn-icon" onclick="deleteFactura(${f.id})" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  }).join('');

  if (facturas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">No hay facturas registradas.</td></tr>';
  }
}

async function openFacturaModal() {
  await loadClientesSelect('facturaCliente');
  await loadCasosSelect('facturaCaso');
  document.getElementById('facturaConcepto').value = '';
  document.getElementById('facturaMonto').value = '';
  document.getElementById('facturaVencimiento').value = '';
  document.getElementById('facturaModal').classList.add('active');
}

function autofillFacturaCliente() {
  const casoSelect = document.getElementById('facturaCaso');
  const selected = casoSelect.options[casoSelect.selectedIndex];
  if (selected && selected.dataset.cliente) {
    document.getElementById('facturaCliente').value = selected.dataset.cliente;
  }
}

async function saveFactura(e) {
  e.preventDefault();
  const monto = parseFloat(document.getElementById('facturaMonto').value) || 0;
  if (monto <= 0) { alert('El monto debe ser mayor a cero.'); return; }
  const factura = {
    caso_id: document.getElementById('facturaCaso').value || null,
    cliente_id: document.getElementById('facturaCliente').value || null,
    concepto: document.getElementById('facturaConcepto').value,
    monto: monto,
    estado: 'Pendiente',
    fecha_vencimiento: document.getElementById('facturaVencimiento').value || null
  };
  const res = await ipcRenderer.invoke('addFactura', factura);
  if (res.lastId) {
    closeModal('facturaModal');
    await loadFacturas();
    alert('Factura creada.');
  } else {
    alert('Error al crear la factura.');
  }
}

async function deleteFactura(id) {
  if (!confirm('¿Eliminar esta factura y sus pagos?')) return;
  await ipcRenderer.invoke('deleteFactura', id);
  await loadFacturas();
}

async function openPagoModal(facturaId) {
  const facturas = await ipcRenderer.invoke('getFacturas');
  const factura = facturas.find(f => f.id === facturaId);
  if (!factura) return;
  const pagos = await ipcRenderer.invoke('getPagos', facturaId);
  document.getElementById('pagoFacturaId').value = facturaId;
  document.getElementById('pagoMonto').value = '';
  document.getElementById('pagoReferencia').value = '';
  const saldo = (factura.monto || 0) - (factura.pagado || 0);
  document.getElementById('pagoFacturaInfo').innerHTML = 
    `Factura <strong>N° ${factura.numero}</strong> · ${escapeHtml(factura.cliente_nombre || '')} · Monto: <strong>$${(factura.monto||0).toLocaleString('es-CL',{maximumFractionDigits:0})}</strong> · Saldo: <strong class="color-${saldo>0?'red':'green'}">$${saldo.toLocaleString('es-CL',{maximumFractionDigits:0})}</strong>`;
  document.getElementById('pagosLista').innerHTML = pagos.length
    ? pagos.map(p => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(59,130,246,0.1);"><span>${formatDate(p.fecha)} · ${escapeHtml(p.metodo || '')} · <small>${escapeHtml(p.referencia || '')}</small></span><strong>$${p.monto.toLocaleString('es-CL',{maximumFractionDigits:0})}</strong></div>`).join('')
    : '<p class="empty-state" style="padding:16px; text-align:center; color:#6b7280;">Sin pagos registrados aún.</p>';
  document.getElementById('pagoModal').classList.add('active');
}

async function savePago(e) {
  e.preventDefault();
  const facturaId = parseInt(document.getElementById('pagoFacturaId').value);
  const facturas = await ipcRenderer.invoke('getFacturas');
  const factura = facturas.find(f => f.id === facturaId);
  let monto = parseFloat(document.getElementById('pagoMonto').value);
  const saldo = (factura.monto || 0) - (factura.pagado || 0);
  if (monto > saldo) {
    if (!confirm(`El monto ($$${monto.toLocaleString('es-CL')}) supera el saldo ($$${saldo.toLocaleString('es-CL')}). ¿Registrar de todos modos?`)) return;
  }
  const pago = {
    factura_id: facturaId,
    monto: monto,
    metodo: document.getElementById('pagoMetodo').value,
    referencia: document.getElementById('pagoReferencia').value
  };
  await ipcRenderer.invoke('addPago', pago);
  closeModal('pagoModal');
  await loadFacturas();
  alert('Pago registrado.');
}

// ==================== GENERADOR DE DOCUMENTOS LEGALES ====================
async function loadDocLegales() {
  const docs = await ipcRenderer.invoke('getDocumentosGenerados');
  const tbody = document.getElementById('docLegalesTable');
  tbody.innerHTML = docs.map(d => {
    const tipoIcon = { demanda: '⚖️', poder: '🪪', contrato: '📄', inspeccion: '🔍', testimonial: '👥' }[d.tipo] || '📜';
    return `<tr>
      <td>${tipoIcon} <strong>${escapeHtml(d.titulo)}</strong></td>
      <td><span class="badge badge-activo">${escapeHtml(d.tipo || '')}</span></td>
      <td>${escapeHtml(d.caso_titulo || '-')}</td>
      <td>${formatDate(d.fecha_creacion)}</td>
      <td>
        <button class="btn-icon" onclick="verDocumento(${d.id})" title="Ver/Editar">👁️</button>
        <button class="btn-icon" onclick="deleteDocLegal(${d.id})" title="Eliminar">🗑️</button>
      </td>
    </tr>`;
  }).join('');
  if (docs.length === 0) tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No hay documentos generados.</td></tr>';
}

async function openGeneradorModal(tipo = '') {
  await loadCasosSelect('genCasoSelect');
  if (tipo) {
    document.getElementById('genTipoSelect').value = tipo;
  }
  document.getElementById('genTipo').value = document.getElementById('genTipoSelect').value;
  document.getElementById('genAbogado').value = '';
  document.getElementById('genIpsa').value = '';
  document.getElementById('genContraparte').value = '';
  document.getElementById('genTribunal').value = '';
  document.getElementById('genObjeto').value = '';
  const casoSel = document.getElementById('genCasoSelect');
  const usuario = currentUser || {};
  document.getElementById('genAbogado').value = usuario.nombre || '';
  document.getElementById('generadorModalTitle').textContent = 'Generar Documento Legal';
  document.getElementById('genContenido').value = '';
  document.getElementById('generadorModal').classList.add('active');
}

function selectTipoGenerador() {
  document.getElementById('genTipo').value = document.getElementById('genTipoSelect').value;
  document.getElementById('generadorModalTitle').textContent = 'Generar Documento Legal: ' + document.getElementById('genTipoSelect').options[document.getElementById('genTipoSelect').selectedIndex].text;
}

async function autoFillGenerador() {
  const casoId = document.getElementById('genCasoSelect').value;
  document.getElementById('genCasoId').value = casoId;
  if (casoId) {
    const casos = await ipcRenderer.invoke('getCasos');
    const caso = casos.find(c => c.id === parseInt(casoId));
    if (caso) {
      document.getElementById('genContraparte').value = caso.descripcion ? caso.descripcion : '';
      if (currentUser) document.getElementById('genAbogado').value = document.getElementById('genAbogado').value || caso.abogado || currentUser.nombre || '';
    }
  }
}

function openDocParaEditar(tipo, contenido) {
  document.getElementById('genTipoSelect').value = tipo || 'demanda';
  document.getElementById('genTipo').value = document.getElementById('genTipoSelect').value;
  document.getElementById('genContenido').value = contenido;
}

async function generarDocLegal(e) {
  e.preventDefault();
  const tipo = document.getElementById('genTipoSelect').value;
  const casoId = document.getElementById('genCasoSelect').value;
  let clienteNombre = '', clienteCedula = '', clienteDireccion = '', casoTitulo = '';
  if (casoId) {
    const casos = await ipcRenderer.invoke('getCasos');
    const caso = casos.find(c => c.id === parseInt(casoId));
    if (caso) {
      casoTitulo = caso.titulo;
      clienteNombre = caso.cliente_nombre || '';
      const clientes = await ipcRenderer.invoke('getClientes');
      const cli = clientes.find(c => c.id === caso.cliente_id);
      if (cli) {
        clienteCedula = cli.cedula || '';
        clienteDireccion = cli.direccion || '';
      }
    }
  }
  const dato = {
    caso_id: casoId || null,
    caso_titulo: casoTitulo,
    cliente_nombre: clienteNombre,
    cliente_cedula: clienteCedula,
    cliente_direccion: clienteDireccion,
    abogado: document.getElementById('genAbogado').value,
    ipsa: document.getElementById('genIpsa').value,
    contraparte: document.getElementById('genContraparte').value,
    tribunal: document.getElementById('genTribunal').value,
    objeto: document.getElementById('genObjeto').value
  };
  const res = await ipcRenderer.invoke('generarDocumento', tipo, dato);
  if (res.lastId) {
    const docs = await ipcRenderer.invoke('getDocumentosGenerados');
    const doc = docs.find(d => d.id === res.lastId);
    if (doc) {
      closeModal('generadorModal');
      verDocumento(doc.id);
    }
    await loadDocLegales();
    alert('Documento generado correctamente.');
  }
}

async function verDocumento(id) {
  const docs = await ipcRenderer.invoke('getDocumentosGenerados');
  const doc = docs.find(d => d.id === id);
  if (!doc) return;
  currentDocView = doc;
  document.getElementById('verDocTitulo').textContent = doc.titulo;
  document.getElementById('verDocContenido').value = doc.contenido;
  document.getElementById('verDocModal').classList.add('active');
}

let currentDocView = null;

async function guardarDocModal() {
  if (!currentDocView) return;
  const contenido = document.getElementById('verDocContenido').value;
  await ipcRenderer.invoke('guardarDocumentoGenerado', { id: currentDocView.id, contenido });
  alert('Documento guardado.');
}

function imprimirDocumento() {
  const contenido = document.getElementById('verDocContenido').value;
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) { alert('Permite ventanas emergentes para imprimir.'); return; }
  win.document.write(`<html><head><title>Imprimir</title><style>body{font-family:serif;padding:40px;white-space:pre-wrap;color:#000;}</style></head><body>${contenido.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body></html>`);
  win.document.close();
  win.onload = () => { win.print(); };
}

function copiarDocumento() {
  const contenido = document.getElementById('verDocContenido').value;
  navigator.clipboard.writeText(contenido).then(() => {
    alert('Documento copiado al portapapeles.');
  });
}

async function deleteDocLegal(id) {
  if (!confirm('¿Eliminar este documento?')) return;
  await ipcRenderer.invoke('deleteDocumentoGenerado', id);
  await loadDocLegales();
}

// ==================== PLAZOS LEGALES ====================
async function loadPlazosLegales() {
  await loadCasosSelect('plazoLegalCaso');
  renderPlazosLegales();
}

async function renderPlazosLegales() {
  const materia = document.getElementById('plazosLegalMateria').value;
  const plazos = (await ipcRenderer.invoke('getPlazosLegales', materia))[materia] || [];
  const matLabels = { civil: 'CIVIL', penal: 'PENAL', laboral: 'LABORAL', administrativo: 'CONTENCIOSO ADMINISTRATIVO', mercantil: 'MERCANTIL' };
  const list = document.getElementById('plazosLegalesList');
  list.innerHTML = `
    <h4 style="margin-bottom: 12px; color: #3b82f6;">Plazos en materia ${matLabels[materia]}</h4>
    <div style="display: flex; flex-direction: column; gap: 8px;">
    ${plazos.map(p => `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 10px;">
        <div>
          <strong>${escapeHtml(p.nombre)}</strong><br>
          <span class="list-item-sub">${p.dias ? `${p.dias} días hábiles` : 'Inmediato'} · ${escapeHtml(p.descripcion)}</span>
        </div>
        <button class="btn btn-secondary" style="white-space: nowrap; font-size: 12px;" onclick="agregarPlazoLegal('${escapeHtml(p.nombre).replace(/'/g, "\\'")}', ${p.dias})">+ Agregar</button>
      </div>
    `).join('')}
    </div>
  `;
}

async function agregarPlazoLegal(titulo, dias) {
  const casoId = document.getElementById('plazoLegalCaso').value;
  if (!casoId) { alert('Selecciona un caso para agregar el plazo.'); return; }
  if (!confirm(`¿Agregar "${titulo}" (${dias ? dias + ' días' : 'inmediato'}) al calendario del caso?`)) return;
  await ipcRenderer.invoke('generarPlazoDesdeLegal', {
    caso_id: parseInt(casoId),
    titulo,
    dias
  });
  alert('Plazo agregado al calendario.');
}

// ==================== CONFIGURACIÓN ====================
async function loadConfiguracion() {
  const config = await ipcRenderer.invoke('getSMTPConfig');
  document.getElementById('smtpHost').value = config.host || '';
  document.getElementById('smtpPort').value = config.port || '587';
  document.getElementById('smtpUser').value = config.user || '';
  document.getElementById('smtpPass').value = config.pass || '';
  document.getElementById('smtpFrom').value = config.from || '';
  await actualizarEstadoSMTP();
  await rellenarFormOutlook();
  await actualizarEstadoOutlook();
  if (isAdmin()) {
    await loadUsuarios();
    document.getElementById('adminUsersSection').style.display = 'block';
  } else {
    document.getElementById('adminUsersSection').style.display = 'none';
  }
}

// ==================== INTEGRACIÓN CON OUTLOOK ====================
let outlookPollTimer = null;

async function rellenarFormOutlook() {
  const status = await ipcRenderer.invoke('getOutlookStatus');
  if (document.getElementById('outlookClientId')) document.getElementById('outlookClientId').value = status.client_id || '';
  if (document.getElementById('outlookTenant')) document.getElementById('outlookTenant').value = status.tenant || 'consumers';
  if (document.getElementById('outlookSyncPlazos')) document.getElementById('outlookSyncPlazos').checked = !!status.sync_plazos;
}

async function actualizarEstadoOutlook() {
  const status = await ipcRenderer.invoke('getOutlookStatus');
  const estadoEl = document.getElementById('outlookStatusTexto');
  const connectBtn = document.getElementById('outlookConnectBtn');
  const disconnectBtn = document.getElementById('outlookDisconnectBtn');
  if (!estadoEl) return;
  if (status.conectado) {
    estadoEl.innerHTML = `<span class="badge badge-ok">Conectado</span> ${escapeHtml(status.email || 'Cuenta de Outlook')} · Correos enviados desde Outlook y plazos sincronizados con el Calendario.`;
    if (connectBtn) connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = '';
  } else if (status.configurado) {
    estadoEl.innerHTML = '<span class="badge badge-warn">No conectado</span> Pulsa "Conectar con Outlook" para sincronizar la agenda y enviar correos desde tu cuenta.';
    if (connectBtn) connectBtn.style.display = '';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
  } else {
    estadoEl.innerHTML = '<span class="badge badge-warn">No configurado</span> Registra una aplicación en portal.azure.com y pega el Client ID para conectar con Outlook.';
  }
}

async function saveOutlookConfig(e) {
  e.preventDefault();
  const cfg = {
    client_id: document.getElementById('outlookClientId').value.trim(),
    tenant: document.getElementById('outlookTenant').value.trim() || 'consumers',
    sync_plazos: document.getElementById('outlookSyncPlazos').checked
  };
  await ipcRenderer.invoke('saveOutlookConfig', cfg);
  await actualizarEstadoOutlook();
  alert('Configuración de Outlook guardada. Ahora pulsa "Conectar con Outlook".');
}

async function conectarOutlook() {
  const res = await ipcRenderer.invoke('startOutlookConnect');
  if (!res.success) {
    alert('No se pudo iniciar la conexión:\n' + (res.error || 'Error desconocido'));
    return;
  }
  document.getElementById('outlookAuthUrl').href = res.verification_uri || 'https://microsoft.com/link';
  document.getElementById('outlookUserCode').textContent = res.user_code || '······';
  document.getElementById('outlookConnectStatus').textContent = 'Esperando autorización...';
  document.getElementById('outlookConnectModal').classList.add('active');
  if (outlookPollTimer) clearInterval(outlookPollTimer);
  outlookPollTimer = setInterval(pollOutlook, 5000);
}

async function pollOutlook() {
  const res = await ipcRenderer.invoke('pollOutlookConnect');
  if (res.status === 'success') {
    if (outlookPollTimer) clearInterval(outlookPollTimer);
    outlookPollTimer = null;
    document.getElementById('outlookConnectStatus').textContent = res.email ? '¡Conectado! Cuenta: ' + res.email : '¡Conectado!';
    closeModal('outlookConnectModal');
    await actualizarEstadoOutlook();
    alert(res.email ? `Conectado con Outlook (${res.email}).` : 'Conexión con Outlook exitosa.');
  } else if (res.status === 'error') {
    if (outlookPollTimer) clearInterval(outlookPollTimer);
    outlookPollTimer = null;
    document.getElementById('outlookConnectStatus').textContent = 'Error: ' + (res.error || '');
    closeModal('outlookConnectModal');
    alert('Error de conexión:\n' + (res.error || ''));
  } else {
    document.getElementById('outlookConnectStatus').textContent = 'Esperando que autorices el código en tu navegador de Microsoft...';
  }
}

function cancelarConexionOutlook() {
  if (outlookPollTimer) clearInterval(outlookPollTimer);
  outlookPollTimer = null;
  closeModal('outlookConnectModal');
}

async function desconectarOutlook() {
  if (!confirm('¿Desconectar la cuenta de Outlook?\nLos plazos dejarán de sincronizarse. Los eventos ya creados en el Calendario no se borran.')) return;
  await ipcRenderer.invoke('disconnectOutlook');
  await actualizarEstadoOutlook();
  alert('Outlook desconectado.');
}

// ==================== GESTIÓN DE USUARIOS ====================
async function loadUsuarios() {
  const usuarios = await ipcRenderer.invoke('getUsuarios');
  const tbody = document.getElementById('usuariosTable');
  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td>${escapeHtml(u.usuario)}</td>
      <td>${escapeHtml(u.nombre)}</td>
      <td><span class="badge badge-${u.rol === 'administrador' ? 'activo' : u.rol === 'abogado' ? 'proceso' : 'pendiente'}">${u.rol.toUpperCase()}</span></td>
      <td><span class="badge badge-${u.activo ? 'ok' : 'error'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn-icon" onclick="editUsuario(${u.id})" title="Editar">✏️</button>
        <button class="btn-icon" onclick="deleteUsuario(${u.id})" title="Eliminar">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function openUsuarioModal(user = null) {
  document.getElementById('usuarioModalTitle').textContent = user ? 'Editar Usuario' : 'Nuevo Usuario';
  document.getElementById('usuarioId').value = user ? user.id : '';
  document.getElementById('usuarioUsuario').value = user ? user.usuario : '';
  document.getElementById('usuarioNombre').value = user ? user.nombre : '';
  document.getElementById('usuarioPassword').value = '';
  document.getElementById('usuarioPassword').placeholder = user ? 'Dejar vacío para no cambiar' : 'Contraseña';
  document.getElementById('usuarioRol').value = user ? user.rol : 'asistente';
  document.getElementById('usuarioActivo').value = user ? user.activo : 1;
  document.getElementById('usuarioUsuario').disabled = !!user;
  document.getElementById('usuarioModal').classList.add('active');
}

async function editUsuario(id) {
  const usuarios = await ipcRenderer.invoke('getUsuarios');
  const user = usuarios.find(u => u.id === id);
  if (user) openUsuarioModal(user);
}

async function saveUsuario(e) {
  e.preventDefault();
  const id = document.getElementById('usuarioId').value;
  const user = {
    usuario: document.getElementById('usuarioUsuario').value,
    nombre: document.getElementById('usuarioNombre').value,
    password: document.getElementById('usuarioPassword').value,
    rol: document.getElementById('usuarioRol').value,
    activo: parseInt(document.getElementById('usuarioActivo').value)
  };
  let result;
  if (id) {
    user.id = parseInt(id);
    result = await ipcRenderer.invoke('updateUsuario', user);
  } else {
    if (!user.password) { alert('La contraseña es obligatoria para nuevos usuarios.'); return; }
    result = await ipcRenderer.invoke('addUsuario', user);
  }
  if (result.success) {
    closeModal('usuarioModal');
    await loadUsuarios();
    alert(id ? 'Usuario actualizado.' : 'Usuario creado.');
  } else {
    alert(result.error || 'Error al guardar usuario.');
  }
}

async function deleteUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  const result = await ipcRenderer.invoke('deleteUsuario', id);
  if (result.success) {
    await loadUsuarios();
    alert('Usuario eliminado.');
  } else {
    alert(result.error || 'Error al eliminar usuario.');
  }
}

async function actualizarEstadoSMTP() {
  const config = await ipcRenderer.invoke('getSMTPConfig');
  const estadoEl = document.getElementById('smtpStatusTexto');
  if (config && config.host && config.user && config.pass) {
    const res = await ipcRenderer.invoke('testSMTP');
    if (res.success) {
      estadoEl.innerHTML = `<span class="badge badge-ok">Conectado</span> ${escapeHtml(res.user)}`;
    } else {
      estadoEl.innerHTML = `<span class="badge badge-error">Error</span> ${escapeHtml(res.error)}`;
    }
  } else {
    estadoEl.innerHTML = '<span class="badge badge-warn">No configurado</span> Completa el formulario para enviar correos automáticamente.';
  }
}

async function saveSMTPConfig(e) {
  e.preventDefault();
  const config = {
    host: document.getElementById('smtpHost').value,
    port: document.getElementById('smtpPort').value || '587',
    user: document.getElementById('smtpUser').value,
    pass: document.getElementById('smtpPass').value,
    from: document.getElementById('smtpFrom').value
  };
  await ipcRenderer.invoke('saveSMTPConfig', config);
  await actualizarEstadoSMTP();
  alert('Configuración guardada correctamente.');
}

async function testSMTPConfig() {
  const config = {
    host: document.getElementById('smtpHost').value,
    port: document.getElementById('smtpPort').value || '587',
    user: document.getElementById('smtpUser').value,
    pass: document.getElementById('smtpPass').value,
    from: document.getElementById('smtpFrom').value
  };
  await ipcRenderer.invoke('saveSMTPConfig', config);
  const res = await ipcRenderer.invoke('testSMTP');
  if (res.success) {
    alert(`Conexión exitosa con la cuenta: ${res.user}`);
  } else {
    alert(`Error de conexión:\n${res.error}`);
  }
  await actualizarEstadoSMTP();
}

// ==================== HELPERS ====================
async function loadClientesSelect(selectId = 'casoCliente') {
  const clientes = await ipcRenderer.invoke('getClientes');
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Seleccionar cliente...</option>' + 
    clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

async function loadCasosSelect(selectId) {
  const casos = await ipcRenderer.invoke('getCasos');
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Seleccionar caso...</option>' + 
    casos.map(c => `<option value="${c.id}" data-cliente="${c.cliente_id || ''}">${escapeHtml(c.numero_caso)} - ${escapeHtml(c.titulo)}</option>`).join('');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES');
}

function getEstadoClass(estado) {
  const classes = { 'Activo': 'activo', 'En Proceso': 'proceso', 'Pendiente': 'pendiente', 'Cerrado': 'cerrado', 'Archivado': 'cerrado', 'Completado': 'completado', 'Vencido': 'vencido' };
  return classes[estado] || 'pendiente';
}

// Search
document.getElementById('searchCasos')?.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (query.length > 0) {
    const casos = await ipcRenderer.invoke('searchCasos', query);
    renderCasos(casos);
  } else {
    loadCasos();
  }
});

document.getElementById('searchClientes')?.addEventListener('input', async (e) => {
  const query = e.target.value;
  if (query.length > 0) {
    const clientes = await ipcRenderer.invoke('searchClientes', query);
    renderClientes(clientes);
  } else {
    loadClientes();
  }
});

// Initial load
checkAuth();

// ==================== CHATBOT IA ====================
let chatOpen = false;
let chatHistorial = [];
let conversacionActualId = null;

function toggleChat() {
  const window = document.getElementById('chatWindow');
  chatOpen = !chatOpen;
  window.classList.toggle('active', chatOpen);
  const fab = document.getElementById('chatbotFab');
  fab.textContent = chatOpen ? '✕' : '🤖';
  if (chatOpen) {
    document.getElementById('chatInput').focus();
    cargarConversacionReciente();
  }
}

async function cargarConversacionReciente() {
  const conv = await ipcRenderer.invoke('getConversaciones');
  if (conv && conv.length > 0) {
    const reciente = await ipcRenderer.invoke('getConversacion', conv[0].id);
    if (reciente && reciente.mensajes && reciente.mensajes.length > 0) {
      conversacionActualId = reciente.id;
      chatHistorial = reciente.mensajes;
      const container = document.getElementById('chatMessages');
      const existingGreeting = container.querySelector('.chat-msg.bot .chat-bubble');
      const greetingText = existingGreeting ? existingGreeting.textContent : '';
      container.innerHTML = '';
      if (greetingText.includes('Soy LexAI')) {
        container.innerHTML = '<div class="chat-msg bot"><span>🤖</span><div class="chat-bubble">' + greetingText + '</div></div>';
      }
      reciente.mensajes.forEach(m => {
        appendChatMessage(m.role === 'user' ? 'user' : 'bot', m.text);
      });
      container.scrollTop = container.scrollHeight;
    }
  }
}

async function guardarConversacionAutomatico() {
  if (chatHistorial.length === 0) return;
  const titulo = chatHistorial[0] && chatHistorial[0].role === 'user'
    ? chatHistorial[0].text.substring(0, 40) + '...'
    : 'Conversación del ' + new Date().toLocaleDateString('es-ES');
  const res = await ipcRenderer.invoke('guardarConversacion', {
    id: conversacionActualId,
    titulo,
    usuario: (currentUser && currentUser.usuario) || 'admin',
    mensajes: chatHistorial
  });
  if (res && res.id) conversacionActualId = res.id;
}

function appendChatMessage(role, text) {
  const container = document.getElementById('chatMessages');
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;
  const icon = role === 'user' ? '👤' : '🤖';
  msg.innerHTML = `<span>${icon}</span><div class="chat-bubble">${text.replace(/\n/g, '<br>')}</div>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const mensaje = input.value.trim();
  if (!mensaje) return;

  input.value = '';
  appendChatMessage('user', mensaje);
  chatHistorial.push({ role: 'user', text: mensaje });

  const typing = appendChatMessage('bot', 'Escribiendo...');

  const res = await ipcRenderer.invoke('chatIA', mensaje, chatHistorial);
  if (res.success) {
    typing.querySelector('.chat-bubble').innerHTML = res.respuesta.replace(/\n/g, '<br>');
    chatHistorial.push({ role: 'assistant', text: res.respuesta });
  } else {
    typing.querySelector('.chat-bubble').innerHTML = `⚠️ ${res.error}`;
    if (res.error && res.error.includes('configurada')) {
      setTimeout(() => openIAConfig(), 1500);
    }
  }
  await guardarConversacionAutomatico();
}

async function nuevaConversacion() {
  conversacionActualId = null;
  chatHistorial = [];
  const container = document.getElementById('chatMessages');
  container.innerHTML = '<div class="chat-msg bot"><span>🤖</span><div class="chat-bubble">¡Hola! Soy LexAI, tu asistente jurídico. Pregúntame sobre derechos, plazos procesales, redacción de escritos o cualquier tema legal. 🇻🇪⚖️</div></div>';
  document.getElementById('chatInput').focus();
}

async function abrirHistorialConversaciones() {
  const conversaciones = await ipcRenderer.invoke('getConversaciones');
  if (conversaciones.length === 0) {
    alert('No hay conversaciones guardadas aún.');
    return;
  }
  const opciones = conversaciones.map(c => `${c.id}: ${c.titulo} (${new Date(c.fecha_guardado).toLocaleString('es-ES')})`);
  const sel = prompt('Historial de conversaciones (elige una por número, o "N" = nueva, "E" + número = eliminar):\n\n' + opciones.join('\n'));
  if (!sel) return;
  const s = sel.trim().toUpperCase();
  if (s === 'N') {
    await nuevaConversacion();
    return;
  }
  if (s.startsWith('E')) {
    const id = parseInt(s.slice(1).trim());
    if (id) {
      await ipcRenderer.invoke('eliminarConversacion', id);
      alert('Conversación eliminada.');
    }
    return;
  }
  const num = parseInt(s);
  if (num) {
    const reciente = await ipcRenderer.invoke('getConversacion', num);
    if (reciente && reciente.mensajes) {
      conversacionActualId = reciente.id;
      chatHistorial = reciente.mensajes;
      const container = document.getElementById('chatMessages');
      container.innerHTML = '';
      reciente.mensajes.forEach(m => appendChatMessage(m.role === 'user' ? 'user' : 'bot', m.text));
      container.scrollTop = container.scrollHeight;
    }
  }
}

// ==================== CONFIGURACIÓN IA ====================
async function openIAConfig() {
  const cfg = await ipcRenderer.invoke('getIAConfig');
  document.getElementById('iaApiKey').value = cfg.key || '';
  document.getElementById('iaModelo').value = cfg.model || 'gemini-3.6-flash';
  document.getElementById('iaConfigModal').classList.add('active');
}

async function saveIAConfig(e) {
  e.preventDefault();
  const cfg = {
    key: document.getElementById('iaApiKey').value,
    model: document.getElementById('iaModelo').value
  };
  await ipcRenderer.invoke('saveIAConfig', cfg);
  closeModal('iaConfigModal');
  alert('Asistente de IA configurado correctamente. Ya puedes usar LexAI.');
}