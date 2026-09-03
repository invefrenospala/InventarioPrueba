package com.frenospala.inventario;

import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // IMPORTANTE: registrar antes de super.onCreate para que el puente
        // quede disponible cuando la página web arranque.
        registerPlugin(DescargasPlugin.class);
        super.onCreate(savedInstanceState);
        pintarBarrasDelSistema();
        pedirPermisos();
    }

    /**
     * Pinta la barra de estado y la de navegación del color del panel,
     * con iconos claros. Sin esto queda la franja blanca de fábrica.
     */
    private void pintarBarrasDelSistema() {
        try {
            Window w = getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                w.setStatusBarColor(Color.parseColor("#26282B"));
                w.setNavigationBarColor(Color.parseColor("#26282B"));
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                View d = w.getDecorView();
                int flags = d.getSystemUiVisibility();
                // Quitar "iconos oscuros": el fondo es oscuro, los iconos van claros
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                d.setSystemUiVisibility(flags);
            }
        } catch (Exception ignored) {}
    }

    /** Notificaciones (Android 13+) y escritura en Descargas (Android 9 o menor). */
    private void pedirPermisos() {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this,
                            new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9101);
                }
            }
            if (Build.VERSION.SDK_INT <= 28) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this,
                            new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 9102);
                }
            }
        } catch (Exception ignored) {}
    }
}
