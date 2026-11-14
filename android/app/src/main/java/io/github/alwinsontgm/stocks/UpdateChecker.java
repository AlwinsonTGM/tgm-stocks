package io.github.alwinsontgm.stocks;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Checks the published version file and offers a link to the release page when a
 * newer build exists. Every failure is silent: an update check must never delay or
 * break the app.
 */
final class UpdateChecker {
    private static final String TAG = "TgmUpdate";
    // Published from the repository's android/version.json on the main branch.
    private static final String VERSION_URL =
        "https://raw.githubusercontent.com/AlwinsonTGM/tgm-stocks/main/android/version.json";
    private static final int TIMEOUT_MS = 5000;

    private UpdateChecker() {
    }

    static void check(Activity activity) {
        new Thread(() -> {
            try {
                JSONObject remote = fetch();
                if (remote == null) return;
                long remoteCode = remote.optLong("versionCode", 0);
                String remoteName = remote.optString("versionName", "");
                String url = remote.optString("url", "");
                if (remoteCode <= 0 || url.isEmpty()) return;

                PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
                long localCode = info.getLongVersionCode();
                if (remoteCode <= localCode) return;

                new Handler(Looper.getMainLooper()).post(
                    () -> show(activity, remoteName, url));
            } catch (Exception error) {
                Log.d(TAG, "update check skipped: " + error.getClass().getSimpleName());
            }
        }, "tgms-update-check").start();
    }

    private static JSONObject fetch() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(VERSION_URL).openConnection();
        try {
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != 200) return null;
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return new JSONObject(body.toString());
        } finally {
            connection.disconnect();
        }
    }

    private static void show(Activity activity, String versionName, String url) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
            .setTitle("Update available")
            .setMessage("TGM Stocks " + versionName + " is available.")
            .setPositiveButton("Open release page", (dialog, which) -> {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // No browser: the user can open the link manually.
                }
            })
            .setNegativeButton("Later", null)
            .show();
    }
}
