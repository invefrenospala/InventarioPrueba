package com.frenospala.inventario;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

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
        pedirPermisos();
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
