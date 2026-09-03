// build.js — Copia los archivos web a la carpeta www/
// Se ejecuta antes de cada "npx cap sync android"
// Uso: node build.js

const fs   = require('fs');
const path = require('path');

const ARCHIVOS = [
  'index.html',
  'app.js',
  'catalogo.js',
  'supabase.js',
  'descargas.js',
  'styles.css',
  'manifest.json',
  'icono-192.png',
  'icono-512.png',
];

const www = path.join(__dirname, 'www');

if (!fs.existsSync(www)) fs.mkdirSync(www, { recursive: true });

let copiados = 0;
for (const archivo of ARCHIVOS) {
  const src  = path.join(__dirname, archivo);
  const dest = path.join(www, archivo);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copiados++;
  } else {
    console.warn(`  ⚠ No encontrado: ${archivo}`);
  }
}

// Carpeta vendor/ (jsPDF, autoTable y SheetJS locales)
const vendorSrc  = path.join(__dirname, 'vendor');
const vendorDest = path.join(www, 'vendor');
if (fs.existsSync(vendorSrc)) {
  if (!fs.existsSync(vendorDest)) fs.mkdirSync(vendorDest, { recursive: true });
  for (const f of fs.readdirSync(vendorSrc)) {
    fs.copyFileSync(path.join(vendorSrc, f), path.join(vendorDest, f));
    copiados++;
  }
} else {
  console.warn('  ⚠ No encontrada la carpeta vendor/');
}

console.log(`✓ ${copiados} archivos copiados a www/`);
