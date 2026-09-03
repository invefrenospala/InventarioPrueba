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
const CLAVE_COLA   = 'fp_cola_pendiente_v1';

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
    const { data, error } = await sbClient.from('productos').select('*');
    if (error) throw error;
    return data; // array de objetos con { ref, cat, nombre, marca, precio, minimo, stock }
  } catch(e) {
    console.warn('No se pudo cargar productos de Supabase:', e.message);
    return null;
  }
}

/** Descarga todas las asociaciones código de barras → referencia */
async function cargarBarrasDesdeSupabase() {
  if (!sbConfigurado) return null;
  try {
    const { data, error } = await sbClient.from('barras').select('*');
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
 *
 * @param {Function} onCambio - Callback que recibe el producto actualizado
 */
function escucharCambiosEnTiempoReal(onCambio) {
  if (!sbConfigurado) return;

  sbClient
    .channel('inventario-sync')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'productos' },
      payload => {
        // payload.new tiene el producto con el stock actualizado
        if (payload.new) onCambio(payload.new);
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('Realtime conectado ✓');
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
// EXPORTAR — accesible como window.SB desde app.js
// ==========================================================
window.SB = {
  inicializar:        inicializarSupabase,
  cargarProductos:    cargarProductosDesdeSupabase,
  cargarBarras:       cargarBarrasDesdeSupabase,
  subirMovimiento,
  subirBarra,
  subirProductoNuevo,
  actualizarProducto,
  escucharCambios:    escucharCambiosEnTiempoReal,
  actualizarIndicador,
  get pendientes()    { return colaPendiente.length; },
  get configurado()   { return sbConfigurado; },
};
