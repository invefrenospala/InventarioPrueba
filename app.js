// ==========================================================
// INVENTARIO — Frenos Pala
// ==========================================================
// Los datos viven en el navegador (localStorage). Es suficiente para
// operar y para demostrar; cuando el proyecto se apruebe, esto mismo
// se conecta a una base de datos igual que el sistema de turnos.

const BODEGAS = [1, 2, 3, 4, 5];
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CLAVE = 'frenospala_inventario_v1';

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
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch (e) {
    console.warn('No se pudo guardar:', e);
  }
}

function cargar() {
  let previo = null;
  try {
    const t = localStorage.getItem(CLAVE);
    if (t) previo = JSON.parse(t);
  } catch (e) { /* si está dañado, se arranca de cero */ }

  if (previo && Array.isArray(previo.productos) && previo.productos.length) {
    datos = Object.assign(datos, previo);
    // Por si el catálogo del archivo creció desde la última vez
    const conocidas = new Set(datos.productos.map(p => p.ref));
    CATALOGO.forEach(c => {
      if (!conocidas.has(c.ref)) datos.productos.push(nuevoProducto(c));
    });
  } else {
    datos.productos = CATALOGO.map(nuevoProducto);
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
    precio: c.precio || 0,
    minimo: 0,          // lo define el taller con el uso
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

function normalizar(t) {
  return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function buscarPorRef(texto) {
  const n = normalizar(texto);
  if (!n) return null;
  return datos.productos.find(p => normalizar(p.ref) === n) || null;
}

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
    datos.barras[codigo] = directo.ref;   // queda asociado para la próxima
    guardar();
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
  avisar('No se encontró esa referencia', false);
}

$('entradaRef').addEventListener('keydown', e => {
  if (e.key === 'Enter') buscarEscrito();
});

// ==========================================================
// ASOCIAR UN CÓDIGO DE BARRAS A UN PRODUCTO
// ==========================================================
function pedirAsociacion(codigo) {
  abrirModal(`
    <h3>Código sin asociar</h3>
    <p class="sub">Este código de barras todavía no está ligado a ningún
       producto. Dime cuál es y quedará listo para siempre.</p>

    <div style="background:var(--panel2);border-radius:9px;padding:12px;
                text-align:center;margin-bottom:14px;">
      <div style="font-family:'JetBrains Mono',monospace;font-size:16px;
                  color:var(--yellow);letter-spacing:1px;">${codigo}</div>
    </div>

    <input class="entrada" id="buscarAsoc" placeholder="Buscar por referencia o nombre..."
           autocomplete="off" oninput="pintarAsociacion('${codigo}')">
    <div id="listaAsoc" style="margin-top:12px;max-height:44vh;overflow-y:auto;"></div>
  `);
  setTimeout(() => { const b = $('buscarAsoc'); if (b) b.focus(); }, 250);
  pintarAsociacion(codigo);
}

function pintarAsociacion(codigo) {
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
      <div class="item" onclick="asociar('${codigo}','${p.ref}')">
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
  cerrarModal();
  avisar('Código asociado. La próxima vez se abre solo.');
  const p = buscarPorRef(ref);
  if (p) abrirProducto(p);
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
      ${p.precio ? `<div class="total-linea" style="border-top:1px solid var(--line);">
        <span>Precio de venta (sin IVA)</span>
        <b>${pesos(p.precio)}</b>
      </div>` : ''}
    </div>

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

function fijarDestino(b) {
  bodegaDestino = b;
  abrirMovimiento('TRASLADO');
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

  datos.movimientos.unshift({
    ref: p.ref,
    tipo: tipoMov,
    cantidad,
    bodega: b,
    destino: tipoMov === 'TRASLADO' ? bodegaDestino : null,
    fecha: new Date().toISOString()
  });

  guardar();

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

  BODEGAS.forEach(b => {
    const v = $('cont' + b).value.trim();
    const nuevo = v === '' ? null : Math.max(0, parseInt(v) || 0);
    if (nuevo !== p.stock[b]) {
      // Un conteo también es un movimiento: hay que poder auditarlo después
      datos.movimientos.unshift({
        ref: p.ref, tipo: 'CONTEO',
        cantidad: nuevo === null ? 0 : nuevo,
        anterior: p.stock[b],
        bodega: b, destino: null,
        fecha: new Date().toISOString()
      });
      p.stock[b] = nuevo;
      cambios++;
    }
  });

  guardar();
  cerrarModal();
  avisar(cambios ? `Conteo guardado (${cambios} bodega${cambios > 1 ? 's' : ''})` : 'Sin cambios');
  abrirProducto(p);
}

// ==========================================================
// CATÁLOGO
// ==========================================================
let filtroCat = 'TODOS';

function pintarCatalogo() {
  const cats = ['TODOS', ...new Set(datos.productos.map(p => p.cat))];
  $('chipsCat').innerHTML = cats.map(c =>
    `<button class="${c === filtroCat ? 'on' : ''}" onclick="filtrarCat('${c}')">
      ${c === 'TODOS' ? 'Todos' : c}
    </button>`).join('') +
    `<button class="${filtroCat === '_SIN' ? 'on' : ''}" onclick="filtrarCat('_SIN')">Sin código</button>` +
    `<button class="${filtroCat === '_CERO' ? 'on' : ''}" onclick="filtrarCat('_CERO')">Agotados</button>` +
    `<button class="${filtroCat === '_NC' ? 'on' : ''}" onclick="filtrarCat('_NC')">Sin contar</button>`;

  const q = $('buscarCat').value.trim().toUpperCase();
  const b = bodegaActual();
  let lista = datos.productos;

  if (filtroCat === '_SIN') {
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

  const sinContar = datos.productos.filter(p => contadas(p) < BODEGAS.length).length;
  $('catalogo-sub').innerHTML =
    `${datos.productos.length} referencias · ${lista.length} mostradas` +
    (sinContar ? `<br>${sinContar} sin contar en todas las bodegas` : '');

  $('listaCatalogo').innerHTML = lista.length === 0
    ? '<div class="vacio">No hay productos que coincidan</div>'
    : lista.slice(0, 200).map(p => {
        const v = p.stock[b];
        const total = stockTotal(p);
        const color = v === null ? '#5C5B57' : (v > 0 ? 'var(--green-l)' : 'var(--red)');
        return `<div class="item" onclick="abrirRef('${p.ref}')">
          <div class="izq">
            <div class="t">${p.nombre}</div>
            <div class="s">${p.ref}${p.marca ? ' · ' + p.marca : ''}</div>
          </div>
          <div class="der">
            <div class="cant" style="color:${color}">${v === null ? '—' : v}</div>
            <div class="s" style="font-family:inherit;">total ${total}</div>
          </div>
        </div>`;
      }).join('') +
      (lista.length > 200 ? `<div class="vacio">Mostrando 200 de ${lista.length}. Afina la búsqueda.</div>` : '');
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

  const valor = datos.productos.reduce((s, p) => s + stockTotal(p) * (p.precio || 0), 0);
  const unidades = datos.productos.reduce((s, p) => s + stockTotal(p), 0);
  // Agotado = se contó en alguna bodega y de verdad no hay.
  // Un producto que nunca se ha contado NO está agotado: no se sabe cuánto hay.
  const agotados = datos.productos.filter(p =>
    contadas(p) > 0 && stockTotal(p) === 0).length;
  const nuncaContados = datos.productos.filter(p => contadas(p) === 0).length;
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
        <div class="n" style="font-size:17px;">${pesos(valor)}</div>
        <div class="e">Valor del inventario<br>(precio de venta sin IVA)</div>
      </div>
      <div class="tarjeta">
        <div class="n">${unidades.toLocaleString('es-CO')}</div>
        <div class="e">Unidades en total<br>en las 5 bodegas</div>
      </div>
      <div class="tarjeta">
        <div class="n">${datos.productos.length}</div>
        <div class="e">Referencias<br>en el catálogo</div>
      </div>
      <div class="tarjeta">
        <div class="n" style="color:${agotados ? 'var(--red)' : 'var(--green-l)'}">${agotados}</div>
        <div class="e">Agotados<br>(contados y en cero)</div>
      </div>
    </div>

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

    <h2 class="titulo" style="margin-top:24px;">Qué conviene comprar</h2>
    <p class="sub">Cantidad sugerida según lo que se ha consumido</p>
    <div class="chips">
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

function sugerencias() {
  const conConsumo = datos.productos
    .map(p => {
      const c = consumoMensual(p.ref);
      if (c === 0) return null;
      const reserva = Math.ceil(c * 0.3);
      const hay = stockTotal(p);
      const pedir = Math.max(0, c * mesesCobertura + reserva - hay);
      return { p, c, reserva, hay, pedir };
    })
    .filter(Boolean)
    .sort((a, b) => b.pedir - a.pedir);

  if (conConsumo.length === 0) {
    return `<div class="vacio">Todavía no hay consumo registrado.<br>
      Después de unas semanas de uso, aquí aparecerá cuánto conviene pedir
      de cada producto.</div>`;
  }

  const conPedido = conConsumo.filter(x => x.pedir > 0);
  if (conPedido.length === 0) {
    return `<div class="vacio">Con las existencias actuales alcanza para los
      próximos ${mesesCobertura} ${mesesCobertura === 1 ? 'mes' : 'meses'}.</div>`;
  }

  return conPedido.slice(0, 15).map(x => `
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
      <div style="font-size:11px;color:var(--dim);line-height:1.55;margin-top:9px;
                  padding-top:9px;border-top:1px solid var(--line);">
        Salen <b style="color:var(--ink)">${x.c} al mes</b>. Para ${mesesCobertura}
        ${mesesCobertura === 1 ? 'mes' : 'meses'} hacen falta
        <b style="color:var(--ink)">${x.c * mesesCobertura}</b>, más
        <b style="color:var(--ink)">${x.reserva}</b> de reserva.
        Hay <b style="color:var(--ink)">${x.hay}</b> entre todas las bodegas.
      </div>
    </div>`).join('');
}

// ==========================================================
// COPIA DE SEGURIDAD
// ==========================================================
function abrirDatos() {
  const conCodigo = Object.keys(datos.barras).length;
  abrirModal(`
    <h3>Copia de seguridad</h3>
    <p class="sub">Los datos viven en este celular. Descarga una copia de vez
       en cuando, sobre todo después de asociar códigos de barras.</p>

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

    <button class="btn btn-amarillo" onclick="descargarDatos()">Descargar copia</button>
    <div class="separador">O RESTAURAR</div>
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

function descargarDatos() {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario-frenospala-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  avisar('Copia descargada');
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

function iniciar() {
  cargar();

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
