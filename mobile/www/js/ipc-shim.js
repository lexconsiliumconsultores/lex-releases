// Shim móvil: emula ipcRenderer de Electron usando Supabase directo (UMD)
// Requiere que antes se haya cargado https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js
(function(){
  const SUPABASE_URL = 'https://vfxbnuhacqvyebualfhv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_cMS-KhJ-qmLufrHL0igxjw_9G2lQAeC';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  function getCurrentUserLocal(){ try{ return JSON.parse(localStorage.getItem('lex_currentUser')||'null'); }catch{ return null; } }
  function setCurrentUserLocal(u){ if(u) localStorage.setItem('lex_currentUser', JSON.stringify(u)); else localStorage.removeItem('lex_currentUser'); }
  let _currentUser = getCurrentUserLocal();

  const handlers = {
    getCurrentUser: async () => _currentUser,
    login: async (usuario, password) => {
      const { data, error } = await supabase.from('usuarios').select('*').eq('usuario', usuario).eq('password', password).eq('activo', 1).maybeSingle();
      if (error || !data) return { success: false, error: 'Usuario o contraseña incorrectos' };
      _currentUser = { id: data.id, usuario: data.usuario, nombre: data.nombre, rol: data.rol };
      setCurrentUserLocal(_currentUser);
      return { success: true, user: _currentUser };
    },
    logout: async () => { _currentUser=null; setCurrentUserLocal(null); return {success:true}; },
    getUsuarios: async () => { const {data}=await supabase.from('usuarios').select('id, usuario, nombre, rol, activo, fecha_creacion').order('nombre'); return data||[]; },
    addUsuario: async (user) => {
      const {data:ex}=await supabase.from('usuarios').select('id').eq('usuario', user.usuario).maybeSingle();
      if(ex) return {success:false, error:'El nombre de usuario ya existe'};
      const {data,error}=await supabase.from('usuarios').insert({usuario:user.usuario,nombre:user.nombre,password:user.password,rol:user.rol||'asistente',activo:user.activo??1}).select('id').single();
      if(error) return {success:false, error:error.message};
      return {changes:1,lastId:data.id,success:true};
    },
    updateUsuario: async (user) => {
      const upd={nombre:user.nombre,rol:user.rol,activo:user.activo}; if(user.password) upd.password=user.password;
      const {error}=await supabase.from('usuarios').update(upd).eq('id',user.id);
      if(error) return {success:false,error:error.message};
      if(_currentUser && _currentUser.id===user.id){ _currentUser.nombre=user.nombre; _currentUser.rol=user.rol; setCurrentUserLocal(_currentUser); }
      return {success:true};
    },
    deleteUsuario: async (id) => {
      if(_currentUser && _currentUser.id===id) return {success:false,error:'No puedes eliminar tu propio usuario'};
      const {error}=await supabase.from('usuarios').delete().eq('id',id);
      return error?{success:false,error:error.message}:{success:true};
    },
    getClientes: async () => { const {data}=await supabase.from('clientes').select('*').order('nombre'); return data||[]; },
    addCliente: async (c) => { const {data,error}=await supabase.from('clientes').insert({nombre:c.nombre,cedula:c.cedula,telefono:c.telefono,email:c.email,direccion:c.direccion,id_tramite:c.id_tramite}).select('id').single(); if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id}; },
    updateCliente: async (c) => { const {error}=await supabase.from('clientes').update({nombre:c.nombre,cedula:c.cedula,telefono:c.telefono,email:c.email,direccion:c.direccion,id_tramite:c.id_tramite}).eq('id',c.id); return error?{success:false,error:error.message}:{success:true}; },
    deleteCliente: async (id) => { const {error}=await supabase.from('clientes').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    searchClientes: async (q) => { const {data}=await supabase.from('clientes').select('*').or(`nombre.ilike.%${q}%,cedula.ilike.%${q}%,telefono.ilike.%${q}%`).order('nombre'); return data||[]; },
    generarNumeroCaso: async () => {
      const year=new Date().getFullYear();
      const {data}=await supabase.from('casos').select('numero_caso').like('numero_caso',`CASO-${year}-%`).order('id',{ascending:false}).limit(1).maybeSingle();
      let num=1; if(data&&data.numero_caso) num=parseInt(data.numero_caso.split('-')[2])+1;
      return `CASO-${year}-${String(num).padStart(4,'0')}`;
    },
    getCasos: async () => {
      const {data}=await supabase.from('casos').select('*, clientes(nombre)').order('fecha_apertura',{ascending:false});
      return (data||[]).map(c=>({...c,cliente_nombre:c.clientes?.nombre||null}));
    },
    addCaso: async (caso) => {
      const numero=await handlers.generarNumeroCaso();
      const {data,error}=await supabase.from('casos').insert({numero_caso:numero,titulo:caso.titulo,cliente_id:caso.cliente_id||null,tipo:caso.tipo,descripcion:caso.descripcion,abogado:caso.abogado}).select('id').single();
      if(error) return {success:false,error:error.message};
      return {changes:1,lastId:data.id};
    },
    updateCaso: async (caso) => { const {error}=await supabase.from('casos').update({titulo:caso.titulo,cliente_id:caso.cliente_id||null,tipo:caso.tipo,estado:caso.estado,descripcion:caso.descripcion,abogado:caso.abogado}).eq('id',caso.id); return error?{success:false,error:error.message}:{success:true}; },
    deleteCaso: async (id) => { const {error}=await supabase.from('casos').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    searchCasos: async (q) => {
      const {data}=await supabase.from('casos').select('*, clientes(nombre)').order('fecha_apertura',{ascending:false});
      const mapped=(data||[]).map(c=>({...c,cliente_nombre:c.clientes?.nombre||null}));
      const qL=q.toLowerCase();
      return mapped.filter(c=>c.titulo.toLowerCase().includes(qL)||c.numero_caso.toLowerCase().includes(qL)||(c.cliente_nombre&&c.cliente_nombre.toLowerCase().includes(qL)));
    },
    getPlazos: async (casoId) => {
      let q=supabase.from('plazos').select('*, casos(titulo)').order('fecha_limite');
      if(casoId) q=q.eq('caso_id',casoId);
      const {data}=await q;
      return (data||[]).map(p=>({...p,caso_titulo:p.casos?.titulo||''}));
    },
    addPlazo: async (plazo) => { const {data,error}=await supabase.from('plazos').insert({caso_id:plazo.caso_id,titulo:plazo.titulo,fecha_limite:plazo.fecha_limite||null,hora:plazo.hora||null,notas:plazo.notas||null}).select('id').single(); if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id}; },
    updatePlazo: async (plazo) => {
      const upd={}; if(plazo.caso_id&&plazo.titulo&&plazo.fecha_limite){ upd.caso_id=plazo.caso_id; upd.titulo=plazo.titulo; upd.fecha_limite=plazo.fecha_limite; upd.hora=plazo.hora||''; upd.estado=plazo.estado; upd.notas=plazo.notas||''; } else { upd.estado=plazo.estado; upd.notas=plazo.notas||''; }
      const {error}=await supabase.from('plazos').update(upd).eq('id',plazo.id); return error?{success:false,error:error.message}:{success:true};
    },
    deletePlazo: async (id) => { const {error}=await supabase.from('plazos').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    generarPlazoDesdeLegal: async (info) => { const fecha=new Date(); fecha.setDate(fecha.getDate()+(info.dias||0)); return handlers.addPlazo({caso_id:info.caso_id,titulo:info.titulo,fecha_limite:fecha.toISOString().split('T')[0],hora:info.hora||'09:00',notas:info.descripcion||''}); },
    getPlazosLegales: async (materia) => {
      const all={ civil:[{nombre:'Contestación de demanda',dias:20,descripcion:'Art. 359 CPC'},{nombre:'Apelación de sentencia definitiva',dias:5,descripcion:'Art. 298 CPC'}], penal:[{nombre:'Presentación de imputado',dias:0,descripcion:'48h art. 236 COPP'}], laboral:[{nombre:'Contestación de demanda',dias:5,descripcion:'LOPTRA'}], administrativo:[{nombre:'Recurso de nulidad',dias:180,descripcion:'LOPA'}], mercantil:[{nombre:'Contestación de demanda',dias:20,descripcion:'Juicio ordinario'}] };
      if(materia&&all[materia]) return all[materia]; return all;
    },
    getSeguimiento: async (casoId) => { const {data}=await supabase.from('seguimiento').select('*').eq('caso_id',casoId).order('fecha',{ascending:false}); return data||[]; },
    addSeguimiento: async (nota) => { const {data,error}=await supabase.from('seguimiento').insert({caso_id:nota.caso_id,nota:nota.nota,autor:nota.autor}).select('id').single(); if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id}; },
    getEstadisticas: async () => {
      const [casos,clientes,plazos,seguimientos,notifs]=await Promise.all([ supabase.from('casos').select('id, estado, tipo'), supabase.from('clientes').select('id',{count:'exact',head:true}), supabase.from('plazos').select('estado'), supabase.from('seguimiento').select('id',{count:'exact',head:true}), supabase.from('notificaciones').select('id',{count:'exact',head:true}).eq('estado','Enviado') ]);
      const totalCasos=casos.data?.length||0; const casosActivos=casos.data?.filter(c=>c.estado==='Activo').length||0;
      const plazosPendientes=plazos.data?.filter(p=>p.estado==='Pendiente').length||0; const plazosVencidos=plazos.data?.filter(p=>p.estado==='Vencido').length||0;
      const porTipoMap={}; const porEstadoMap={}; casos.data?.forEach(c=>{ porTipoMap[c.tipo||'Sin tipo']=(porTipoMap[c.tipo||'Sin tipo']||0)+1; porEstadoMap[c.estado]=(porEstadoMap[c.estado]||0)+1; });
      return { totalCasos,casosActivos, totalClientes:clientes.count||0, plazosPendientes,plazosVencidos, porTipo:Object.entries(porTipoMap).map(([tipo,total])=>({tipo,total})), porEstado:Object.entries(porEstadoMap).map(([estado,total])=>({estado,total})), notificacionesEnviadas:notifs.count||0, seguimientos:seguimientos.count||0 };
    },
    getDocumentos: async (casoId) => { let q=supabase.from('documentos').select('*').order('fecha_subida',{ascending:false}); if(casoId) q=q.eq('caso_id',casoId); const {data}=await q; return data||[]; },
    addDocumento: async (doc) => { const {data,error}=await supabase.from('documentos').insert({caso_id:doc.caso_id,nombre:doc.nombre,tipo:doc.tipo,ruta:doc.ruta}).select('id').single(); if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id}; },
    deleteDocumento: async (id) => { const {error}=await supabase.from('documentos').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    getDocumentoBase64: async () => ({success:false,error:'Visor no disponible en móvil. Usa escritorio.'}),
    selectFile: async () => null,
    getFacturas: async () => {
      const {data:facturas}=await supabase.from('facturas').select('*, casos(titulo), clientes(nombre)').order('fecha_emision',{ascending:false});
      const {data:pagos}=await supabase.from('pagos').select('factura_id, monto');
      const map={}; pagos?.forEach(p=>map[p.factura_id]=(map[p.factura_id]||0)+parseFloat(p.monto));
      return (facturas||[]).map(f=>({...f,caso_titulo:f.casos?.titulo||null,cliente_nombre:f.clientes?.nombre||null,pagado:map[f.id]||0}));
    },
    getFacturasPendientes: async () => {
      const {data:facturas}=await supabase.from('facturas').select('*, casos(titulo), clientes(nombre)').in('estado',['Pendiente','Parcial']).order('fecha_vencimiento');
      const {data:pagos}=await supabase.from('pagos').select('factura_id, monto');
      const map={}; pagos?.forEach(p=>map[p.factura_id]=(map[p.factura_id]||0)+parseFloat(p.monto));
      return (facturas||[]).map(f=>({...f,caso_titulo:f.casos?.titulo||null,cliente_nombre:f.clientes?.nombre||null,pagado:map[f.id]||0}));
    },
    addFactura: async (factura) => {
      const {data:max}=await supabase.from('facturas').select('numero').order('numero',{ascending:false}).limit(1).maybeSingle();
      const nextNum=(max?.numero||0)+1;
      const {data,error}=await supabase.from('facturas').insert({numero:nextNum,caso_id:factura.caso_id||null,cliente_id:factura.cliente_id||null,concepto:factura.concepto,monto:factura.monto||0,estado:factura.estado||'Pendiente',fecha_vencimiento:factura.fecha_vencimiento||null}).select('id').single();
      if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id};
    },
    updateFactura: async (factura) => { const {error}=await supabase.from('facturas').update({caso_id:factura.caso_id||null,cliente_id:factura.cliente_id||null,concepto:factura.concepto,monto:factura.monto,estado:factura.estado,fecha_vencimiento:factura.fecha_vencimiento||null}).eq('id',factura.id); return error?{success:false,error:error.message}:{success:true}; },
    deleteFactura: async (id) => { await supabase.from('pagos').delete().eq('factura_id',id); const {error}=await supabase.from('facturas').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    getPagos: async (facturaId) => { const {data}=await supabase.from('pagos').select('*, facturas(numero)').eq('factura_id',facturaId).order('fecha',{ascending:false}); return (data||[]).map(p=>({...p,factura_num:p.facturas?.numero||''})); },
    getPagosTodos: async () => {
      const {data}=await supabase.from('pagos').select('*, facturas(numero)').order('fecha',{ascending:false});
      const {data:facturas}=await supabase.from('facturas').select('id, cliente_id, clientes(nombre)');
      const cmap={}; facturas?.forEach(f=>cmap[f.id]=f.clientes?.nombre||'');
      return (data||[]).map(p=>({...p,factura_num:p.facturas?.numero||'',cliente_nombre:cmap[p.factura_id]||''}));
    },
    addPago: async (pago) => {
      const {data,error}=await supabase.from('pagos').insert({factura_id:pago.factura_id,monto:pago.monto,metodo:pago.metodo||'Efectivo',referencia:pago.referencia||null}).select('id').single();
      if(error) return {success:false,error:error.message};
      const {data:factura}=await supabase.from('facturas').select('monto').eq('id',pago.factura_id).single();
      const {data:pagos}=await supabase.from('pagos').select('monto').eq('factura_id',pago.factura_id);
      const pagado=(pagos||[]).reduce((s,p)=>s+parseFloat(p.monto),0);
      let estado='Pendiente'; if(pagado>=parseFloat(factura.monto)) estado='Pagada'; else if(pagado>0) estado='Parcial';
      await supabase.from('facturas').update({estado}).eq('id',pago.factura_id);
      return {changes:1,lastId:data.id};
    },
    deletePago: async (id) => {
      const {data:pago}=await supabase.from('pagos').select('factura_id').eq('id',id).maybeSingle();
      const {error}=await supabase.from('pagos').delete().eq('id',id);
      if(error) return {success:false,error:error.message};
      if(pago){
        const {data:factura}=await supabase.from('facturas').select('monto').eq('id',pago.factura_id).single();
        const {data:pagos}=await supabase.from('pagos').select('monto').eq('factura_id',pago.factura_id);
        const pagado=(pagos||[]).reduce((s,p)=>s+parseFloat(p.monto),0);
        let estado='Pendiente'; if(pagado>=parseFloat(factura.monto)) estado='Pagada'; else if(pagado>0) estado='Parcial';
        await supabase.from('facturas').update({estado}).eq('id',pago.factura_id);
      }
      return {success:true};
    },
    getCuentasPorCobrar: async () => {
      const {data:facturas}=await supabase.from('facturas').select('*, casos(titulo), clientes(nombre)').in('estado',['Pendiente','Parcial']).order('fecha_vencimiento');
      const {data:pagos}=await supabase.from('pagos').select('factura_id, monto');
      const map={}; pagos?.forEach(p=>map[p.factura_id]=(map[p.factura_id]||0)+parseFloat(p.monto));
      return (facturas||[]).map(f=>{ const pagado=map[f.id]||0; const saldo=parseFloat(f.monto)-pagado; const vencida=f.fecha_vencimiento&&['Pendiente','Parcial'].includes(f.estado)&&new Date(f.fecha_vencimiento)<new Date(); return {...f,cliente_nombre:f.clientes?.nombre||null,caso_titulo:f.casos?.titulo||null,pagado,saldo,vencida:vencida?1:0}; });
    },
    enviarRecordatorioCobro: async (facturaId) => {
      const {data:f}=await supabase.from('facturas').select('*, clientes(nombre,email)').eq('id',facturaId).maybeSingle();
      if(!f) return {success:false,error:'Factura no encontrada'};
      const email=f.clientes?.email;
      if(!email) return {success:false,error:'El cliente no tiene correo registrado.'};
      const {data:pagos}=await supabase.from('pagos').select('monto').eq('factura_id',facturaId);
      const pagado=(pagos||[]).reduce((s,p)=>s+parseFloat(p.monto),0);
      const saldo=Math.max(parseFloat(f.monto)-pagado,0);
      const mensaje=`Estimado/a ${f.clientes?.nombre||''},\n\nLe recordamos que tiene pendiente la factura N° ${f.numero} por $ ${Number(saldo).toLocaleString('es-CL')}, con concepto "${f.concepto||''}".\n\nAgradecemos su pronta gestión.\n\nAtentamente, LexConsilium Consultores.`;
      const {error}=await supabase.from('notificaciones').insert({caso_id:f.caso_id||null,cliente_id:f.cliente_id||null,tipo:'Recordatorio de Pago',mensaje,email,canal:'Correo',estado:'Pendiente'});
      if(error) return {success:false,error:error.message};
      return {success:true, canal:'Pendiente (escritorio lo enviará)', queued:true, email, mensaje, asunto:`LEX - Recordatorio de Pago - N° ${f.numero}`, caso_id:f.caso_id, cliente_id:f.cliente_id};
    },
    generarDocumento: async (tipo,dato) => {
      const contenido=`Documento ${tipo} para ${dato.caso_titulo||''} - ${dato.cliente_nombre||''} (móvil)`;
      const {data,error}=await supabase.from('documentos_generados').insert({titulo:`${tipo} - ${dato.caso_titulo||''}`,tipo,caso_id:dato.caso_id||null,contenido}).select('id').single();
      if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id};
    },
    getDocumentosGenerados: async () => { const {data}=await supabase.from('documentos_generados').select('*, casos(titulo)').order('fecha_creacion',{ascending:false}); return (data||[]).map(d=>({...d,caso_titulo:d.casos?.titulo||null})); },
    deleteDocumentoGenerado: async (id) => { const {error}=await supabase.from('documentos_generados').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    guardarDocumentoGenerado: async (doc) => { const {error}=await supabase.from('documentos_generados').update({contenido:doc.contenido}).eq('id',doc.id); return error?{success:false,error:error.message}:{success:true}; },
    getNotificaciones: async () => { const {data}=await supabase.from('notificaciones').select('*, casos(titulo), clientes(nombre)').neq('tipo','Respuesta de Cliente').order('fecha',{ascending:false}); return (data||[]).map(n=>({...n,caso_titulo:n.casos?.titulo||null,cliente_nombre:n.clientes?.nombre||null})); },
    addNotificacion: async (notif) => { const {data,error}=await supabase.from('notificaciones').insert({caso_id:notif.caso_id||null,cliente_id:notif.cliente_id||null,tipo:notif.tipo,mensaje:notif.mensaje,telefono:notif.telefono||null,email:notif.email||null,canal:notif.canal||null,estado:notif.estado||'Enviado'}).select('id').single(); if(error) return {success:false,error:error.message}; return {changes:1,lastId:data.id}; },
    deleteNotificacion: async (id) => { const {error}=await supabase.from('notificaciones').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
    enviarEmail: async (email, asunto, mensaje) => {
      const {error}=await supabase.from('notificaciones').insert({tipo:(asunto||'Notificación').replace(/^LEX - /,''), mensaje:mensaje||asunto||'', email, canal:'Correo', estado:'Pendiente'});
      if(error) return {success:false,error:error.message};
      return {success:true, canal:'Pendiente (escritorio lo enviará)', queued:true};
    },
    getSMTPConfig: async () => { const {data}=await supabase.from('config').select('clave, valor').in('clave',['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from']); const map={}; data?.forEach(r=>map[r.clave]=r.valor); return {host:map.smtp_host||'',port:map.smtp_port||'587',user:map.smtp_user||'',pass:map.smtp_pass||'',from:map.smtp_from||''}; },
    saveSMTPConfig: async (cfg) => { for(const [k,v] of Object.entries({smtp_host:cfg.host,smtp_port:cfg.port,smtp_user:cfg.user,smtp_pass:cfg.pass,smtp_from:cfg.from})){ await supabase.from('config').upsert({clave:k,valor:v||''}); } return {success:true}; },
    testSMTP: async () => ({success:false,error:'Solo escritorio'}),
    getOutlookEvents: async () => ({success:false,error:'No disponible en móvil',eventos:[]}),
    createOutlookEvent: async () => ({success:false,error:'No disponible'}),
    updateOutlookEvent: async () => ({success:false,error:'No disponible'}),
    deleteOutlookEvent: async () => ({success:false,error:'No disponible'}),
    getIAConfig: async () => { const {data}=await supabase.from('config').select('clave, valor').in('clave',['ia_api_key','ia_modelo']); const map={}; data?.forEach(r=>map[r.clave]=r.valor); return {key:map.ia_api_key||'',model:map.ia_modelo||'gemini-3.6-flash',configurada:!!map.ia_api_key}; },
    saveIAConfig: async (cfg) => { await supabase.from('config').upsert({clave:'ia_api_key',valor:cfg.key||''}); await supabase.from('config').upsert({clave:'ia_modelo',valor:cfg.model||'gemini-3.6-flash'}); return {success:true}; },
    chatIA: async (mensaje,historial) => {
      const {data}=await supabase.from('config').select('valor').eq('clave','ia_api_key').maybeSingle(); const key=data?.valor||'';
      if(!key) return {success:false,error:'IA no configurada.'};
      const {data:modelRow}=await supabase.from('config').select('valor').eq('clave','ia_modelo').maybeSingle(); const model=modelRow?.valor||'gemini-3.6-flash';
      let contents=[]; if(historial) contents=historial.slice(-10).map(m=>({role:m.role==='user'?'user':'model',parts:[{text:String(m.text||'')}]})); contents.push({role:'user',parts:[{text:String(mensaje)}]});
      try{ const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{role:'system',parts:[{text:'Eres LexAI, asistente jurídico venezolano. Responde en español, conciso (máx 300 palabras).'}]},contents,generationConfig:{temperature:0.7,maxOutputTokens:1024}})}); const d=await res.json(); if(!res.ok) return {success:false,error:d.error?.message||`Error ${res.status}`}; const texto=d.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'(Sin respuesta)'; return {success:true,respuesta:texto}; }catch(e){ return {success:false,error:e.message}; }
    },
    guardarConversacion: async (conv) => {
      const titulo=conv.titulo||('Conversación '+new Date().toLocaleDateString('es-ES')); const contenido=JSON.stringify(conv.mensajes||[]); const usuario=conv.usuario||_currentUser?.usuario||'admin';
      if(conv.id){ const {error}=await supabase.from('conversaciones_chat').update({titulo,contenido}).eq('id',conv.id); return error?{success:false,error:error.message}:{success:true,id:conv.id}; }
      const {data,error}=await supabase.from('conversaciones_chat').insert({titulo,usuario,contenido}).select('id').single(); if(error) return {success:false,error:error.message}; return {success:true,id:data.id};
    },
    getConversaciones: async () => { const {data}=await supabase.from('conversaciones_chat').select('id, titulo, usuario, fecha_guardado').order('fecha_guardado',{ascending:false}); return data||[]; },
    getConversacion: async (id) => { const {data}=await supabase.from('conversaciones_chat').select('*').eq('id',id).maybeSingle(); if(!data) return null; let mensajes=[]; try{mensajes=JSON.parse(data.contenido||'[]');}catch{} return {...data,mensajes}; },
    eliminarConversacion: async (id) => { const {error}=await supabase.from('conversaciones_chat').delete().eq('id',id); return error?{success:false,error:error.message}:{success:true}; },
  };

  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }
  function cacheKey(channel, args) { return 'lexcache_' + channel + '_' + JSON.stringify(args); }

  const CACHE_TTL = 10000;
  function readCache(key){ try{ const raw=localStorage.getItem(key); if(!raw) return null; const p=JSON.parse(raw); if(p&&typeof p==='object'&&'v' in p) return p; return {t:0,v:p}; }catch{ return null; } }
  function writeCache(key,v){ try{ localStorage.setItem(key, JSON.stringify({t:Date.now(),v})); }catch{} }
  function clearCache(){ try{ const ks=[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(k&&k.indexOf('lexcache_')===0) ks.push(k);} ks.forEach(k=>localStorage.removeItem(k)); }catch{} }

  window.ipcRenderer = {
    invoke: async (channel, ...args) => {
      const fn=handlers[channel];
      if(!fn){ console.warn('channel no implementado móvil:',channel); return null; }
      const isGet = /^(get|list|search)/.test(channel);
      const key = cacheKey(channel, args);
      if (isGet) {
        const c = readCache(key);
        if (c && (Date.now() - c.t) < CACHE_TTL) {
          withTimeout(fn(...args), 12000).then(res => writeCache(key, res)).catch(() => {});
          return c.v;
        }
        try {
          const res = await withTimeout(fn(...args), 12000);
          writeCache(key, res);
          return res;
        } catch (e) {
          if (c) return c.v;
          return [];
        }
      }
      try {
        const res = await withTimeout(fn(...args), 12000);
        clearCache();
        return res;
      } catch (e) {
        return { success: false, error: 'Tiempo de espera agotado. Verificá tu conexión e intentá de nuevo.' };
      }
    },
    on: (channel, cb) => {}
  };
  window.require = (mod) => mod==='electron'?{ipcRenderer:window.ipcRenderer}:{};
  console.log('[LEX Móvil] ipcRenderer shim listo - Supabase conectado');
})();
