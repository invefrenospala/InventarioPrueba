// ==========================================================
// INVENTARIO — Frenos Pala
// ==========================================================
// Los datos viven en el navegador (localStorage). Es suficiente para
// operar y para demostrar; cuando el proyecto se apruebe, esto mismo
// se conecta a una base de datos igual que el sistema de turnos.

const BODEGAS = [1, 2, 3, 4, 5];
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CLAVE = 'frenospala_inventario_v1';

// IVA colombiano. Los precios se guardan SIN IVA (base gravable) y el IVA
// se calcula al mostrarlo. Así, si mañana cambia la tarifa, se cambia aquí
// y no hay que volver a digitar 164 precios.
const IVA = 0.19;
const conIVA  = n => (n || 0) * (1 + IVA);
const sinIVA  = n => (n || 0) / (1 + IVA);

// ---------- Estado ----------
let datos = {
  productos: [],     // catálogo con existencias por bodega
  movimientos: [],   // historial de entradas, salidas y traslados
  barras: {},        // código de barras -> referencia del producto
  bodega: 5,         // en cuál se está trabajando
  recientes: []      // últimas referencias consultadas
};

// ==========================================================
// GUARDAR Y CARGAR
// ==========================================================
function guardar() {
  // Guarda en localStorage (siempre, como respaldo offline).
  // La sincronización con Supabase se hace explícitamente desde
  // guardarMovimiento() y guardarConteo() para poder pasar el stock.
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e);
  }
}

async function cargar() {
  // 1. Cargar desde localStorage como punto de partida inmediato
  let previo = null;
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) previo = JSON.parse(t);
  } catch (e) { /* si está dañado, arranca de cero */ }

  if (previo && Array.isArray(previo.productos) && previo.productos.length) {
    datos = Object.assign(datos, previo);
    // Productos guardados antes de que existiera el precio de compra
    datos.productos.forEach(p => {
      if (typeof p.costo  !== 'number')  p.costo  = 0;
      if (typeof p.activo !== 'boolean') p.activo = true;
    });
    // Por si el catálogo del archivo creció desde la última vez
    const conocidas = new Set(datos.productos.map(p => p.ref));
    CATALOGO.forEach(c => {
      if (!conocidas.has(c.ref)) datos.productos.push(nuevoProducto(c));
    });
  } else {
    datos.productos = CATALOGO.map(nuevoProducto);
  }

  // 2. Intentar sincronizar con Supabase (si está configurado)
  if (window.SB && window.SB.configurado) {
    try {
      const [productosRemoto, barrasRemoto] = await Promise.all([
        window.SB.cargarProductos(),
        window.SB.cargarBarras()
      ]);

      if (productosRemoto && productosRemoto.length) {
        // Actualizar productos locales con los datos de la nube
        const mapaRemoto = {};
        productosRemoto.forEach(p => { mapaRemoto[p.ref] = p; });

        datos.productos = datos.productos.map(local => {
          const remoto = mapaRemoto[local.ref];
          if (!remoto) return local;
          // La nube manda: tomar stock y mínimo de Supabase
          return {
            ...local,
            stock:  remoto.stock,
            minimo: remoto.minimo,
            precio: remoto.precio,
            costo:  typeof remoto.costo === 'number' ? remoto.costo : (local.costo || 0),
            activo: remoto.activo !== false,
          };
        });

        // Si en Supabase hay productos que no están en el catálogo local, agregarlos
        const refsLocales = new Set(datos.productos.map(p => p.ref));
        productosRemoto.forEach(r => {
          if (!refsLocales.has(r.ref)) {
            datos.productos.push({
              ref: r.ref, cat: r.cat, nombre: r.nombre,
              marca: r.marca, precio: r.precio, costo: r.costo || 0,
              activo: r.activo !== false,
              minimo: r.minimo, stock: r.stock
            });
          }
        });

        guardar(); // actualizar localStorage con los datos frescos
      }

      if (barrasRemoto) {
        // Fusionar: las barras locales tienen precedencia si ya existen
        datos.barras = Object.assign({}, barrasRemoto, datos.barras);
        guardar();
      }

      window.SB.actualizarIndicador('online');

      // 3. Escuchar actualizaciones en tiempo real
      window.SB.escucharCambios(productoActualizado => {
        const idx = datos.productos.findIndex(p => p.ref === productoActualizado.ref);
        if (idx >= 0) {
          datos.productos[idx].stock  = productoActualizado.stock;
          datos.productos[idx].minimo = productoActualizado.minimo;
          guardar();
          // Refrescar la vista si es el producto que está abierto
          if (productoActual && productoActual.ref === productoActualizado.ref) {
            productoActual.stock = productoActualizado.stock;
            abrirProducto(productoActual);
          }
          // Refrescar catálogo si está activo
          if (pantalla === 'catalogo') pintarCatalogo();
        }
      });

    } catch(e) {
      console.warn('Error cargando desde Supabase, usando localStorage:', e.message);
    }
  }
}

/// Convierte una fila del catálogo en un producto con existencias por bodega
function nuevoProducto(c) {
  const stock = {};
  BODEGAS.forEach(b => { stock[b] = null; }); // null = todavía sin contar
  stock[5] = c.sinContar ? null : c.b5;       // solo la bodega 5 está contada

  return {
    ref: c.ref,
    cat: c.cat,
    nombre: c.nombre,
    marca: c.marca || '',
    precio: c.precio || 0,   // precio de VENTA sin IVA
    costo:  c.costo  || 0,   // precio de COMPRA sin IVA (lo que se le paga al proveedor)
    minimo: 0,          // lo define el taller con el uso
    activo: true,       // false = descontinuado (ya no se pide, pero queda el historial)
    stock
  };
}

// ==========================================================
// UTILIDADES
// ==========================================================
const $ = id => document.getElementById(id);
const pesos = n => '$' + Math.round(n).toLocaleString('es-CO');
const bodegaActual = () => datos.bodega;

function avisar(texto, ok = true) {
  const a = $('aviso');
  a.textContent = texto;
  a.className = 'aviso ver ' + (ok ? 'ok' : 'err');
  clearTimeout(avisar._t);
  avisar._t = setTimeout(() => a.classList.remove('ver'), 2800);
}

/**
 * Escapa un texto para poder meterlo dentro de un atributo HTML entre comillas
 * dobles. Sin esto, un valor con comillas (o un content:// URI) parte el
 * atributo y el onclick queda truncado, así que el botón no hace nada.
 */
function attr(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizar(t) {
  return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function buscarPorRef(texto) {
  const n = normalizar(texto);
  if (!n) return null;
  return datos.productos.find(p => normalizar(p.ref) === n) || null;
}

/** Productos que siguen en uso (no descontinuados). */
const activos = () => datos.productos.filter(p => p.activo !== false);

function stockTotal(p) {
  return BODEGAS.reduce((s, b) => s + (p.stock[b] || 0), 0);
}

function contadas(p) {
  return BODEGAS.filter(b => p.stock[b] !== null).length;
}

function fechaCorta(f) {
  const d = new Date(f);
  const hoy = new Date();
  const hora = d.toTimeString().slice(0, 5);
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora}`;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${hora}`;
}

// ==========================================================
// NAVEGACIÓN
// ==========================================================
let pantalla = 'escanear';

function ir(p, marcarNav = true) {
  document.querySelectorAll('.pantalla').forEach(x => x.classList.remove('activa'));
  $('p-' + p).classList.add('activa');
  pantalla = p;

  if (marcarNav) {
    document.querySelectorAll('nav button').forEach(b =>
      b.classList.toggle('on', b.dataset.p === p));
  }

  if (p === 'catalogo') pintarCatalogo();
  if (p === 'movs') pintarMovs();
  if (p === 'informes') pintarInformes();
  if (p !== 'escanear') detenerCamara();

  window.scrollTo(0, 0);
}

function marcarNav(p) {
  document.querySelectorAll('nav button').forEach(b =>
    b.classList.toggle('on', b.dataset.p === p));
}

document.querySelectorAll('nav button').forEach(b => {
  b.addEventListener('click', () => ir(b.dataset.p));
});

// ==========================================================
// ESCÁNER
// ==========================================================
// Se usa BarcodeDetector, que viene en el propio navegador de Android y
// es mucho más confiable que las librerías externas. Si no está, se
// carga ZXing desde internet como respaldo.
//
// Lo más importante: cuando algo falla, hay que DECIR POR QUÉ. Un botón
// que no hace nada es imposible de arreglar para quien lo está usando.

let stream = null, detector = null, escaneando = false, zxing = null;

function mostrarDiagnostico(titulo, pasos) {
  const d = $('diagnostico');
  d.innerHTML = `<b>${titulo}</b>` +
    (pasos.length ? `<ul>${pasos.map(p => `<li>${p}</li>`).join('')}</ul>` : '');
  d.classList.add('on');
}

function ocultarDiagnostico() {
  $('diagnostico').classList.remove('on');
}

async function iniciarCamara() {
  ocultarDiagnostico();
  $('txtCamara').textContent = 'Abriendo cámara...';

  // --- 1. La página tiene que ser segura (https) ---
  // Los navegadores no dan acceso a la cámara desde http:// ni desde un
  // archivo abierto directamente del computador.
  if (!window.isSecureContext) {
    $('txtCamara').textContent = 'Abrir cámara';
    mostrarDiagnostico('La cámara necesita una conexión segura', [
      'Estás abriendo la página como <b>' + location.protocol + '</b>',
      'Tiene que ser <b>https://</b> — publica la carpeta en Netlify o GitHub Pages',
      'Abrir el archivo directamente desde el celular no funciona',
      'Mientras tanto puedes escribir la referencia a mano, abajo'
    ]);
    return;
  }

  // --- 2. El navegador tiene que permitir usar la cámara ---
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('txtCamara').textContent = 'Abrir cámara';
    mostrarDiagnostico('Este navegador no permite usar la cámara', [
      'Prueba con Google Chrome',
      'Si estás dentro de Instagram, Facebook o WhatsApp, abre la página en el navegador'
    ]);
    return;
  }

  // --- 3. Pedir la cámara trasera ---
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
  } catch (err) {
    $('txtCamara').textContent = 'Abrir cámara';
    const nombre = err && err.name ? err.name : '';

    if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') {
      mostrarDiagnostico('No diste permiso para usar la cámara', [
        'Toca el candado 🔒 junto a la dirección, arriba',
        'Entra a <b>Permisos</b> y activa <b>Cámara</b>',
        'Recarga la página y vuelve a intentar'
      ]);
    } else if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
      mostrarDiagnostico('No se encontró ninguna cámara', [
        'Revisa que el dispositivo tenga cámara disponible'
      ]);
    } else if (nombre === 'NotReadableError' || nombre === 'TrackStartError') {
      mostrarDiagnostico('Otra aplicación está usando la cámara', [
        'Cierra la app de cámara u otras pestañas que la estén usando',
        'Vuelve a intentar'
      ]);
    } else {
      mostrarDiagnostico('No se pudo abrir la cámara', [
        'Detalle técnico: ' + (nombre || 'desconocido'),
        'Prueba recargando la página'
      ]);
    }
    return;
  }

  // --- 4. Mostrar el video ---
  const v = $('video');
  v.srcObject = stream;
  $('camara-caja').classList.add('on');
  try { await v.play(); } catch (e) { /* algunos navegadores lo hacen solos */ }

  // --- 5. Preparar el lector ---
  const formatos = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','codabar','qr_code'];

  if ('BarcodeDetector' in window) {
    try {
      const soportados = await window.BarcodeDetector.getSupportedFormats();
      detector = new window.BarcodeDetector({
        formats: formatos.filter(f => soportados.includes(f))
      });
    } catch (e) { detector = null; }
  }

  if (!detector) {
    // Respaldo: ZXing desde internet
    const listo = await cargarZxing();
    if (!listo) {
      detenerCamara();
      mostrarDiagnostico('No se pudo cargar el lector de códigos', [
        'Revisa que el celular tenga internet',
        'Mientras tanto, escribe la referencia a mano'
      ]);
      return;
    }
  }

  escaneando = true;
  $('txtCamara').textContent = 'Cerrar cámara';
  $('btnCamara').className = 'btn btn-linea';
  detector ? bucleNativo() : bucleZxing();
}

/// Lector propio del navegador: rápido y sin depender de internet
async function bucleNativo() {
  const v = $('video');
  if (!escaneando) return;

  try {
    if (v.readyState >= 2) {
      const codigos = await detector.detect(v);
      if (codigos.length > 0) {
        const valor = String(codigos[0].rawValue || '').trim();
        if (valor) { alLeer(valor); return; }
      }
    }
  } catch (e) { /* un cuadro fallido no es problema, sigue el siguiente */ }

  requestAnimationFrame(bucleNativo);
}

function cargarZxing() {
  return new Promise(resolver => {
    if (window.ZXing) return resolver(true);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js';
    s.onload = () => resolver(!!window.ZXing);
    s.onerror = () => resolver(false);
    document.head.appendChild(s);
  });
}

async function bucleZxing() {
  try {
    zxing = new window.ZXing.BrowserMultiFormatReader();
    zxing.decodeFromVideoElement($('video'), (resultado) => {
      if (resultado && escaneando) alLeer(String(resultado.getText()).trim());
    });
  } catch (e) {
    mostrarDiagnostico('El lector de respaldo falló', [
      'Escribe la referencia a mano mientras tanto'
    ]);
  }
}

function detenerCamara() {
  escaneando = false;
  if (zxing) { try { zxing.reset(); } catch (e) {} zxing = null; }
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  $('video').srcObject = null;
  $('camara-caja').classList.remove('on');
  $('txtCamara').textContent = 'Abrir cámara';
  $('btnCamara').className = 'btn btn-amarillo';
  detector = null;
}

$('btnCamara').addEventListener('click', () => {
  escaneando || stream ? detenerCamara() : iniciarCamara();
});

// ==========================================================
// QUÉ HACER CON UN CÓDIGO LEÍDO
// ==========================================================
function pitar() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 1750; o.type = 'square';
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(.14, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .12);
    o.start(); o.stop(ctx.currentTime + .13);
  } catch (e) { /* algunos navegadores bloquean el audio */ }
}

function confirmarLectura(codigo) {
  pitar();
  if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
  const f = $('flash'), l = $('leido');
  l.innerHTML = `✓ CÓDIGO LEÍDO<div class="cod">${codigo}</div>`;
  f.classList.add('on'); l.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 170);
  setTimeout(() => l.classList.remove('on'), 800);
}

function alLeer(codigo) {
  detenerCamara();
  confirmarLectura(codigo);

  // 1. ¿El código de barras ya está asociado a un producto?
  const refGuardada = datos.barras[codigo];
  if (refGuardada) {
    const p = buscarPorRef(refGuardada);
    if (p) { abrirProducto(p); return; }
  }

  // 2. ¿El código de barras ES la referencia? (algunos proveedores lo hacen)
  const directo = buscarPorRef(codigo);
  if (directo) {
    datos.barras[codigo] = directo.ref;
    guardar();
    if (window.SB) window.SB.subirBarra(codigo, directo.ref); // sync nube
    abrirProducto(directo);
    return;
  }

  // 3. ¿La referencia va dentro del código, junto con otras cosas?
  const n = normalizar(codigo);
  const contenido = datos.productos.find(p =>
    normalizar(p.ref).length >= 5 && n.includes(normalizar(p.ref)));
  if (contenido) {
    datos.barras[codigo] = contenido.ref;
    guardar();
    if (window.SB) window.SB.subirBarra(codigo, contenido.ref); // sync nube
    abrirProducto(contenido);
    return;
  }

  // 4. Código nuevo: se le pregunta al usuario de qué producto es.
  //    Así el catálogo se va codificando solo, con el uso diario.
  pedirAsociacion(codigo);
}

function buscarEscrito() {
  const t = $('entradaRef').value.trim();
  if (!t) { avisar('Escribe una referencia', false); return; }

  const p = buscarPorRef(t);
  if (p) { $('entradaRef').value = ''; abrirProducto(p); return; }

  // Si no es exacta, se busca por parecido
  const n = normalizar(t);
  const parecidos = datos.productos.filter(p =>
    normalizar(p.ref).includes(n) ||
    p.nombre.toUpperCase().includes(t.toUpperCase()));

  if (parecidos.length === 1) { $('entradaRef').value = ''; abrirProducto(parecidos[0]); return; }
  if (parecidos.length > 1) {
    $('entradaRef').value = '';
    ir('catalogo');
    $('buscarCat').value = t;
    pintarCatalogo();
    return;
  }

  // No existe: ofrecer crearlo de una vez con esa referencia
  $('entradaRef').value = '';
  _codigoEnCurso = null;
  _refPropuesta  = t.toUpperCase();
  abrirModal(`
    <h3>No existe esa referencia</h3>
    <p class="sub">No hay ningún producto que coincida con lo que escribiste.</p>

    <div style="background:var(--panel2);border-radius:9px;padding:12px;
                text-align:center;margin-bottom:16px;">
      <div style="font-family:'JetBrains Mono',monospace;font-size:16px;
                  color:var(--yellow);letter-spacing:1px;word-break:break-all;">${t.toUpperCase()}</div>
    </div>

    <button class="btn btn-amarillo" style="margin-bottom:10px;"
            onclick="abrirFormNuevoProducto()">
      ＋ Crear producto nuevo con esta referencia
    </button>
    <button class="btn btn-linea" onclick="_refPropuesta=null; cerrarModal();">
      Cancelar
    </button>
  `);
}

$('entradaRef').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarEscrito();
});

// Variables globales para pasar el código / la referencia al formulario
let _codigoEnCurso = null;
let _refPropuesta  = null;

function pedirAsociacion(codigo) {
  _codigoEnCurso = codigo;
  abrirModal(`
    <h3>Código nuevo</h3>
    <p class="sub">Este código todavía no está en el sistema. ¿Qué quieres hacer?</p>

    <div style="background:var(--panel2);border-radius:9px;padding:12px;
                text-align:center;margin-bottom:16px;">
      <div style="font-size:11px;color:var(--dim);margin-bottom:4px;">Código leído</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:16px;
                  color:var(--yellow);letter-spacing:1px;word-break:break-all;">${codigo}</div>
    </div>

    <button class="btn btn-amarillo" style="margin-bottom:9px;"
            onclick="abrirFormNuevoProducto()">
      ＋ Crear producto nuevo con este código
    </button>
    <div style="font-size:11px;color:var(--dim);text-align:center;margin-bottom:16px;">
      Es un repuesto que aún no existe en el catálogo
    </div>

    <div class="separador">O ASOCIARLO A UNO QUE YA EXISTE</div>

    <input class="entrada" id="buscarAsoc" placeholder="Buscar por referencia o nombre..."
           autocomplete="off" oninput="pintarAsociacion()">
    <div id="listaAsoc" style="margin-top:12px;max-height:32vh;overflow-y:auto;"></div>

    <button class="btn btn-linea" style="margin-top:14px;font-size:12.5px;padding:11px;"
            onclick="_codigoEnCurso=null; cerrarModal();">
      Cancelar
    </button>
  `);
  pintarAsociacion();
}

function pintarAsociacion() {
  const codigo = _codigoEnCurso;
  const q = ($('buscarAsoc') ? $('buscarAsoc').value : '').trim().toUpperCase();
  let lista = datos.productos;

  if (q) {
    const n = normalizar(q);
    lista = lista.filter(p =>
      normalizar(p.ref).includes(n) || p.nombre.toUpperCase().includes(q));
  }
  lista = lista.slice(0, 40);

  $('listaAsoc').innerHTML = lista.length === 0
    ? '<div class="vacio">Sin resultados</div>'
    : lista.map(p => `
      <div class="item" onclick="asociar('${attr(codigo).replace(/'/g, "\\'")}','${attr(p.ref).replace(/'/g, "\\'")}')">
        <div class="izq">
          <div class="t">${p.nombre}</div>
          <div class="s">${p.ref}${p.marca ? ' · ' + p.marca : ''}</div>
        </div>
        <div class="der"><span style="color:var(--yellow);font-size:19px;">›</span></div>
      </div>`).join('');
}

function asociar(codigo, ref) {
  datos.barras[codigo] = ref;
  guardar();
  if (window.SB) window.SB.subirBarra(codigo, ref);
  cerrarModal();
  avisar('Código asociado. La próxima vez se abre solo.');
  const p = buscarPorRef(ref);
  if (p) abrirProducto(p);
}

// ==========================================================
// CREAR PRODUCTO NUEVO
// ==========================================================

function abrirFormNuevoProducto() {
  const cats = [...new Set(datos.productos.map(p => p.cat))].sort();
  const b    = bodegaActual();

  // Si el código escaneado parece una referencia (tiene letras), se propone
  // como referencia. Si es un EAN/UPC de puros números, se deja en blanco
  // para que el usuario escriba la referencia real del repuesto.
  const esEAN = _codigoEnCurso && /^\d{8,}$/.test(_codigoEnCurso);
  const refSugerida = _refPropuesta
    ? _refPropuesta
    : (_codigoEnCurso && !esEAN ? _codigoEnCurso : '');

  abrirModal(`
    <h3>${_codigoEnCurso ? 'Producto nuevo' : 'Agregar producto'}</h3>
    <p class="sub">Completa los datos. Referencia y nombre son obligatorios.</p>

    ${_codigoEnCurso ? `
    <div style="background:var(--panel2);border-radius:9px;padding:10px;
                text-align:center;margin-bottom:14px;">
      <div style="font-size:11px;color:var(--dim);margin-bottom:3px;">
        Código de barras que se va a asociar
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:14px;
                  color:var(--yellow);word-break:break-all;">${_codigoEnCurso}</div>
      ${esEAN ? `<div style="font-size:10.5px;color:var(--dim);margin-top:5px;">
        Es un código de barras comercial. Escribe abajo la referencia del repuesto.
      </div>` : ''}
    </div>` : ''}

    <div style="display:flex;flex-direction:column;gap:11px;">

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Referencia *</div>
        <input class="entrada" id="npRef" placeholder="Ej: K1234-CR"
               autocomplete="off" style="text-transform:uppercase;"
               value="${refSugerida}">
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Nombre / descripción *</div>
        <input class="entrada" id="npNombre" placeholder="Ej: chevrolet aveo delantera ktc"
               autocomplete="off">
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Categoría *</div>
        <select class="bodega-sel" id="npCat"
                style="width:100%;padding:11px;font-size:13.5px;"
                onchange="toggleCatNueva(this.value)">
          ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
          <option value="_nueva">— Nueva categoría...</option>
        </select>
      </div>

      <div id="npCatNuevaDiv" style="display:none;">
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Nombre de la nueva categoría</div>
        <input class="entrada" id="npCatNueva" placeholder="Ej: ROTULAS"
               autocomplete="off" style="text-transform:uppercase;">
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Marca (opcional)</div>
        <input class="entrada" id="npMarca" placeholder="Ej: KTC, APC, MDS..."
               autocomplete="off">
      </div>

      <div class="bloque-precios">
        <div class="bloque-tit">Precios (opcional)</div>

        <div style="margin-bottom:10px;">
          <div class="etiqueta">Precio de compra — lo que le pagas al proveedor</div>
          <input class="entrada" id="npCosto" type="number" min="0" step="1"
                 placeholder="0" inputmode="numeric" oninput="_previewPrecios('np')">
        </div>

        <div>
          <div class="etiqueta">Precio de venta</div>
          <input class="entrada" id="npPrecio" type="number" min="0" step="1"
                 placeholder="0" inputmode="numeric" oninput="_previewPrecios('np')">
        </div>

        <label class="check">
          <input type="checkbox" id="npIncluyeIva" onchange="_previewPrecios('np')">
          <span>Los precios que escribí <b>ya incluyen IVA</b> del ${Math.round(IVA*100)}%</span>
        </label>

        <div id="npPreview" class="preview"></div>
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">
          Existencias iniciales en Bodega ${b} (opcional — déjalo en blanco si aún no se ha contado)
        </div>
        <input class="entrada" id="npStock" type="number" min="0" step="1"
               placeholder="Sin contar" inputmode="numeric">
      </div>
    </div>

    <button class="btn btn-amarillo" style="margin-top:18px;"
            onclick="guardarNuevoProducto()">
      Guardar producto
    </button>
  `);
}

/**
 * Muestra en vivo cómo quedan los precios y el margen mientras se escriben.
 * pre = 'np' (nuevo) o 'ep' (editar)
 */
function _previewPrecios(pre) {
  const caja = $(pre + 'Preview');
  if (!caja) return;

  const incluye = $(pre + 'IncluyeIva') && $(pre + 'IncluyeIva').checked;
  const crudoC  = parseFloat($(pre + 'Costo')  ? $(pre + 'Costo').value  : '') || 0;
  const crudoV  = parseFloat($(pre + 'Precio') ? $(pre + 'Precio').value : '') || 0;

  const costo  = incluye ? sinIVA(crudoC) : crudoC;
  const precio = incluye ? sinIVA(crudoV) : crudoV;

  if (!costo && !precio) { caja.innerHTML = ''; return; }

  const margen = (costo && precio) ? ((precio - costo) / precio) * 100 : null;
  const colorM = margen === null ? 'var(--dim)'
               : margen < 0  ? 'var(--red)'
               : margen < 15 ? 'var(--orange)' : 'var(--green-l)';

  caja.innerHTML = `
    <div class="preview-fila"><span>Compra sin IVA</span><b>${pesos(costo)}</b></div>
    <div class="preview-fila"><span>Venta sin IVA</span><b>${pesos(precio)}</b></div>
    <div class="preview-fila"><span>Venta con IVA (${Math.round(IVA*100)}%)</span>
         <b style="color:var(--yellow)">${pesos(conIVA(precio))}</b></div>
    ${margen !== null ? `<div class="preview-fila" style="border-top:1px solid var(--line);
         margin-top:6px;padding-top:6px;">
      <span>Margen</span><b style="color:${colorM}">${margen.toFixed(1)}%</b></div>` : ''}
  `;
}

function toggleCatNueva(val) {
  const div = document.getElementById('npCatNuevaDiv');
  if (div) div.style.display = val === '_nueva' ? 'block' : 'none';
}

function guardarNuevoProducto() {
  const refInput = $('npRef');
  const ref      = refInput ? refInput.value.trim().toUpperCase() : '';
  const nombre   = $('npNombre') ? $('npNombre').value.trim() : '';
  const catSel   = $('npCat')    ? $('npCat').value            : '';
  const catNueva = $('npCatNueva') ? $('npCatNueva').value.trim().toUpperCase() : '';
  const cat      = catSel === '_nueva' ? catNueva : catSel;
  const marca    = $('npMarca')  ? $('npMarca').value.trim()   : '';
  const incluye  = $('npIncluyeIva') && $('npIncluyeIva').checked;
  const precioIn = parseFloat($('npPrecio') ? $('npPrecio').value : '') || 0;
  const costoIn  = parseFloat($('npCosto')  ? $('npCosto').value  : '') || 0;
  // Siempre se guarda la base sin IVA
  const precio   = incluye ? sinIVA(precioIn) : precioIn;
  const costo    = incluye ? sinIVA(costoIn)  : costoIn;
  const stockRaw = $('npStock')  ? $('npStock').value.trim()   : '';
  const b        = bodegaActual();

  // Validaciones
  if (!ref)    { avisar('La referencia es obligatoria', false); return; }
  if (!nombre) { avisar('El nombre es obligatorio',     false); return; }
  if (!cat)    { avisar('Escribe el nombre de la nueva categoría', false); return; }
  if (buscarPorRef(ref)) {
    avisar(`Ya existe un producto con la referencia "${ref}"`, false);
    return;
  }

  // Construir stock (null = sin contar, excepto la bodega actual si se ingresó)
  const stock = {};
  BODEGAS.forEach(x => { stock[x] = null; });
  if (stockRaw !== '') stock[b] = Math.max(0, parseInt(stockRaw) || 0);

  // Crear el objeto producto
  const nuevo = { ref, cat, nombre, marca, precio, costo, minimo: 0, stock };
  datos.productos.push(nuevo);

  // Asociar el código de barras si venía del escáner
  const codigo = _codigoEnCurso;
  if (codigo) {
    datos.barras[codigo] = ref;
    if (window.SB) window.SB.subirBarra(codigo, ref);
  }

  guardar();

  // Subir a Supabase
  if (window.SB) window.SB.subirProductoNuevo(nuevo);

  _codigoEnCurso = null;
  _refPropuesta  = null;
  cerrarModal();
  avisar(codigo
    ? `Producto creado y código asociado. La próxima vez se abre solo.`
    : `Producto "${nombre}" agregado al catálogo`);
  abrirProducto(nuevo);
}


// ==========================================================
// EDITAR PRODUCTO EXISTENTE
// ==========================================================

function abrirEditarProducto() {
  const p = productoActual;
  if (!p) return;

  const cats = [...new Set(datos.productos.map(x => x.cat))].sort();

  abrirModal(`
    <h3>Editar producto</h3>
    <p class="sub">Modifica los datos que necesites. Referencia y nombre son obligatorios.</p>

    <div style="display:flex;flex-direction:column;gap:11px;">

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Referencia *</div>
        <input class="entrada" id="epRef" placeholder="Ej: K1234-CR"
               autocomplete="off" style="text-transform:uppercase;"
               value="${p.ref}">
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Nombre / descripción *</div>
        <input class="entrada" id="epNombre" placeholder="Ej: chevrolet aveo delantera ktc"
               autocomplete="off"
               value="${p.nombre}">
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Categoría *</div>
        <select class="bodega-sel" id="epCat"
                style="width:100%;padding:11px;font-size:13.5px;"
                onchange="toggleEditCatNueva(this.value)">
          ${cats.map(c => `<option value="${c}" ${c === p.cat ? 'selected' : ''}>${c}</option>`).join('')}
          <option value="_nueva">— Nueva categoría...</option>
        </select>
      </div>

      <div id="epCatNuevaDiv" style="display:none;">
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Nombre de la nueva categoría</div>
        <input class="entrada" id="epCatNueva" placeholder="Ej: ROTULAS"
               autocomplete="off" style="text-transform:uppercase;">
      </div>

      <div>
        <div style="font-size:11.5px;color:var(--dim);margin-bottom:4px;">Marca (opcional)</div>
        <input class="entrada" id="epMarca" placeholder="Ej: KTC, APC, MDS..."
               autocomplete="off"
               value="${p.marca || ''}">
      </div>

      <div class="bloque-precios">
        <div class="bloque-tit">Precios — se guardan sin IVA</div>

        <div style="margin-bottom:10px;">
          <div class="etiqueta">Precio de compra — lo que le pagas al proveedor</div>
          <input class="entrada" id="epCosto" type="number" min="0" step="1"
                 placeholder="0" inputmode="numeric"
                 value="${p.costo ? Math.round(p.costo) : ''}" oninput="_previewPrecios('ep')">
        </div>

        <div>
          <div class="etiqueta">Precio de venta</div>
          <input class="entrada" id="epPrecio" type="number" min="0" step="1"
                 placeholder="0" inputmode="numeric"
                 value="${p.precio ? Math.round(p.precio) : ''}" oninput="_previewPrecios('ep')">
        </div>

        <label class="check">
          <input type="checkbox" id="epIncluyeIva" onchange="_previewPrecios('ep')">
          <span>Los precios que escribí <b>ya incluyen IVA</b> del ${Math.round(IVA*100)}%</span>
        </label>

        <div id="epPreview" class="preview"></div>
      </div>
    </div>

    <button class="btn btn-amarillo" style="margin-top:18px;"
            onclick="guardarEdicionProducto()">
      Guardar cambios
    </button>
  `);
}

function toggleEditCatNueva(val) {
  const div = document.getElementById('epCatNuevaDiv');
  if (div) div.style.display = val === '_nueva' ? 'block' : 'none';
}

function guardarEdicionProducto() {
  const p = productoActual;
  if (!p) return;

  const refAnterior = p.ref;
  const ref      = $('epRef') ? $('epRef').value.trim().toUpperCase() : '';
  const nombre   = $('epNombre') ? $('epNombre').value.trim() : '';
  const catSel   = $('epCat') ? $('epCat').value : '';
  const catNueva = $('epCatNueva') ? $('epCatNueva').value.trim().toUpperCase() : '';
  const cat      = catSel === '_nueva' ? catNueva : catSel;
  const marca    = $('epMarca') ? $('epMarca').value.trim() : '';
  const incluye  = $('epIncluyeIva') && $('epIncluyeIva').checked;
  const precioIn = parseFloat($('epPrecio') ? $('epPrecio').value : '') || 0;
  const costoIn  = parseFloat($('epCosto')  ? $('epCosto').value  : '') || 0;
  const precio   = incluye ? sinIVA(precioIn) : precioIn;
  const costo    = incluye ? sinIVA(costoIn)  : costoIn;

  // Validaciones
  if (!ref)    { avisar('La referencia es obligatoria', false); return; }
  if (!nombre) { avisar('El nombre es obligatorio', false); return; }
  if (!cat)    { avisar('Escribe el nombre de la nueva categoría', false); return; }

  // Si cambió la referencia, verificar que no exista otra con la misma
  if (ref !== refAnterior && buscarPorRef(ref)) {
    avisar(`Ya existe un producto con la referencia "${ref}"`, false);
    return;
  }

  // Aplicar cambios al producto
  p.ref    = ref;
  p.nombre = nombre;
  p.cat    = cat;
  p.marca  = marca;
  p.precio = precio;
  p.costo  = costo;

  // Si cambió la referencia, actualizar asociaciones de códigos de barras
  if (ref !== refAnterior) {
    Object.keys(datos.barras).forEach(codigo => {
      if (datos.barras[codigo] === refAnterior) {
        datos.barras[codigo] = ref;
        if (window.SB) window.SB.subirBarra(codigo, ref);
      }
    });

    // Actualizar referencia en el historial de movimientos
    datos.movimientos.forEach(m => {
      if (m.ref === refAnterior) m.ref = ref;
    });

    // Actualizar en la lista de recientes
    datos.recientes = datos.recientes.map(r => r === refAnterior ? ref : r);
  }

  guardar();

  // Sincronizar con Supabase
  if (window.SB) window.SB.actualizarProducto(p, refAnterior);

  cerrarModal();
  avisar(`Producto "${nombre}" actualizado`);
  abrirProducto(p);
}


// ==========================================================
// DAR DE BAJA / ELIMINAR UN PRODUCTO
// ==========================================================
// Hay dos caminos, y la diferencia importa:
//
//   · DESCONTINUAR: el producto sale del catálogo y de las sugerencias de
//     compra, pero su historial de movimientos, sus conteos y sus códigos de
//     barras quedan intactos. Es reversible. Esto es lo que se necesita el 95%
//     de las veces: el proveedor dejó de traerlo, pero lo que pasó el año
//     pasado sigue siendo cierto y hace falta para los informes.
//
//   · ELIMINAR: borra el producto y TODO su rastro. Solo tiene sentido cuando
//     el producto se creó por error. Si tiene movimientos, se exige escribir la
//     referencia para confirmar, porque borrarlo deja huecos en el historial.

function abrirQuitarProducto() {
  const p = productoActual;
  if (!p) return;

  const movs  = datos.movimientos.filter(m => m.ref === p.ref).length;
  const cods  = Object.keys(datos.barras).filter(c => datos.barras[c] === p.ref).length;
  const hay   = stockTotal(p);

  abrirModal(`
    <h3>Dar de baja</h3>
    <p class="sub">${p.nombre}</p>

    <div style="background:var(--panel2);border-radius:9px;padding:12px;margin-bottom:16px;">
      <div class="preview-fila"><span>Existencias</span><b>${hay} unidades</b></div>
      <div class="preview-fila"><span>Movimientos registrados</span><b>${movs}</b></div>
      <div class="preview-fila"><span>Códigos de barras</span><b>${cods}</b></div>
    </div>

    <button class="btn btn-amarillo" style="margin-bottom:8px;"
            onclick="descontinuarProducto()">
      Descontinuar
    </button>
    <div style="font-size:11px;color:var(--dim);line-height:1.55;margin-bottom:18px;">
      Sale del catálogo y de las sugerencias de compra. El historial y las
      existencias se conservan. <b>Se puede deshacer.</b>
    </div>

    <div class="separador">O BORRARLO DEL TODO</div>

    ${hay > 0 ? `<div class="nota" style="margin-bottom:12px;">
      <span>⚠️</span>
      <div>Todavía hay <b>${hay} unidades</b> en bodega. Si lo borras, esas
      unidades desaparecen del inventario y del valor total.</div>
    </div>` : ''}

    <div style="font-size:11px;color:var(--dim);line-height:1.55;margin-bottom:10px;">
      Borra el producto, sus ${movs} movimiento${movs === 1 ? '' : 's'} y sus
      ${cods} código${cods === 1 ? '' : 's'} de barras. <b style="color:var(--red)">No se
      puede deshacer.</b> Úsalo solo si el producto se creó por error.
    </div>

    ${movs > 0 ? `
    <div class="etiqueta">Escribe <b style="color:var(--ink)">${p.ref}</b> para confirmar</div>
    <input class="entrada codigo" id="confirmarBorrado" placeholder="${p.ref}"
           autocomplete="off" style="margin-bottom:10px;">` : ''}

    <button class="btn btn-rojo" style="font-size:12.5px;"
            onclick="eliminarProducto()">
      Eliminar definitivamente
    </button>

    <button class="btn btn-linea" style="margin-top:14px;font-size:12.5px;padding:11px;"
            onclick="cerrarModal()">Cancelar</button>
  `);
}

function descontinuarProducto() {
  const p = productoActual;
  if (!p) return;
  p.activo = false;
  guardar();
  if (window.SB) window.SB.actualizarProducto(p, p.ref);
  cerrarModal();
  avisar(`"${p.nombre}" quedó descontinuado`);
  abrirProducto(p);
}

function reactivarProducto() {
  const p = productoActual;
  if (!p) return;
  p.activo = true;
  guardar();
  if (window.SB) window.SB.actualizarProducto(p, p.ref);
  avisar(`"${p.nombre}" vuelve a estar activo`);
  abrirProducto(p);
}

function eliminarProducto() {
  const p = productoActual;
  if (!p) return;

  const movs = datos.movimientos.filter(m => m.ref === p.ref).length;

  // Con historial de por medio, se exige escribir la referencia
  if (movs > 0) {
    const escrito = $('confirmarBorrado') ? $('confirmarBorrado').value.trim() : '';
    if (normalizar(escrito) !== normalizar(p.ref)) {
      avisar('Escribe la referencia exacta para confirmar', false);
      return;
    }
  } else if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) {
    return;
  }

  const ref = p.ref, nombre = p.nombre;

  datos.productos   = datos.productos.filter(x => x.ref !== ref);
  datos.movimientos = datos.movimientos.filter(m => m.ref !== ref);
  datos.recientes   = datos.recientes.filter(r => r !== ref);
  Object.keys(datos.barras).forEach(c => {
    if (datos.barras[c] === ref) delete datos.barras[c];
  });

  guardar();
  if (window.SB) window.SB.eliminarProducto(ref);

  productoActual = null;
  cerrarModal();
  avisar(`"${nombre}" eliminado del catálogo`);
  ir('catalogo');
}

// ==========================================================
// FICHA DE PRODUCTO
// ==========================================================
let productoActual = null;

function abrirProducto(p) {
  productoActual = p;

  // Guardar en los consultados recientes
  datos.recientes = [p.ref, ...datos.recientes.filter(r => r !== p.ref)].slice(0, 5);
  guardar();

  const b = bodegaActual();
  const enBodega = p.stock[b];
  const total = stockTotal(p);
  const sinContar = BODEGAS.filter(x => p.stock[x] === null);

  // Cuántos códigos de barras tiene ya asociados
  const codigos = Object.keys(datos.barras).filter(c => datos.barras[c] === p.ref);

  const consumo = consumoMensual(p.ref);
  const dura = consumo > 0 ? (total / consumo).toFixed(1) + ' meses' : '—';

  $('p-producto').innerHTML = `
    <button class="btn btn-linea" style="margin-bottom:13px;padding:11px;font-size:12px;"
            onclick="ir('escanear')">‹ Volver</button>

    <div class="ficha">
      <div class="ficha-top">
        <div class="nombre">${p.nombre}</div>
        <span class="ref">${p.ref}</span>
        <div class="cat"><b>${p.cat}</b>${p.marca ? ' · ' + p.marca : ''}</div>
      </div>

      <div class="bodegas">
        ${BODEGAS.map(x => {
          const v = p.stock[x];
          const cls = v === null ? 'nc' : (v > 0 ? 'ok' : 'cero');
          return `<div class="bod ${x === b ? 'actual' : ''}">
            <div class="n ${cls}">${v === null ? '—' : v}</div>
            <div class="e">Bod ${x}</div>
          </div>`;
        }).join('')}
      </div>

      <div class="total-linea">
        <span>Total en las 5 bodegas</span>
        <b>${total}</b>
      </div>
      ${(p.precio || p.costo) ? `
      ${p.costo ? `<div class="total-linea" style="border-top:1px solid var(--line);">
        <span>Compra <i style="color:var(--dim);font-style:normal;">sin IVA</i></span>
        <b style="color:var(--ink)">${pesos(p.costo)}</b>
      </div>` : ''}
      ${p.precio ? `<div class="total-linea" style="border-top:1px solid var(--line);">
        <span>Venta <i style="color:var(--dim);font-style:normal;">sin IVA</i></span>
        <b style="color:var(--ink)">${pesos(p.precio)}</b>
      </div>
      <div class="total-linea" style="border-top:1px solid var(--line);">
        <span>Venta <i style="color:var(--dim);font-style:normal;">con IVA ${Math.round(IVA*100)}%</i></span>
        <b>${pesos(conIVA(p.precio))}</b>
      </div>` : ''}
      ${(p.precio && p.costo) ? (() => {
        const m = ((p.precio - p.costo) / p.precio) * 100;
        const c = m < 0 ? 'var(--red)' : m < 15 ? 'var(--orange)' : 'var(--green-l)';
        return `<div class="total-linea" style="border-top:1px solid var(--line);">
          <span>Margen</span>
          <b style="color:${c}">${m.toFixed(1)}%</b>
        </div>`;
      })() : ''}
      ${!p.costo ? `<div class="total-linea" style="border-top:1px solid var(--line);">
        <span style="color:var(--orange);font-size:11.5px;">Falta el precio de compra</span>
        <b style="font-size:11.5px;color:var(--dim);">—</b>
      </div>` : ''}
      ` : ''}
    </div>

    ${p.activo === false ? `<div class="nota nota-baja">
      <span>📦</span>
      <div><b>Producto descontinuado.</b> No aparece en el catálogo ni en las
      sugerencias de compra, pero su historial y sus existencias siguen guardados.
      <button class="mini" onclick="reactivarProducto()">Volver a activarlo</button></div>
    </div>` : ''}

    ${sinContar.length ? `<div class="nota">
      <span>⚠️</span>
      <div>Las bodegas <b>${sinContar.join(', ')}</b> todavía no se han contado.
      Usa <b>Conteo</b> para registrar cuántas hay.</div>
    </div>` : ''}

    <div class="acciones">
      <button class="btn btn-verde" onclick="abrirMovimiento('ENTRADA')">↓ Entrada</button>
      <button class="btn btn-rojo" onclick="abrirMovimiento('SALIDA')">↑ Salida</button>
    </div>
    <div class="acciones">
      <button class="btn btn-linea" onclick="abrirMovimiento('TRASLADO')"
              style="font-size:12.5px;">⇄ Traslado</button>
      <button class="btn btn-linea" onclick="abrirConteo()"
              style="font-size:12.5px;">✎ Conteo</button>
    </div>

    <div class="tarjetas">
      <div class="tarjeta">
        <div class="n">${consumo || '—'}</div>
        <div class="e">Salidas al mes<br>(promedio)</div>
      </div>
      <div class="tarjeta">
        <div class="n" style="font-size:17px;">${dura}</div>
        <div class="e">Para cuánto<br>alcanza</div>
      </div>
    </div>

    <div class="nota">
      <span>${codigos.length ? '🏷️' : '📷'}</span>
      <div>${codigos.length
        ? `Tiene <b>${codigos.length}</b> código${codigos.length > 1 ? 's' : ''} de barras asociado${codigos.length > 1 ? 's' : ''}: ${codigos.map(c => `<b>${c}</b>`).join(', ')}`
        : 'Todavía no tiene código de barras asociado. Escanéalo una vez y quedará ligado.'}</div>
    </div>

    <div class="acciones" style="margin-top:10px;">
      <button class="btn btn-linea" style="font-size:12.5px;padding:12px;"
              onclick="abrirEditarProducto()">✏️ Editar</button>
      <button class="btn btn-linea" style="font-size:12.5px;padding:12px;"
              onclick="abrirQuitarProducto()">🗑️ Dar de baja</button>
    </div>

    <h2 class="titulo" style="margin-top:18px;">Últimos movimientos</h2>
    <div>${pintarMovsDe(p.ref, 8)}</div>
  `;

  ir('producto', false);
  marcarNav('escanear');
}

// ==========================================================
// ENTRADAS, SALIDAS Y TRASLADOS
// ==========================================================
let tipoMov = 'ENTRADA', cantidad = 1, bodegaDestino = null;

function abrirMovimiento(tipo) {
  const p = productoActual;
  const b = bodegaActual();

  if (p.stock[b] === null && tipo !== 'ENTRADA') {
    avisar(`La bodega ${b} no se ha contado. Usa Conteo primero.`, false);
    return;
  }

  tipoMov = tipo;
  cantidad = 1;
  bodegaDestino = BODEGAS.find(x => x !== b);

  const titulos = {
    ENTRADA:  ['Registrar entrada', 'Producto que llega a la bodega ' + b],
    SALIDA:   ['Registrar salida',  'Producto que sale de la bodega ' + b],
    TRASLADO: ['Trasladar',         'Mover producto de una bodega a otra']
  };

  $('p-movimiento').innerHTML = `
    <button class="btn btn-linea" style="margin-bottom:14px;padding:11px;font-size:12px;"
            onclick="abrirProducto(productoActual)">‹ Volver</button>

    <h2 class="titulo">${titulos[tipo][0]}</h2>
    <p class="sub">${titulos[tipo][1]}</p>

    <div class="ficha">
      <div class="ficha-top" style="padding:13px;">
        <div class="nombre" style="font-size:15px;">${p.nombre}</div>
        <span class="ref" style="font-size:12px;">${p.ref}</span>
      </div>
      <div class="total-linea">
        <span>${tipo === 'TRASLADO' ? 'Disponible en bodega ' + b : 'Actualmente en bodega ' + b}</span>
        <b>${p.stock[b] === null ? 'sin contar' : p.stock[b]}</b>
      </div>
    </div>

    ${tipo === 'TRASLADO' ? `
      <h2 class="titulo">¿A qué bodega va?</h2>
      <div class="chips" style="margin-bottom:16px;">
        ${BODEGAS.filter(x => x !== b).map(x => `
          <button class="${x === bodegaDestino ? 'on' : ''}"
                  onclick="fijarDestino(${x})">Bodega ${x}</button>`).join('')}
      </div>` : ''}

    <div class="contador">
      <button onclick="cambiarCantidad(-1)">−</button>
      <input id="inpCant" type="number" value="1" min="1" inputmode="numeric"
             onfocus="this.select()"
             oninput="cantidad=Math.max(1,parseInt(this.value)||1)">
      <button onclick="cambiarCantidad(1)">+</button>
    </div>

    <div class="rapidos">
      ${[1,2,4,10,20,50].map(n => `<button onclick="fijarCantidad(${n})">${n}</button>`).join('')}
    </div>

    <button class="btn ${tipo === 'ENTRADA' ? 'btn-verde' : tipo === 'SALIDA' ? 'btn-rojo' : 'btn-amarillo'}"
            onclick="guardarMovimiento()">
      ${tipo === 'ENTRADA' ? 'Confirmar entrada' : tipo === 'SALIDA' ? 'Confirmar salida' : 'Confirmar traslado'}
    </button>
  `;
  ir('movimiento', false);
  marcarNav('escanear');
}

function fijarDestino(nuevoDest) {
  bodegaDestino = nuevoDest;
  // Solo actualiza los chips visualmente — NO llama a abrirMovimiento()
  // porque eso reseteaba bodegaDestino y la cantidad seleccionada
  const bodegaOrigen = bodegaActual();
  const chips = document.querySelector('#p-movimiento .chips');
  if (chips) {
    chips.innerHTML = BODEGAS.filter(x => x !== bodegaOrigen).map(x => `
      <button class="${x === bodegaDestino ? 'on' : ''}"
              onclick="fijarDestino(${x})">Bodega ${x}</button>`).join('');
  }
}

function cambiarCantidad(d) {
  cantidad = Math.max(1, cantidad + d);
  $('inpCant').value = cantidad;
}

function fijarCantidad(n) {
  cantidad = n;
  $('inpCant').value = n;
}

function guardarMovimiento() {
  const p = productoActual;
  const b = bodegaActual();

  if (tipoMov === 'SALIDA' || tipoMov === 'TRASLADO') {
    const hay = p.stock[b] || 0;
    if (cantidad > hay) {
      avisar(`Solo hay ${hay} en la bodega ${b}`, false);
      return;
    }
  }

  if (tipoMov === 'ENTRADA') {
    p.stock[b] = (p.stock[b] || 0) + cantidad;
  } else if (tipoMov === 'SALIDA') {
    p.stock[b] = p.stock[b] - cantidad;
  } else {
    p.stock[b] = p.stock[b] - cantidad;
    p.stock[bodegaDestino] = (p.stock[bodegaDestino] || 0) + cantidad;
  }

  const mov = {
    ref:     p.ref,
    tipo:    tipoMov,
    cantidad,
    bodega:  b,
    destino: tipoMov === 'TRASLADO' ? bodegaDestino : null,
    fecha:   new Date().toISOString()
  };

  datos.movimientos.unshift(mov);

  guardar();

  // Sincronizar con Supabase (sube movimiento y stock nuevo)
  if (window.SB) window.SB.subirMovimiento(mov, { ...p.stock });

  const textos = {
    ENTRADA: `Entraron ${cantidad} a la bodega ${b}`,
    SALIDA: `Salieron ${cantidad} de la bodega ${b}`,
    TRASLADO: `${cantidad} pasaron de la bodega ${b} a la ${bodegaDestino}`
  };
  avisar(textos[tipoMov]);
  abrirProducto(p);
}

// ==========================================================
// CONTEO: fijar cuántas hay de verdad en una bodega
// ==========================================================
function abrirConteo() {
  const p = productoActual;
  abrirModal(`
    <h3>Conteo de existencias</h3>
    <p class="sub">Escribe cuántas unidades hay realmente en cada bodega.
       Se usa al hacer inventario físico.</p>

    <div style="margin-bottom:14px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${p.nombre}</div>
      <span class="ref" style="font-size:11.5px;">${p.ref}</span>
    </div>

    ${BODEGAS.map(b => `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        <div style="width:82px;font-size:13px;color:var(--dim);">Bodega ${b}</div>
        <input class="entrada" type="number" min="0" inputmode="numeric"
               id="cont${b}" value="${p.stock[b] === null ? '' : p.stock[b]}"
               placeholder="sin contar"
               style="flex:1;padding:11px;text-align:center;
                      font-family:'JetBrains Mono',monospace;font-size:17px;">
      </div>`).join('')}

    <button class="btn btn-amarillo" style="margin-top:14px;"
            onclick="guardarConteo()">Guardar conteo</button>
  `);
}

function guardarConteo() {
  const p = productoActual;
  let cambios = 0;
  const movsConteo = [];

  BODEGAS.forEach(b => {
    const v = $('cont' + b).value.trim();
    const nuevo = v === '' ? null : Math.max(0, parseInt(v) || 0);
    if (nuevo !== p.stock[b]) {
      // Un conteo también es un movimiento: hay que poder auditarlo después
      const mov = {
        ref: p.ref, tipo: 'CONTEO',
        cantidad: nuevo === null ? 0 : nuevo,
        anterior: p.stock[b],
        bodega: b, destino: null,
        fecha: new Date().toISOString()
      };
      datos.movimientos.unshift(mov);
      movsConteo.push(mov);
      p.stock[b] = nuevo;
      cambios++;
    }
  });

  guardar();

  // Sincronizar con Supabase: subir cada movimiento de conteo
  if (window.SB && cambios > 0) {
    // Solo necesitamos subir el último movimiento con el stock final completo
    movsConteo.forEach(mov => {
      window.SB.subirMovimiento(mov, { ...p.stock });
    });
  }

  cerrarModal();
  avisar(cambios ? `Conteo guardado (${cambios} bodega${cambios > 1 ? 's' : ''})` : 'Sin cambios');
  abrirProducto(p);
}

// ==========================================================
// CATÁLOGO
// ==========================================================
let filtroCat = 'TODOS';

function pintarCatalogo() {
  const cats = ['TODOS', ...new Set(activos().map(p => p.cat))];
  $('chipsCat').innerHTML = cats.map(c =>
    `<button class="${c === filtroCat ? 'on' : ''}" onclick="filtrarCat('${c}')">
      ${c === 'TODOS' ? 'Todos' : c}
    </button>`).join('') +
    `<button class="${filtroCat === '_SIN' ? 'on' : ''}" onclick="filtrarCat('_SIN')">Sin código</button>` +
    `<button class="${filtroCat === '_CERO' ? 'on' : ''}" onclick="filtrarCat('_CERO')">Agotados</button>` +
    `<button class="${filtroCat === '_NC' ? 'on' : ''}" onclick="filtrarCat('_NC')">Sin contar</button>` +
    (() => {
      const nBaja = datos.productos.filter(p => p.activo === false).length;
      return nBaja ? `<button class="${filtroCat === '_BAJA' ? 'on' : ''}"
        onclick="filtrarCat('_BAJA')">Descontinuados (${nBaja})</button>` : '';
    })();

  const q = $('buscarCat').value.trim().toUpperCase();
  const b = bodegaActual();

  // Por defecto el catálogo muestra solo lo que se sigue pidiendo
  let lista = filtroCat === '_BAJA'
    ? datos.productos.filter(p => p.activo === false)
    : activos();

  if (filtroCat === '_BAJA') {
    // el filtro ya se aplicó arriba
  } else if (filtroCat === '_SIN') {
    const conCodigo = new Set(Object.values(datos.barras));
    lista = lista.filter(p => !conCodigo.has(p.ref));
  } else if (filtroCat === '_CERO') {
    lista = lista.filter(p => contadas(p) > 0 && stockTotal(p) === 0);
  } else if (filtroCat === '_NC') {
    lista = lista.filter(p => contadas(p) === 0);
  } else if (filtroCat !== 'TODOS') {
    lista = lista.filter(p => p.cat === filtroCat);
  }

  if (q) {
    const n = normalizar(q);
    lista = lista.filter(p =>
      normalizar(p.ref).includes(n) ||
      p.nombre.toUpperCase().includes(q) ||
      (p.marca || '').toUpperCase().includes(q));
  }

  const act = activos();
  const sinContar = act.filter(p => contadas(p) < BODEGAS.length).length;
  const nBaja = datos.productos.length - act.length;
  $('catalogo-sub').innerHTML =
    `${act.length} referencias activas · ${lista.length} mostradas` +
    (sinContar ? `<br>${sinContar} sin contar en todas las bodegas` : '') +
    (nBaja ? `<br>${nBaja} descontinuada${nBaja === 1 ? '' : 's'} (ocultas)` : '');

  $('listaCatalogo').innerHTML = lista.length === 0
    ? '<div class="vacio">No hay productos que coincidan</div>'
    : lista.slice(0, 200).map(p => {
        const v = p.stock[b];
        const total = stockTotal(p);
        const color = v === null ? '#5C5B57' : (v > 0 ? 'var(--green-l)' : 'var(--red)');
        return `<div class="item ${p.activo === false ? 'baja' : ''}" onclick="abrirRef('${p.ref}')">
          <div class="izq">
            <div class="t">${p.activo === false ? '📦 ' : ''}${p.nombre}</div>
            <div class="s">${p.ref}${p.marca ? ' · ' + p.marca : ''}</div>
          </div>
          <div class="der">
            <div class="cant" style="color:${color}">${v === null ? '—' : v}</div>
            <div class="s" style="font-family:inherit;">total ${total}</div>
          </div>
        </div>`;
      }).join('') +
      (lista.length > 200 ? `<div class="vacio">Mostrando 200 de ${lista.length}. Afina la búsqueda.</div>` : '') +
      (filtroCat === '_BAJA' ? '' : `<div style="padding:18px 0 4px;text-align:center;">
        <button class="btn btn-linea" style="font-size:13px;padding:12px 22px;"
                onclick="_codigoEnCurso=null; _refPropuesta=null; abrirFormNuevoProducto()">
          ＋ Agregar producto nuevo al catálogo
        </button>
      </div>`);
}

function filtrarCat(c) {
  filtroCat = c;
  pintarCatalogo();
}

function abrirRef(ref) {
  const p = buscarPorRef(ref);
  if (p) abrirProducto(p);
}

// ==========================================================
// MOVIMIENTOS
// ==========================================================
let filtroMov = 'TODOS';

function pintarMovs() {
  $('chipsMovs').innerHTML = ['TODOS','ENTRADA','SALIDA','TRASLADO','CONTEO'].map(t =>
    `<button class="${t === filtroMov ? 'on' : ''}" onclick="filtrarMov('${t}')">
      ${t === 'TODOS' ? 'Todos' : t.charAt(0) + t.slice(1).toLowerCase()}
    </button>`).join('');

  let lista = datos.movimientos;
  if (filtroMov !== 'TODOS') lista = lista.filter(m => m.tipo === filtroMov);

  $('listaMovs').innerHTML = lista.length === 0
    ? '<div class="vacio">Todavía no hay movimientos registrados.<br>Escanea un producto y registra una entrada o salida.</div>'
    : lista.slice(0, 100).map(m => {
        const p = buscarPorRef(m.ref);
        const signo = m.tipo === 'ENTRADA' ? '+' : m.tipo === 'SALIDA' ? '−' : '';
        const clase = m.tipo === 'TRASLADO' ? 'traslado'
                    : m.tipo === 'CONTEO' ? '' : m.tipo.toLowerCase();
        const donde = m.tipo === 'TRASLADO'
          ? `Bodega ${m.bodega} → ${m.destino}`
          : `Bodega ${m.bodega}`;
        const etiqueta = m.tipo === 'CONTEO'
          ? `Conteo: ${m.anterior === null ? 'sin contar' : m.anterior} → ${m.cantidad}`
          : `${m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase()} · ${donde}`;

        return `<div class="mov ${clase}">
          <div style="min-width:0;flex:1;">
            <div class="t" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${p ? p.nombre : m.ref}
            </div>
            <div class="f">${etiqueta} · ${fechaCorta(m.fecha)}</div>
          </div>
          <div class="q">${m.tipo === 'CONTEO' ? '=' + m.cantidad : signo + m.cantidad}</div>
        </div>`;
      }).join('');
}

function filtrarMov(t) {
  filtroMov = t;
  pintarMovs();
}

function pintarMovsDe(ref, limite) {
  const l = datos.movimientos.filter(m => m.ref === ref).slice(0, limite);
  if (l.length === 0) return '<div class="vacio">Sin movimientos todavía</div>';

  return l.map(m => {
    const signo = m.tipo === 'ENTRADA' ? '+' : m.tipo === 'SALIDA' ? '−' : '';
    const clase = m.tipo === 'TRASLADO' ? 'traslado'
                : m.tipo === 'CONTEO' ? '' : m.tipo.toLowerCase();
    const donde = m.tipo === 'TRASLADO' ? `Bod ${m.bodega} → ${m.destino}` : `Bodega ${m.bodega}`;
    return `<div class="mov ${clase}">
      <div>
        <div class="t">${m.tipo.charAt(0) + m.tipo.slice(1).toLowerCase()}</div>
        <div class="f">${donde} · ${fechaCorta(m.fecha)}</div>
      </div>
      <div class="q">${m.tipo === 'CONTEO' ? '=' + m.cantidad : signo + m.cantidad}</div>
    </div>`;
  }).join('');
}

// ==========================================================
// INFORMES
// ==========================================================
let mesesCobertura = 3;

/// Promedio de salidas al mes, sobre los meses que llevan usando el sistema
function consumoMensual(ref) {
  const salidas = datos.movimientos.filter(m => m.ref === ref && m.tipo === 'SALIDA');
  if (salidas.length === 0) return 0;

  const total = salidas.reduce((s, m) => s + m.cantidad, 0);
  const masVieja = new Date(salidas[salidas.length - 1].fecha);
  const dias = Math.max(1, (Date.now() - masVieja.getTime()) / 86400000);
  const meses = Math.max(0.5, dias / 30);   // mínimo medio mes, para no inflar
  return Math.round(total / meses);
}

function pintarInformes() {
  const b = bodegaActual();
  const salidas = datos.movimientos.filter(m => m.tipo === 'SALIDA');
  const entradas = datos.movimientos.filter(m => m.tipo === 'ENTRADA');

  const totalSalidas = salidas.reduce((s, m) => s + m.cantidad, 0);
  const totalEntradas = entradas.reduce((s, m) => s + m.cantidad, 0);

  const valor  = datos.productos.reduce((s, p) => s + stockTotal(p) * (p.precio || 0), 0);
  const costoT = datos.productos.reduce((s, p) => s + stockTotal(p) * (p.costo  || 0), 0);
  const sinCostoCat = activos().filter(p => !p.costo).length;
  const unidades = datos.productos.reduce((s, p) => s + stockTotal(p), 0);
  // Agotado = se contó en alguna bodega y de verdad no hay.
  // Un producto que nunca se ha contado NO está agotado: no se sabe cuánto hay.
  const agotados = activos().filter(p =>
    contadas(p) > 0 && stockTotal(p) === 0).length;
  const nuncaContados = activos().filter(p => contadas(p) === 0).length;
  const descontinuados = datos.productos.filter(p => p.activo === false).length;
  const sinCodigo = datos.productos.length - new Set(Object.values(datos.barras)).size;

  // Ranking de los que más salen
  const porRef = {};
  salidas.forEach(m => { porRef[m.ref] = (porRef[m.ref] || 0) + m.cantidad; });
  const ranking = Object.entries(porRef)
    .map(([ref, n]) => ({ p: buscarPorRef(ref), n }))
    .filter(x => x.p)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);

  $('p-informes').innerHTML = `
    <h2 class="titulo">Informes</h2>
    <p class="sub">Los datos se van llenando con el uso diario del sistema</p>

    <div class="tarjetas">
      <div class="tarjeta">
        <div class="n" style="font-size:16px;">${pesos(valor)}</div>
        <div class="e">Valor a precio de venta<br>(sin IVA)</div>
      </div>
      <div class="tarjeta">
        <div class="n" style="font-size:16px;color:var(--ink);">${pesos(costoT)}</div>
        <div class="e">Valor a precio de compra<br>${sinCostoCat ? `(faltan ${sinCostoCat} refs)` : '(sin IVA)'}</div>
      </div>
      <div class="tarjeta">
        <div class="n">${unidades.toLocaleString('es-CO')}</div>
        <div class="e">Unidades en total<br>en las 5 bodegas</div>
      </div>
      <div class="tarjeta">
        <div class="n">${activos().length}</div>
        <div class="e">Referencias activas<br>${descontinuados ? `(${descontinuados} descontinuadas)` : 'en el catálogo'}</div>
      </div>
      <div class="tarjeta">
        <div class="n" style="color:${agotados ? 'var(--red)' : 'var(--green-l)'}">${agotados}</div>
        <div class="e">Agotados<br>(contados y en cero)</div>
      </div>
    </div>

    ${sinCostoCat ? `<div class="nota">
      <span>💰</span>
      <div><b>${sinCostoCat}</b> de ${activos().length} referencias activas no tienen
      precio de compra. Sin ese dato no se puede calcular cuánto hay que invertir
      para reponerlas. Se agrega en cada producto con <b>✎ Editar</b>.</div>
    </div>` : ''}

    ${nuncaContados ? `<div class="nota">
      <span>📋</span>
      <div><b>${nuncaContados}</b> referencias no se han contado en ninguna bodega,
      así que no cuentan como agotadas: simplemente no se sabe cuántas hay.</div>
    </div>` : ''}

    <h2 class="titulo">Existencias por bodega</h2>
    <p class="sub">Unidades contadas en cada una</p>
    ${(() => {
      const porBodega = BODEGAS.map(x => ({
        b: x,
        u: datos.productos.reduce((s, p) => s + (p.stock[x] || 0), 0),
        sin: datos.productos.filter(p => p.stock[x] === null).length
      }));
      const max = Math.max(...porBodega.map(x => x.u), 1);
      return porBodega.map(x => `
        <div class="barra-fila">
          <div class="barra-top">
            <span class="nm">Bodega ${x.b}${x.b === b ? ' (estás aquí)' : ''}</span>
            <b>${x.u.toLocaleString('es-CO')}</b>
          </div>
          <div class="barra"><i style="width:${(x.u / max) * 100}%"></i></div>
          ${x.sin ? `<div class="sub" style="margin:4px 0 0;font-size:10.5px;">
            ${x.sin} referencias sin contar</div>` : ''}
        </div>`).join('');
    })()}

    <h2 class="titulo" style="margin-top:24px;">Movimiento registrado</h2>
    <div class="tarjetas">
      <div class="tarjeta">
        <div class="n" style="color:var(--green-l)">${totalEntradas}</div>
        <div class="e">Unidades que<br>han entrado</div>
      </div>
      <div class="tarjeta">
        <div class="n" style="color:#f08080">${totalSalidas}</div>
        <div class="e">Unidades que<br>han salido</div>
      </div>
    </div>

    <h2 class="titulo" style="margin-top:24px;">Los que más salen</h2>
    ${ranking.length === 0
      ? `<div class="vacio">Todavía no hay salidas registradas.<br>
         Este informe se llena cuando empiecen a usar el sistema a diario.</div>`
      : ranking.map(r => `
        <div class="barra-fila">
          <div class="barra-top">
            <span class="nm">${r.p.nombre}</span>
            <b>${r.n}</b>
          </div>
          <div class="barra"><i style="width:${(r.n / ranking[0].n) * 100}%"></i></div>
        </div>`).join('')}

    <h2 class="titulo" style="margin-top:26px;">Qué conviene comprar</h2>
    <p class="sub">Cantidad e inversión según lo que se ha consumido.
       Elige para cuánto tiempo quieres cubrirte:</p>
    <div class="chips chips-sep">
      ${[1,3,6].map(n => `<button class="${mesesCobertura === n ? 'on' : ''}"
        onclick="cambiarCobertura(${n})">${n} ${n === 1 ? 'mes' : 'meses'}</button>`).join('')}
    </div>
    ${sugerencias()}

    <div class="nota" style="margin-top:22px;">
      <span>🏷️</span>
      <div><b>${sinCodigo}</b> de ${datos.productos.length} referencias todavía no
      tienen código de barras asociado. Se van asociando solas a medida que se
      escanean en el día a día.</div>
    </div>

    <button class="btn btn-linea" style="margin-top:18px;font-size:12.5px;"
            onclick="abrirDatos()">Copia de seguridad</button>
  `;
}

function cambiarCobertura(n) {
  mesesCobertura = n;
  pintarInformes();
}

/** Calcula qué conviene pedir y cuánto cuesta. Devuelve la lista y los totales. */
function _calcularPedido() {
  const lista = activos()
    .map(p => {
      const c = consumoMensual(p.ref);
      if (c === 0) return null;
      const reserva = Math.ceil(c * 0.3);
      const hay = stockTotal(p);
      const pedir = Math.max(0, c * mesesCobertura + reserva - hay);
      return { p, c, reserva, hay, pedir, inversion: pedir * (p.costo || 0) };
    })
    .filter(Boolean)
    .filter(x => x.pedir > 0)
    .sort((a, b) => b.inversion - a.inversion || b.pedir - a.pedir);

  const inversion  = lista.reduce((s, x) => s + x.inversion, 0);
  const unidades   = lista.reduce((s, x) => s + x.pedir, 0);
  const sinCosto   = lista.filter(x => !x.p.costo).length;

  return { lista, inversion, unidades, sinCosto };
}

function sugerencias() {
  const hayConsumo = activos().some(p => consumoMensual(p.ref) > 0);

  if (!hayConsumo) {
    return `<div class="vacio">Todavía no hay consumo registrado.<br>
      Después de unas semanas de uso, aquí aparecerá cuánto conviene pedir
      de cada producto y cuánto hay que invertir.</div>`;
  }

  const { lista, inversion, unidades, sinCosto } = _calcularPedido();

  if (lista.length === 0) {
    return `<div class="vacio">Con las existencias actuales alcanza para los
      próximos ${mesesCobertura} ${mesesCobertura === 1 ? 'mes' : 'meses'}.</div>`;
  }

  const meses = `${mesesCobertura} ${mesesCobertura === 1 ? 'mes' : 'meses'}`;

  // ---- Resumen de inversión ----
  const resumen = `
    <div class="inversion">
      <div class="inv-tit">Inversión estimada para ${meses}</div>
      <div class="inv-monto">${pesos(inversion)}</div>
      <div class="inv-sub">
        ${unidades.toLocaleString('es-CO')} unidades ·
        ${lista.length} referencias · precios de compra sin IVA
      </div>
      <div class="inv-iva">
        Con IVA del ${Math.round(IVA * 100)}%: <b>${pesos(conIVA(inversion))}</b>
      </div>
      ${sinCosto ? `<div class="inv-alerta">
        ⚠️ ${sinCosto} ${sinCosto === 1 ? 'referencia no tiene' : 'referencias no tienen'}
        precio de compra, así que ${sinCosto === 1 ? 'no está' : 'no están'} sumando.
        La inversión real es mayor.
      </div>` : ''}
    </div>`;

  // ---- Detalle por producto ----
  const detalle = lista.slice(0, 15).map(x => `
    <div class="tarjeta" style="margin-bottom:9px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:13.5px;font-weight:600;line-height:1.3;">${x.p.nombre}</div>
          <div class="s" style="font-family:'JetBrains Mono',monospace;
               font-size:10.5px;color:var(--dim);margin-top:3px;">${x.p.ref}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:22px;
                      font-weight:700;color:var(--yellow);line-height:1;">${x.pedir}</div>
          <div style="font-size:8.5px;color:var(--dim);letter-spacing:1px;">PEDIR</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;
                  margin-top:10px;padding-top:9px;border-top:1px solid var(--line);">
        <span style="font-size:11px;color:var(--dim);">Costo de este pedido</span>
        ${x.p.costo
          ? `<b style="font-family:'JetBrains Mono',monospace;font-size:14px;">${pesos(x.inversion)}</b>`
          : `<span style="font-size:11px;color:var(--orange);">sin precio de compra</span>`}
      </div>

      <div style="font-size:11px;color:var(--dim);line-height:1.55;margin-top:8px;">
        Salen <b style="color:var(--ink)">${x.c} al mes</b>. Para ${meses}
        hacen falta <b style="color:var(--ink)">${x.c * mesesCobertura}</b>, más
        <b style="color:var(--ink)">${x.reserva}</b> de reserva.
        Hay <b style="color:var(--ink)">${x.hay}</b> entre todas las bodegas.
      </div>
    </div>`).join('');

  const masDe15 = lista.length > 15
    ? `<div class="vacio" style="padding:14px;font-size:12px;">
         Mostrando las 15 de mayor inversión, de ${lista.length} en total.</div>`
    : '';

  return resumen + detalle + masDe15;
}

// ==========================================================
// COPIA DE SEGURIDAD E INVENTARIO
// ==========================================================
function abrirDatos() {
  const conCodigo = Object.keys(datos.barras).length;
  const totalProductos = datos.productos.length;
  const unidades = datos.productos.reduce((s, p) => s + stockTotal(p), 0);

  abrirModal(`
    <h3>Inventario y respaldo</h3>
    <p class="sub">Descarga el inventario en PDF o Excel, o haz una copia de seguridad de todos los datos.</p>

    <div class="tarjetas" style="margin-bottom:16px;">
      <div class="tarjeta">
        <div class="n">${totalProductos}</div>
        <div class="e">Productos<br>en catálogo</div>
      </div>
      <div class="tarjeta">
        <div class="n">${unidades.toLocaleString('es-CO')}</div>
        <div class="e">Unidades<br>en total</div>
      </div>
    </div>

    <button class="btn btn-amarillo" style="margin-bottom:9px;"
            onclick="elegirFormatoDescarga('inventario')">
      ⬇ Descargar inventario (PDF o Excel)
    </button>

    <button class="btn btn-linea" onclick="abrirInventarioCompleto()">
      📋 Ver inventario completo en pantalla
    </button>

    <div class="separador">COPIA DE SEGURIDAD</div>

    <div class="tarjetas" style="margin-bottom:16px;">
      <div class="tarjeta">
        <div class="n">${datos.movimientos.length}</div>
        <div class="e">Movimientos<br>registrados</div>
      </div>
      <div class="tarjeta">
        <div class="n">${conCodigo}</div>
        <div class="e">Códigos de barras<br>asociados</div>
      </div>
    </div>

    <button class="btn btn-linea" onclick="descargarDatos()" style="margin-bottom:10px;">
      Descargar copia técnica (JSON)
    </button>
    <div style="font-size:11px;color:var(--dim);text-align:center;margin:-4px 0 12px;">
      Guarda todo (productos, movimientos y códigos) para poder restaurarlo
    </div>
    <input type="file" id="archivoRest" accept=".json" style="display:none"
           onchange="restaurarDatos(this)">
    <button class="btn btn-linea" onclick="document.getElementById('archivoRest').click()">
      Cargar una copia
    </button>

    <div class="separador">ZONA DE RIESGO</div>
    <button class="btn btn-rojo" style="font-size:12.5px;" onclick="borrarTodo()">
      Borrar todo y empezar de cero
    </button>
  `);
}

// ==========================================================
// VER Y DESCARGAR INVENTARIO (PDF / EXCEL)
// ==========================================================

function _obtenerDatosInventario() {
  // Agrupar por categoría y ordenar
  // El inventario incluye los descontinuados que aún tienen existencias:
  // esa mercancía sigue siendo del negocio y hay que verla en el conteo.
  const universo = datos.productos.filter(p => p.activo !== false || stockTotal(p) > 0);
  const cats = [...new Set(universo.map(p => p.cat))].sort();
  const filas = [];

  cats.forEach(cat => {
    const prods = universo
      .filter(p => p.cat === cat)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    prods.forEach(p => {
      filas.push({
        cat,
        nombre: p.nombre,
        ref: p.ref,
        cantidad: stockTotal(p),
        costo: p.costo || 0,
        precio: p.precio || 0,
        baja: p.activo === false
      });
    });
  });

  return filas;
}

function abrirInventarioCompleto() {
  const filas = _obtenerDatosInventario();
  const fecha = new Date();
  const fechaStr = `${fecha.getDate()}/${fecha.getMonth()+1}/${fecha.getFullYear()}`;

  let catActual = '';
  const filasHTML = filas.map(f => {
    let cabecera = '';
    if (f.cat !== catActual) {
      catActual = f.cat;
      cabecera = `<tr class="inv-cat"><td colspan="3">${f.cat}</td></tr>`;  // 3 columnas
    }
    return cabecera + `<tr>
      <td>${f.nombre}<div class="inv-ref">${f.ref}</div></td>
      <td class="inv-cant">${f.cantidad}</td>
      <td class="inv-cant" style="font-size:10.5px;">${f.costo ? pesos(f.costo) : '—'}</td>
    </tr>`;
  }).join('');

  const totalUnidades = filas.reduce((s, f) => s + f.cantidad, 0);

  abrirModal(`
    <h3>Inventario completo</h3>
    <p class="sub">${filas.length} productos · ${totalUnidades.toLocaleString('es-CO')} unidades · ${fechaStr}</p>

    <div class="inv-tabla-caja">
      <table class="inv-tabla">
        <thead>
          <tr><th>Producto</th><th>Cant.</th><th>Compra</th></tr>
        </thead>
        <tbody>
          ${filasHTML}
        </tbody>
        <tfoot>
          <tr><td style="text-align:right;font-weight:600;">Total</td>
              <td class="inv-cant" style="font-weight:700;">${totalUnidades.toLocaleString('es-CO')}</td>
              <td class="inv-cant" style="font-weight:700;font-size:10.5px;">${pesos(filas.reduce((a,f)=>a+f.costo*f.cantidad,0))}</td></tr>
        </tfoot>
      </table>
    </div>

    <div style="display:flex;gap:10px;margin-top:16px;">
      <button class="btn btn-amarillo" style="flex:1;font-size:13px;" onclick="descargarInventarioPDF()">
        📄 PDF
      </button>
      <button class="btn btn-verde" style="flex:1;font-size:13px;" onclick="descargarInventarioExcel()">
        📊 Excel
      </button>
    </div>
    <button class="btn btn-linea" style="margin-top:9px;font-size:12.5px;padding:11px;"
            onclick="descargarLosDos()">
      Descargar los dos
    </button>
  `);
}

/**
 * Pregunta en qué formato se quiere el archivo antes de descargar.
 * origen: 'inventario' (PDF/Excel) o 'copia' (PDF/Excel/JSON técnico)
 */
function elegirFormatoDescarga(origen = 'inventario') {
  const filas = _obtenerDatosInventario();
  const unidades = filas.reduce((s, f) => s + f.cantidad, 0);

  abrirModal(`
    <h3>Descargar inventario</h3>
    <p class="sub">${filas.length} productos · ${unidades.toLocaleString('es-CO')} unidades.
       Elige en qué formato lo quieres.</p>

    <button class="btn btn-amarillo" style="margin-bottom:9px;"
            onclick="descargarInventarioPDF()">
      📄 Descargar en PDF
    </button>
    <div style="font-size:11px;color:var(--dim);text-align:center;margin-bottom:16px;">
      Para imprimir o enviar por WhatsApp
    </div>

    <button class="btn btn-verde" style="margin-bottom:9px;"
            onclick="descargarInventarioExcel()">
      📊 Descargar en Excel
    </button>
    <div style="font-size:11px;color:var(--dim);text-align:center;margin-bottom:16px;">
      Para editar, filtrar o pasar al contador
    </div>

    <button class="btn btn-linea" style="margin-bottom:9px;font-size:12.5px;"
            onclick="descargarLosDos()">
      Descargar los dos (PDF + Excel)
    </button>

    ${origen === 'copia' ? `
    <div class="separador">RESPALDO TÉCNICO</div>
    <button class="btn btn-linea" style="font-size:12.5px;" onclick="descargarDatos()">
      Copia completa (JSON) — para restaurar la app
    </button>` : ''}

    <button class="btn btn-linea" style="margin-top:14px;font-size:12.5px;padding:11px;"
            onclick="cerrarModal()">
      Cancelar
    </button>
  `);
}

// Archivos recién guardados. Se guardan aquí en vez de incrustar el URI en el
// HTML: un content:// dentro de un onclick rompe el atributo.
let _archivosDescargados = [];

/** Abre uno de los archivos que se acaban de guardar. */
async function _abrirDescargado(i) {
  const a = _archivosDescargados[i];
  if (!a || !a.uri) { avisar('No se encontró el archivo', false); return; }
  const r = await Descargas.abrir(a.uri, a.mime);
  if (!r || !r.ok) {
    avisar(r && r.error ? r.error : 'No hay ninguna app para abrir este archivo', false);
  } else if (r.aviso) {
    avisar(r.aviso);
  }
}

/** Muestra el resultado real de la descarga, con botón para abrir el archivo. */
function _avisarDescarga(res, nombre) {
  if (!res || !res.ok) {
    abrirModal(`
      <h3>No se pudo guardar</h3>
      <p class="sub">${(res && res.error) || 'Ocurrió un error inesperado.'}</p>
      <button class="btn btn-linea" onclick="cerrarModal()">Entendido</button>
    `);
    return;
  }

  const puedeAbrir = res.nativo && res.uri;
  _archivosDescargados = puedeAbrir ? [res] : [];
  abrirModal(`
    <h3>✓ Descarga completa</h3>
    <p class="sub">El archivo quedó guardado en tu teléfono.</p>

    <div style="background:var(--panel2);border-radius:9px;padding:13px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:600;word-break:break-all;margin-bottom:5px;">
        ${nombre}
      </div>
      <div style="font-size:11.5px;color:var(--dim);">📁 ${res.ruta}</div>
    </div>

    ${puedeAbrir ? `
    <button class="btn btn-amarillo" style="margin-bottom:9px;"
            onclick="_abrirDescargado(0)">
      Abrir archivo
    </button>` : ''}

    <button class="btn btn-linea" onclick="cerrarModal()">Listo</button>
  `);
}

/** Cede el hilo un instante para que se alcance a pintar el aviso en pantalla. */
function _respirar() {
  return new Promise(r => setTimeout(r, 60));
}

function _nombreArchivo(ext) {
  const f = new Date();
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  return `inventario-frenospala-${f.getFullYear()}-${mm}-${dd}_${hh}${mi}.${ext}`;
}

// ---------------- PDF ----------------

/** Construye el PDF y devuelve el blob (sin descargarlo). */
function _construirPDF() {
  if (!window.jspdf) throw new Error('La librería para PDF no cargó. Cierra y vuelve a abrir la app.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const filas = _obtenerDatosInventario();
  const fecha = new Date();
  const fechaStr = `${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()} ${fecha.toTimeString().slice(0, 5)}`;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Inventario — Frenos Pala', 14, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const totC = filas.reduce((a, f) => a + f.costo  * f.cantidad, 0);
  const totV = filas.reduce((a, f) => a + f.precio * f.cantidad, 0);
  doc.text(`Fecha: ${fechaStr}`, 14, 27);
  doc.text(`${filas.length} productos`, 14, 32);
  doc.text(`Valor a compra: ${pesos(totC)}   |   Valor a venta sin IVA: ${pesos(totV)}`, 14, 37);

  const cuerpo = [];
  let catActual = '';
  filas.forEach(f => {
    if (f.cat !== catActual) {
      catActual = f.cat;
      cuerpo.push([{
        content: f.cat, colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: [44, 44, 40], textColor: [242, 183, 5], fontSize: 9 }
      }]);
    }
    cuerpo.push([
      f.nombre + (f.baja ? '  [descontinuado]' : ''), f.ref,
      { content: String(f.cantidad), styles: { halign: 'center', fontStyle: 'bold' } },
      { content: f.costo  ? pesos(f.costo)  : '—', styles: { halign: 'right' } },
      { content: f.precio ? pesos(f.precio) : '—', styles: { halign: 'right' } }
    ]);
  });

  const totalUnidades = filas.reduce((s, f) => s + f.cantidad, 0);
  cuerpo.push([
    { content: 'Total', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
    { content: String(totalUnidades), styles: { halign: 'center', fontStyle: 'bold' } },
    { content: pesos(totC), styles: { halign: 'right', fontStyle: 'bold' } },
    { content: pesos(totV), styles: { halign: 'right', fontStyle: 'bold' } }
  ]);

  if (typeof doc.autoTable !== 'function') {
    throw new Error('El complemento de tablas del PDF no cargó. Cierra y vuelve a abrir la app.');
  }
  doc.autoTable({
    startY: 42,
    head: [['Producto', 'Referencia', 'Cant.', 'Compra', 'Venta']],
    body: cuerpo,
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [28, 29, 31], textColor: [237, 237, 231], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 34, fontSize: 7 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 25, halign: 'right', fontSize: 7.5 },
      4: { cellWidth: 25, halign: 'right', fontSize: 7.5 }
    },
    theme: 'grid',
    margin: { left: 14, right: 14 },
    didDrawPage: (d) => {
      const pag = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(`Página ${pag}`, d.settings.margin.left, doc.internal.pageSize.getHeight() - 8);
    }
  });

  // ---- Página de compras sugeridas ----
  const pedido = _calcularPedido();
  if (pedido.lista.length) {
    doc.addPage();
    const meses = mesesCobertura === 1 ? '1 mes' : `${mesesCobertura} meses`;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Compras sugeridas — ${meses}`, 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Inversión estimada sin IVA: ${pesos(pedido.inversion)}`, 14, 28);
    doc.text(`Con IVA del ${Math.round(IVA * 100)}%: ${pesos(conIVA(pedido.inversion))}`, 14, 33);
    doc.text(`${pedido.unidades} unidades · ${pedido.lista.length} referencias`, 14, 38);
    if (pedido.sinCosto) {
      doc.setTextColor(200, 90, 20);
      doc.text(`${pedido.sinCosto} referencias sin precio de compra: la inversión real es mayor.`, 14, 43);
      doc.setTextColor(0);
    }

    doc.autoTable({
      startY: pedido.sinCosto ? 48 : 43,
      head: [['Producto', 'Referencia', 'Salen/mes', 'Hay', 'Pedir', 'Inversión']],
      body: pedido.lista.map(x => [
        x.p.nombre, x.p.ref,
        { content: String(x.c), styles: { halign: 'center' } },
        { content: String(x.hay), styles: { halign: 'center' } },
        { content: String(x.pedir), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: x.p.costo ? pesos(x.inversion) : '—', styles: { halign: 'right' } }
      ]).concat([[
        { content: 'Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: String(pedido.unidades), styles: { halign: 'center', fontStyle: 'bold' } },
        { content: pesos(pedido.inversion), styles: { halign: 'right', fontStyle: 'bold' } }
      ]]),
      styles: { fontSize: 8, cellPadding: 2.2 },
      headStyles: { fillColor: [28, 29, 31], textColor: [237, 237, 231], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 32, fontSize: 7 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 28, halign: 'right' }
      },
      theme: 'grid',
      margin: { left: 14, right: 14 }
    });
  }

  return doc.output('blob');
}

async function descargarInventarioPDF() {
  const nombre = _nombreArchivo('pdf');
  avisar('Generando PDF...');
  await _respirar();
  try {
    const blob = _construirPDF();
    const res = await Descargas.guardar(blob, nombre, 'pdf');
    _avisarDescarga(res, nombre);
  } catch (e) {
    _avisarDescarga({ ok: false, error: e.message }, nombre);
  }
}

// ---------------- Excel ----------------

/** Construye el Excel y devuelve el blob (sin descargarlo). */
function _construirExcel() {
  if (!window.XLSX) throw new Error('La librería para Excel no cargó. Cierra y vuelve a abrir la app.');

  const filas = _obtenerDatosInventario();
  const fecha = new Date();
  const fechaStr = `${fecha.getDate()}/${fecha.getMonth() + 1}/${fecha.getFullYear()}`;

  const datosHoja = [
    ['Inventario — Frenos Pala'],
    [`Fecha: ${fechaStr}`],
    [`IVA aplicado: ${Math.round(IVA * 100)}%`],
    [],
    ['Categoría', 'Producto', 'Referencia', 'Cantidad',
     'Compra sin IVA', 'Venta sin IVA', `Venta con IVA`,
     'Valor a compra', 'Valor a venta']
  ];
  filas.forEach(f => datosHoja.push([
    f.cat, f.nombre + (f.baja ? ' (DESCONTINUADO)' : ''), f.ref, f.cantidad,
    f.costo || '', f.precio || '', f.precio ? Math.round(conIVA(f.precio)) : '',
    f.costo ? Math.round(f.costo * f.cantidad) : '',
    f.precio ? Math.round(f.precio * f.cantidad) : ''
  ]));

  const totalUnidades = filas.reduce((s, f) => s + f.cantidad, 0);
  const totalCompra   = filas.reduce((s, f) => s + f.costo  * f.cantidad, 0);
  const totalVenta    = filas.reduce((s, f) => s + f.precio * f.cantidad, 0);
  datosHoja.push([]);
  datosHoja.push(['', '', 'TOTAL', totalUnidades, '', '', '',
                  Math.round(totalCompra), Math.round(totalVenta)]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(datosHoja);
  ws['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 20 }, { wch: 10 },
                 { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

  // Hoja de compras sugeridas, si ya hay consumo registrado
  const pedido = _calcularPedido();
  if (pedido.lista.length) {
    const meses = mesesCobertura;
    const compras = [
      [`Compras sugeridas para ${meses} ${meses === 1 ? 'mes' : 'meses'}`],
      [`Fecha: ${fechaStr}`],
      [],
      ['Referencia', 'Producto', 'Categoría', 'Salen al mes', 'Hay ahora',
       'Pedir', 'Compra unitaria', 'Inversión sin IVA']
    ];
    pedido.lista.forEach(x => compras.push([
      x.p.ref, x.p.nombre, x.p.cat, x.c, x.hay, x.pedir,
      x.p.costo || '', x.p.costo ? Math.round(x.inversion) : ''
    ]));
    compras.push([]);
    compras.push(['', '', '', '', '', pedido.unidades, 'TOTAL', Math.round(pedido.inversion)]);
    compras.push(['', '', '', '', '', '', `Con IVA ${Math.round(IVA*100)}%`,
                  Math.round(conIVA(pedido.inversion))]);

    const ws3 = XLSX.utils.aoa_to_sheet(compras);
    ws3['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 18 }, { wch: 13 },
                    { wch: 11 }, { wch: 9 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Compras sugeridas');
  }

  // Segunda hoja: detalle por bodega
  const detalle = [['Referencia', 'Producto', 'Categoría', 'Marca',
                    ...BODEGAS.map(b => `Bodega ${b}`), 'Total',
                    'Compra sin IVA', 'Venta sin IVA']];
  datos.productos.forEach(p => {
    detalle.push([p.ref, p.nombre + (p.activo === false ? ' (DESCONTINUADO)' : ''), p.cat, p.marca || '',
      ...BODEGAS.map(b => (p.stock[b] === null ? 'sin contar' : p.stock[b])),
      stockTotal(p), p.costo || '', p.precio || '']);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(detalle);
  ws2['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 18 }, { wch: 12 },
                  ...BODEGAS.map(() => ({ wch: 11 })), { wch: 10 },
                  { wch: 15 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Por bodega');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

async function descargarInventarioExcel() {
  const nombre = _nombreArchivo('xlsx');
  avisar('Generando Excel...');
  await _respirar();
  try {
    const blob = _construirExcel();
    const res = await Descargas.guardar(blob, nombre, 'xlsx');
    _avisarDescarga(res, nombre);
  } catch (e) {
    _avisarDescarga({ ok: false, error: e.message }, nombre);
  }
}

// ---------------- Los dos a la vez ----------------

async function descargarLosDos() {
  avisar('Generando los dos archivos...');
  await _respirar();
  const nPdf = _nombreArchivo('pdf');
  const nXls = _nombreArchivo('xlsx');
  try {
    const r1 = await Descargas.guardar(_construirPDF(), nPdf, 'pdf');
    const r2 = await Descargas.guardar(_construirExcel(), nXls, 'xlsx');

    if (!r1.ok || !r2.ok) {
      _avisarDescarga({ ok: false, error: (r1.error || r2.error) }, nPdf);
      return;
    }

    _archivosDescargados = [r1, r2];

    abrirModal(`
      <h3>✓ Descarga completa</h3>
      <p class="sub">Los dos archivos quedaron guardados en tu teléfono.</p>

      <div style="background:var(--panel2);border-radius:9px;padding:13px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:600;word-break:break-all;">📄 ${nPdf}</div>
      </div>
      <div style="background:var(--panel2);border-radius:9px;padding:13px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;word-break:break-all;">📊 ${nXls}</div>
      </div>
      <div style="font-size:11.5px;color:var(--dim);margin-bottom:16px;">📁 ${r1.ruta}</div>

      ${r1.nativo && r1.uri ? `
      <button class="btn btn-amarillo" style="margin-bottom:8px;"
              onclick="_abrirDescargado(0)">
        Abrir el PDF
      </button>
      <button class="btn btn-verde" style="margin-bottom:8px;"
              onclick="_abrirDescargado(1)">
        Abrir el Excel
      </button>` : ''}

      <button class="btn btn-linea" onclick="cerrarModal()">Listo</button>
    `);
  } catch (e) {
    _avisarDescarga({ ok: false, error: e.message }, nPdf);
  }
}

// ---------------- Copia técnica (JSON) ----------------

async function descargarDatos() {
  const nombre = _nombreArchivo('json');
  try {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const res = await Descargas.guardar(blob, nombre, 'json');
    _avisarDescarga(res, nombre);
  } catch (e) {
    _avisarDescarga({ ok: false, error: e.message }, nombre);
  }
}

function restaurarDatos(input) {
  const f = input.files[0];
  if (!f) return;
  const lector = new FileReader();
  lector.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!Array.isArray(d.productos)) throw new Error('formato');
      datos = Object.assign(datos, d);
      guardar();
      cerrarModal();
      avisar('Copia restaurada');
      pintarCatalogo();
    } catch (err) {
      avisar('Ese archivo no es una copia válida', false);
    }
  };
  lector.readAsText(f);
}

function borrarTodo() {
  if (!confirm('Se borrarán TODOS los movimientos, conteos y códigos asociados. ¿Seguro?')) return;
  localStorage.removeItem(CLAVE);
  location.reload();
}

// ==========================================================
// VENTANA MODAL
// ==========================================================
function abrirModal(html) {
  $('modal-caja').innerHTML = html;
  $('modal').classList.add('on');
}

function cerrarModal() {
  $('modal').classList.remove('on');
}

$('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') cerrarModal();
});

// ==========================================================
// ARRANQUE
// ==========================================================
function pintarRecientes() {
  const l = datos.recientes.map(r => buscarPorRef(r)).filter(Boolean);
  $('recientes').innerHTML = l.length === 0
    ? '<div class="vacio" style="padding:22px;">Aquí aparecerán los productos que consultes.</div>'
    : l.map(p => `
      <div class="item" onclick="abrirRef('${p.ref}')">
        <div class="izq">
          <div class="t">${p.nombre}</div>
          <div class="s">${p.ref}</div>
        </div>
        <div class="der"><span style="color:var(--yellow);font-size:19px;">›</span></div>
      </div>`).join('');
}

async function iniciar() {
  // 1. Inicializar Supabase (antes de cargar, para que cargar() pueda usarlo)
  if (window.SB) window.SB.inicializar();

  // 2. Cargar datos (localStorage primero, luego sincroniza con Supabase si está configurado)
  await cargar();

  $('selBodega').innerHTML = BODEGAS.map(b =>
    `<option value="${b}" ${b === datos.bodega ? 'selected' : ''}>Bodega ${b}</option>`).join('');

  $('selBodega').addEventListener('change', e => {
    datos.bodega = parseInt(e.target.value);
    guardar();
    avisar(`Trabajando en la bodega ${datos.bodega}`);
    if (pantalla === 'catalogo') pintarCatalogo();
    if (pantalla === 'informes') pintarInformes();
    if (pantalla === 'producto' && productoActual) abrirProducto(productoActual);
  });

  pintarRecientes();
  pintarCatalogo();
}

iniciar();
