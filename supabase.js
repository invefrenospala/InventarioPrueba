// ==========================================================
// supabase.js — Sincronización en tiempo real con Supabase
// Inventario Frenos Pala
// ==========================================================

const SUPABASE_URL      = 'https://lbndgfqkehajqexdrkrm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BJ2ynlQ_nkNX1tEgaEsHKQ_Ck4Ddq9o';

// ==========================================================
// ESTADO INTERNO
// ==========================================================
let sbClient       = null;
let sbConfigurado  = false;
let colaPendiente  = []; // movimientos sin sincronizar
let usuarioSesion  = null; // correo de quien inició sesión (para auditoría)
const CLAVE_COLA   = 'fp_cola_pendiente_v1';

// ==========================================================
// TIMEOUT DE SEGURIDAD
// ==========================================================
// Si el celular tiene una conexión que "se cuelga" (abre la conexión
// pero nunca responde, en vez de fallar rápido), las llamadas de
// supabase-js pueden quedarse esperando para siempre y la app se
// queda pegada (ej. "Cargando usuarios..."). Esta función obliga a
// que toda llamada falle después de N segundos si no hay respuesta.
function _conTimeout(promesa, ms = 9000) {
  return Promise.race([
    Promise.resolve(promesa),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms))
  ]);
}

// ==========================================================
// INICIALIZACIÓN
// ==========================================================
function inicializarSupabase() {
  if (SUPABASE_URL === 'TU_URL_AQUI' || SUPABASE_ANON_KEY === 'TU_CLAVE_AQUI') {
    console.warn('⚠️ supabase.js: credenciales no configuradas. Funcionando solo con localStorage.');
    actualizarIndicador('nocfg');
    return false;
  }

  try {
    sbClient      = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sbConfigurado = true;
  } catch(e) {
    console.error('Error creando cliente Supabase:', e.message);
    actualizarIndicador('err');
    return false;
  }

  // Cargar la cola de pendientes del localStorage
  try {
    const raw = localStorage.getItem(CLAVE_COLA);
    if (raw) colaPendiente = JSON.parse(raw);
  } catch(e) { colaPendiente = []; }

  // Escuchar cambios de red
  window.addEventListener('online',  _alConectarse);
  window.addEventListener('offline', () => actualizarIndicador('offline'));

  actualizarIndicador(navigator.onLine ? 'online' : 'offline');
  return true;
}

// ==========================================================
// CARGAR DATOS DESDE SUPABASE
// ==========================================================

/** Descarga el catálogo completo con existencias actuales */
async function cargarProductosDesdeSupabase() {
  if (!sbConfigurado) return null;
  try {
    const { data, error } = await _conTimeout(sbClient.from('productos').select('*'));
    if (error) throw error;
    return data; // array con { ref, cat, nombre, marca, precio, costo, minimo, stock }
  } catch(e) {
    console.warn('No se pudo cargar productos de Supabase:', e.message);
    return null;
  }
}

/** Descarga todas las asociaciones código de barras → referencia */
async function cargarBarrasDesdeSupabase() {
  if (!sbConfigurado) return null;
  try {
    const { data, error } = await _conTimeout(sbClient.from('barras').select('*'));
    if (error) throw error;
    const mapa = {};
    data.forEach(b => { mapa[b.codigo] = b.ref; });
    return mapa;
  } catch(e) {
    console.warn('No se pudo cargar barras de Supabase:', e.message);
    return null;
  }
}

// ==========================================================
// CARGAR MOVIMIENTOS DESDE SUPABASE
// ==========================================================

/** Descarga todos los movimientos (historial completo) */
async function cargarMovimientosDesdeSupabase() {
  if (!sbConfigurado) return null;
  try {
    const { data, error } = await _conTimeout(
      sbClient.from('movimientos').select('*').order('fecha', { ascending: false }).limit(5000)
    );
    if (error) throw error;
    return data; // array con { id, ref, tipo, cantidad, bodega, destino, anterior, fecha, usuario }
  } catch(e) {
    console.warn('No se pudo cargar movimientos de Supabase:', e.message);
    return null;
  }
}

// ==========================================================
// USUARIOS Y AUTENTICACIÓN — Supabase Auth de verdad.
//
// Antes, el "login" comparaba la contraseña contra una tabla de
// texto plano que cualquiera podía leer con la clave pública. Ahora
// las contraseñas las guarda y verifica Supabase (nunca quedan en
// una tabla consultable), y solo un usuario ya autenticado puede
// leer o escribir el inventario.
//
// Cada perfil usa un "usuario" corto (ej. "danieltove") que por
// debajo se traduce a un correo interno (danieltove@frenospala.app)
// -- no hace falta que sea un correo real, Supabase Auth solo
// necesita que sea único.
// ==========================================================

function _correoDesdeUsuario(usuario) {
  return usuario.trim().toLowerCase().replace(/\s+/g, '') + '@frenospala.app';
}

/** Trae del directorio público (usuario, nombre) para sugerencias
 *  en el login. No incluye nada sensible. */
async function cargarPerfiles() {
  if (!sbConfigurado) return null;
  try {
    const { data, error } = await _conTimeout(
      sbClient.from('perfiles').select('usuario,nombre,rol').eq('activo', true)
    );
    if (error) throw error;
    return data;
  } catch(e) {
    console.warn('No se pudo cargar el directorio de perfiles:', e.message);
    return null;
  }
}

/** Inicia sesión de verdad contra Supabase Auth y trae el perfil. */
async function iniciarSesionPerfil(usuario, clave) {
  if (!sbConfigurado) return { ok: false, error: 'Base de datos no configurada' };
  try {
    const { data, error } = await _conTimeout(
      sbClient.auth.signInWithPassword({
        email: _correoDesdeUsuario(usuario),
        password: clave
      })
    );
    if (error) {
      const msg = /invalid/i.test(error.message)
        ? 'Usuario o contraseña incorrectos'
        : error.message;
      return { ok: false, error: msg };
    }

    usuarioSesion = data.user.email;

    const { data: perfil } = await sbClient
      .from('perfiles').select('usuario,nombre,rol').eq('id', data.user.id).single();

    return {
      ok: true,
      usuario: perfil || { usuario, nombre: usuario, rol: 'operario' }
    };
  } catch(e) {
    return { ok: false, error: 'Error de conexión (tardó demasiado). Intenta de nuevo.' };
  }
}

/** Recupera una sesión ya iniciada (persistida por Supabase) y su perfil.
 *  Funciona incluso sin internet, porque la sesión vive guardada en el
 *  propio dispositivo. */
async function recuperarSesionPerfil() {
  if (!sbClient) return null;
  try {
    const { data } = await sbClient.auth.getSession();
    if (!data || !data.session) return null;

    usuarioSesion = data.session.user.email;

    const { data: perfil } = await sbClient
      .from('perfiles').select('usuario,nombre,rol').eq('id', data.session.user.id).single();

    if (perfil) return perfil;

    // Sesión válida pero sin fila en 'perfiles' todavía: mostrar algo razonable
    const usuarioCorto = data.session.user.email.split('@')[0];
    return { usuario: usuarioCorto, nombre: usuarioCorto, rol: 'operario' };
  } catch(e) {
    return null;
  }
}

async function cerrarSesionSupabase() {
  if (!sbClient) return;
  try { await sbClient.auth.signOut(); } catch(e) {}
  usuarioSesion = null;
}

// ==========================================================
// REGISTRO DE ACTIVIDAD — crear, editar o dar de baja productos.
// (Los movimientos de stock ya se auditan con su columna 'usuario';
// esto cubre las demás acciones sobre el catálogo.)
// ==========================================================

async function registrarAuditoria(accion, detalle) {
  if (!sbConfigurado || !usuarioSesion) return;
  try {
    await sbClient.from('auditoria').insert({
      usuario: usuarioSesion.split('@')[0],
      accion,
      detalle: detalle || ''
    });
  } catch(e) {
    console.warn('No se pudo registrar la actividad:', e.message);
  }
}

async function verActividadReciente(limite = 60) {
  if (!sbConfigurado) return [];
  try {
    const { data, error } = await sbClient
      .from('auditoria').select('*').order('fecha', { ascending: false }).limit(limite);
    if (error) throw error;
    return data || [];
  } catch(e) {
    console.warn('No se pudo cargar la actividad:', e.message);
    return [];
  }
}

// ==========================================================
// SUBIR UN MOVIMIENTO
// ==========================================================

/**
 * Registra un movimiento y actualiza el stock en Supabase.
 * Si no hay internet, lo encola y lo sube cuando vuelva la conexión.
 *
 * @param {Object} mov     - Objeto del movimiento (ref, tipo, cantidad, bodega, etc.)
 * @param {Object} stock   - Stock actualizado del producto { "1": n, "2": n, ... }
 */
async function subirMovimiento(mov, stock) {
  if (!sbConfigurado) return; // sin config, solo funciona localStorage

  if (!navigator.onLine) {
    _encolar(mov, stock);
    actualizarIndicador('pendiente');
    return;
  }

  const ok = await _subirMovimientoDirecto(mov, stock);
  if (!ok) {
    _encolar(mov, stock);
    actualizarIndicador('pendiente');
  } else {
    actualizarIndicador('online');
  }
}

async function _subirMovimientoDirecto(mov, stock) {
  try {
    // Insertar el movimiento en el historial
    const { error: e1 } = await sbClient.from('movimientos').insert({
      ref:      mov.ref,
      tipo:     mov.tipo,
      cantidad: mov.cantidad,
      bodega:   mov.bodega,
      destino:  mov.destino  || null,
      anterior: mov.anterior !== undefined ? mov.anterior : null,
      usuario:  mov.usuario  || null,
      fecha:    mov.fecha
    });
    if (e1) throw e1;

    // Actualizar el stock del producto
    const { error: e2 } = await sbClient
      .from('productos')
      .update({ stock })
      .eq('ref', mov.ref);
    if (e2) throw e2;

    return true;
  } catch(e) {
    console.warn('Error subiendo movimiento:', e.message);
    return false;
  }
}

// ==========================================================
// SUBIR CÓDIGO DE BARRAS ASOCIADO
// ==========================================================

/** Registra (o actualiza) la asociación de un código de barras en Supabase */
async function subirBarra(codigo, ref) {
  if (!sbConfigurado) return;
  try {
    const { error } = await sbClient
      .from('barras')
      .upsert({ codigo, ref }, { onConflict: 'codigo' });
    if (error) throw error;
  } catch(e) {
    console.warn('No se pudo guardar la asociación de código de barras:', e.message);
  }
}

// ==========================================================
// SINCRONIZACIÓN EN TIEMPO REAL (Realtime)
// ==========================================================

/**
 * Escucha cambios en la tabla productos para actualizar la vista
 * si otra persona registra un movimiento desde otro celular.
 * También escucha nuevos movimientos para sincronizarlos.
 *
 * @param {Function} onCambioProducto  - Callback que recibe el producto actualizado
 * @param {Function} onNuevoMovimiento - Callback que recibe el movimiento nuevo
 */
function escucharCambiosEnTiempoReal(onCambioProducto, onNuevoMovimiento) {
  if (!sbConfigurado) return;

  sbClient
    .channel('inventario-sync')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'productos' },
      payload => {
        // payload.new tiene el producto con el stock actualizado
        if (payload.new) onCambioProducto(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'movimientos' },
      payload => {
        // payload.new tiene el movimiento recién insertado
        if (payload.new && onNuevoMovimiento) onNuevoMovimiento(payload.new);
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime conectado ✓ (productos + movimientos)');
      }
    });
}

// ==========================================================
// COLA OFFLINE
// ==========================================================

function _encolar(mov, stock) {
  colaPendiente.push({ mov, stock, encolado: new Date().toISOString() });
  _guardarCola();
}

function _guardarCola() {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(colaPendiente));
  } catch(e) {}
}

async function _alConectarse() {
  actualizarIndicador('online');
  if (colaPendiente.length === 0) return;

  const pendientes = [...colaPendiente];
  colaPendiente    = [];
  _guardarCola();

  let fallidos = 0;
  for (const item of pendientes) {
    const ok = await _subirMovimientoDirecto(item.mov, item.stock);
    if (!ok) {
      colaPendiente.push(item);
      fallidos++;
    }
  }

  _guardarCola();

  if (fallidos === 0) {
    // avisar es una función de app.js, estará disponible
    if (typeof avisar === 'function') avisar('Sincronizado con la base de datos ✓');
    actualizarIndicador('online');
  } else {
    actualizarIndicador('pendiente');
  }
}

// ==========================================================
// INDICADOR VISUAL DE CONEXIÓN
// ==========================================================

/**
 * Actualiza el punto de estado en el header.
 * Estados: 'online' | 'offline' | 'pendiente' | 'nocfg' | 'err'
 */
function actualizarIndicador(estado) {
  const ind = document.getElementById('ind-sync');
  if (!ind) return;

  const config = {
    online:    { cls: 'online',    title: 'Sincronizado con la base de datos' },
    offline:   { cls: 'offline',   title: 'Sin internet — los datos se guardarán cuando haya conexión' },
    pendiente: { cls: 'pendiente', title: `${colaPendiente.length} movimientos por sincronizar` },
    nocfg:     { cls: 'nocfg',     title: 'Base de datos no configurada — datos solo en este celular' },
    err:       { cls: 'err',       title: 'Error de conexión' },
  };

  const c = config[estado] || config.offline;
  ind.className = 'ind-sync ' + c.cls;
  ind.title     = c.title;
}

// ==========================================================
// SUBIR PRODUCTO NUEVO
// ==========================================================

/** Inserta un producto nuevo en Supabase (cuando el usuario lo crea desde la app) */
async function subirProductoNuevo(producto) {
  if (!sbConfigurado) return;
  try {
    const { error } = await sbClient.from('productos').insert({
      ref:    producto.ref,
      cat:    producto.cat,
      nombre: producto.nombre,
      marca:  producto.marca  || '',
      precio: producto.precio || 0,
      costo:  producto.costo  || 0,
      activo: producto.activo !== false,
      minimo: producto.minimo || 0,
      stock:  producto.stock
    });
    if (error) throw error;
    console.log('Producto nuevo subido a Supabase:', producto.ref);
  } catch(e) {
    console.warn('Error creando producto en Supabase:', e.message);
  }
}

// ==========================================================
// ACTUALIZAR PRODUCTO EDITADO
// ==========================================================

/** Actualiza un producto existente en Supabase (cuando el usuario lo edita) */
async function actualizarProducto(producto, refAnterior) {
  if (!sbConfigurado) return;
  try {
    if (producto.ref !== refAnterior) {
      // Si cambió la referencia, borrar la vieja e insertar la nueva
      await sbClient.from('productos').delete().eq('ref', refAnterior);
      const { error } = await sbClient.from('productos').insert({
        ref:    producto.ref,
        cat:    producto.cat,
        nombre: producto.nombre,
        marca:  producto.marca  || '',
        precio: producto.precio || 0,
        costo:  producto.costo  || 0,
        activo: producto.activo !== false,
        minimo: producto.minimo || 0,
        stock:  producto.stock
      });
      if (error) throw error;
    } else {
      // Solo actualizar los campos que cambiaron
      const { error } = await sbClient
        .from('productos')
        .update({
          cat:    producto.cat,
          nombre: producto.nombre,
          marca:  producto.marca  || '',
          precio: producto.precio || 0,
          costo:  producto.costo  || 0,
          activo: producto.activo !== false,
        })
        .eq('ref', producto.ref);
      if (error) throw error;
    }
    console.log('Producto actualizado en Supabase:', producto.ref);
  } catch(e) {
    console.warn('Error actualizando producto en Supabase:', e.message);
  }
}

// ==========================================================
// ELIMINAR PRODUCTO
// ==========================================================

/**
 * Borra un producto de Supabase. Las tablas movimientos y barras tienen
 * ON DELETE CASCADE, así que sus filas se van con él automáticamente.
 */
async function eliminarProductoSupabase(ref) {
  if (!sbConfigurado) return;
  try {
    const { error } = await sbClient.from('productos').delete().eq('ref', ref);
    if (error) throw error;
    console.log('Producto eliminado de Supabase:', ref);
  } catch(e) {
    console.warn('Error eliminando producto en Supabase:', e.message);
  }
}

// ==========================================================
// EXPORTAR — accesible como window.SB desde app.js
// ==========================================================
window.SB = {
  inicializar:        inicializarSupabase,
  cargarProductos:    cargarProductosDesdeSupabase,
  cargarBarras:       cargarBarrasDesdeSupabase,
  cargarMovimientos:  cargarMovimientosDesdeSupabase,
  cargarPerfiles,
  iniciarSesion:      iniciarSesionPerfil,
  recuperarSesion:    recuperarSesionPerfil,
  cerrarSesion: cerrarSesionSupabase,
  registrarAuditoria,
  verActividad:       verActividadReciente,
  subirMovimiento,
  subirBarra,
  subirProductoNuevo,
  actualizarProducto,
  eliminarProducto:   eliminarProductoSupabase,
  escucharCambios:    escucharCambiosEnTiempoReal,
  actualizarIndicador,
  get pendientes()    { return colaPendiente.length; },
  get configurado()   { return sbConfigurado; },
  get usuario()       { return usuarioSesion; },
};
