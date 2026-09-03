// ==========================================================
// DESCARGAS — guarda archivos de verdad (Android y navegador)
// ==========================================================
// El problema anterior: en la app Android se usaba <a download>, que el
// WebView ignora en silencio. La app decía "descargado" y no pasaba nada.
//
// Ahora:
//   · En el APK  -> puente nativo, escribe en Descargas/Frenos Pala
//                   y lanza la notificación "Descarga completa".
//   · En el navegador -> descarga normal.
// En los dos casos se devuelve si funcionó o no, para no mentirle al usuario.

(function () {

  const MIMES = {
    pdf:  'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json: 'application/json'
  };

  /** ¿Estamos dentro del APK con el puente nativo disponible? */
  function puenteNativo() {
    try {
      if (window.AndroidDescargas && typeof window.AndroidDescargas.guardarArchivo === 'function') {
        return 'js';
      }
      const C = window.Capacitor;
      if (C && (typeof C.nativePromise === 'function' ||
                (C.Plugins && C.Plugins.Descargas))) {
        return 'capacitor';
      }
    } catch (e) { /* nada */ }
    return null;
  }

  function blobABase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('No se pudo leer el archivo generado'));
      r.readAsDataURL(blob);
    });
  }

  async function llamarNativo(via, nombre, mime, base64) {
    if (via === 'js') {
      const txt = window.AndroidDescargas.guardarArchivo(nombre, mime, base64);
      return JSON.parse(txt);
    }
    const C = window.Capacitor;
    const args = { nombre, mime, datos: base64 };
    if (C.Plugins && C.Plugins.Descargas && C.Plugins.Descargas.guardar) {
      return await C.Plugins.Descargas.guardar(args);
    }
    return await C.nativePromise('Descargas', 'guardar', args);
  }

  function descargaWeb(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  }

  /**
   * Guarda un blob.
   * Devuelve { ok, ruta, uri, nativo, error }
   */
  async function guardar(blob, nombre, tipo) {
    const mime = MIMES[tipo] || blob.type || 'application/octet-stream';
    const via  = puenteNativo();

    if (via) {
      try {
        const base64 = await blobABase64(blob);
        const r = await llamarNativo(via, nombre, mime, base64);
        if (r && r.ok) {
          return { ok: true, nativo: true, ruta: r.ruta, uri: r.uri, mime };
        }
        return { ok: false, nativo: true, error: (r && r.error) || 'No se pudo guardar el archivo' };
      } catch (e) {
        console.warn('Puente nativo falló, intento descarga web:', e);
      }
    }

    // Navegador (o el puente falló)
    try {
      descargaWeb(blob, nombre);
      return { ok: true, nativo: false, ruta: 'la carpeta de descargas del navegador', mime };
    } catch (e) {
      return { ok: false, nativo: false, error: 'El navegador bloqueó la descarga' };
    }
  }

  /** Abre un archivo ya guardado (solo tiene sentido en el APK). */
  async function abrir(uri, mime) {
    const via = puenteNativo();
    if (!via || !uri) return { ok: false };
    try {
      if (via === 'js') return JSON.parse(window.AndroidDescargas.abrirArchivo(uri, mime || '*/*'));
      const C = window.Capacitor;
      const args = { uri, mime: mime || '*/*' };
      if (C.Plugins && C.Plugins.Descargas && C.Plugins.Descargas.abrir) {
        return await C.Plugins.Descargas.abrir(args);
      }
      return await C.nativePromise('Descargas', 'abrir', args);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  window.Descargas = { guardar, abrir, nativo: () => !!puenteNativo() };
})();
