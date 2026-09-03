package com.frenospala.inventario;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Guarda archivos (PDF / Excel / JSON) en la carpeta Descargas del teléfono
 * y muestra una notificación para abrirlos.
 *
 * Se puede llamar de dos formas desde JavaScript:
 *   1. window.AndroidDescargas.guardarArchivo(nombre, mime, base64)  -> String JSON
 *   2. Capacitor.Plugins.Descargas.guardar({ nombre, mime, datos })  -> Promise
 */
@CapacitorPlugin(name = "Descargas")
public class DescargasPlugin extends Plugin {

    public static final String CARPETA = "Frenos Pala";
    private static final String CANAL = "descargas_frenospala";
    private static final AtomicInteger CONTADOR = new AtomicInteger(1000);

    // ------------------------------------------------------------------
    // Registro del puente JS simple (se ejecuta antes de cargar la página)
    // ------------------------------------------------------------------
    @Override
    public void load() {
        try {
            WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.addJavascriptInterface(new PuenteJS(), "AndroidDescargas");
            }
        } catch (Exception e) {
            // Si falla, todavía queda disponible la vía Capacitor.Plugins.Descargas
        }
        crearCanal(getContext());
    }

    public class PuenteJS {
        @JavascriptInterface
        public String guardarArchivo(String nombre, String mime, String base64) {
            return guardarInterno(getContext(), nombre, mime, base64).toString();
        }

        @JavascriptInterface
        public String abrirArchivo(String uri, String mime) {
            return abrirInterno(getContext(), uri, mime).toString();
        }

        @JavascriptInterface
        public boolean disponible() {
            return true;
        }
    }

    // ------------------------------------------------------------------
    // Métodos Capacitor
    // ------------------------------------------------------------------
    @PluginMethod
    public void guardar(PluginCall call) {
        String nombre = call.getString("nombre", "archivo");
        String mime = call.getString("mime", "application/octet-stream");
        String datos = call.getString("datos", "");
        JSONObject r = guardarInterno(getContext(), nombre, mime, datos);
        responder(call, r);
    }

    @PluginMethod
    public void abrir(PluginCall call) {
        JSONObject r = abrirInterno(getContext(), call.getString("uri", ""), call.getString("mime", "*/*"));
        responder(call, r);
    }

    /** Convierte el JSONObject a JSObject capturando la excepcion obligatoria. */
    private void responder(PluginCall call, JSONObject r) {
        try {
            call.resolve(JSObject.fromJSONObject(r));
        } catch (Exception e) {
            call.reject(r.optString("error", "Error al guardar el archivo"));
        }
    }

    // ------------------------------------------------------------------
    // Guardado real
    // ------------------------------------------------------------------
    private static JSONObject guardarInterno(Context ctx, String nombre, String mime, String base64) {
        JSONObject r = new JSONObject();
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Uri uri;
            String rutaVisible;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ : MediaStore, sin permisos
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
                cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                cv.put(MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + File.separator + CARPETA);
                cv.put(MediaStore.Downloads.IS_PENDING, 1);

                ContentResolver cr = ctx.getContentResolver();
                uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new Exception("No se pudo crear el archivo en Descargas");

                OutputStream out = cr.openOutputStream(uri);
                out.write(bytes);
                out.flush();
                out.close();

                cv.clear();
                cv.put(MediaStore.Downloads.IS_PENDING, 0);
                cr.update(uri, cv, null, null);

                rutaVisible = "Descargas/" + CARPETA + "/" + nombre;
            } else {
                // Android 9 o menor : archivo directo en Descargas
                File dir = new File(
                        Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                        CARPETA);
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("No se pudo crear la carpeta");

                File archivo = new File(dir, nombre);
                FileOutputStream fos = new FileOutputStream(archivo);
                fos.write(bytes);
                fos.flush();
                fos.close();

                MediaScannerConnection.scanFile(ctx, new String[]{archivo.getAbsolutePath()},
                        new String[]{mime}, null);

                uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", archivo);
                rutaVisible = "Descargas/" + CARPETA + "/" + nombre;
            }

            notificar(ctx, nombre, rutaVisible, uri, mime);

            r.put("ok", true);
            r.put("uri", uri.toString());
            r.put("ruta", rutaVisible);
            r.put("nativo", true);
        } catch (Exception e) {
            try {
                r.put("ok", false);
                r.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                r.put("nativo", true);
            } catch (Exception ignored) {}
        }
        return r;
    }

    private static JSONObject abrirInterno(Context ctx, String uri, String mime) {
        JSONObject r = new JSONObject();
        try {
            Intent ver = new Intent(Intent.ACTION_VIEW);
            ver.setDataAndType(Uri.parse(uri), mime);
            ver.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            // ¿Hay alguna app instalada capaz de abrir este tipo de archivo?
            boolean hayApp = ctx.getPackageManager()
                    .queryIntentActivities(ver, PackageManager.MATCH_DEFAULT_ONLY)
                    .size() > 0;

            if (hayApp) {
                Intent selector = Intent.createChooser(ver, "Abrir con");
                selector.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                ctx.startActivity(selector);
                r.put("ok", true);
                return r;
            }

            // Nadie puede abrirlo: al menos llevarlo a la carpeta de Descargas
            if (abrirCarpetaDescargas(ctx)) {
                r.put("ok", true);
                r.put("aviso", "Ninguna app puede abrir este archivo. "
                        + "Te llevé a la carpeta Descargas.");
                return r;
            }

            r.put("ok", false);
            r.put("error", mensajeSinApp(mime));
        } catch (Exception e) {
            try {
                r.put("ok", false);
                r.put("error", mensajeSinApp(mime));
            } catch (Exception ignored) {}
        }
        return r;
    }

    /** Abre la pantalla de Descargas del sistema. */
    private static boolean abrirCarpetaDescargas(Context ctx) {
        try {
            Intent i = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String mensajeSinApp(String mime) {
        if (mime != null && mime.contains("pdf")) {
            return "No tienes ninguna app para abrir PDF. El archivo está guardado "
                    + "en Descargas/" + CARPETA + ".";
        }
        if (mime != null && mime.contains("spreadsheet")) {
            return "No tienes ninguna app para abrir Excel. El archivo está guardado "
                    + "en Descargas/" + CARPETA + ".";
        }
        return "Ninguna app puede abrir este archivo. Está guardado en Descargas/"
                + CARPETA + ".";
    }

    // ------------------------------------------------------------------
    // Notificación
    // ------------------------------------------------------------------
    private static void crearCanal(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(
                    CANAL, "Descargas", NotificationManager.IMPORTANCE_DEFAULT);
            canal.setDescription("Avisos cuando se guarda un inventario o una copia");
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(canal);
        }
    }

    private static void notificar(Context ctx, String nombre, String ruta, Uri uri, String mime) {
        try {
            crearCanal(ctx);

            Intent abrir = new Intent(Intent.ACTION_VIEW);
            abrir.setDataAndType(uri, mime);
            abrir.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getActivity(
                    ctx, CONTADOR.incrementAndGet(), abrir, flags);

            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CANAL)
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("Descarga completa")
                    .setContentText(nombre)
                    .setStyle(new NotificationCompat.BigTextStyle()
                            .bigText(nombre + "\nGuardado en " + ruta + ". Toca para abrirlo."))
                    .setContentIntent(pi)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);

            NotificationManagerCompat.from(ctx).notify(CONTADOR.incrementAndGet(), b.build());
        } catch (Exception e) {
            // Sin permiso de notificaciones el archivo igual quedó guardado
        }

        // Aviso corto en pantalla, por si las notificaciones están apagadas
        try {
            final Context c = ctx;
            if (c instanceof Activity) {
                ((Activity) c).runOnUiThread(() ->
                        Toast.makeText(c, "Guardado en " + ruta, Toast.LENGTH_LONG).show());
            }
        } catch (Exception ignored) {}
    }
}
