package io.github.alwinsontgm.stocks;

import android.app.Activity;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    // Android 13+ shows no notification, including the foreground service's,
    // until the user grants this permission. The service still runs without it.
    private static final int REQUEST_NOTIFICATIONS = 1;
    // The Loopback token: a random per-install secret the WebView presents to the
    // on-device backend. It lives in app-private preferences and is never logged.
    private static final String PREFS_NAME = "tgms_loopback";
    private static final String PREF_TOKEN = "loopback_token";
    private static final String TOKEN_ENV = "TGMS_LOOPBACK_TOKEN";
    private static final String TOKEN_COOKIE = "tgms_token";
    // Marks the backend as the Android feature profile: the config API then
    // leaves out the scheduler and image-notification settings (ADR-0006).
    private static final String PLATFORM_ENV = "TGMS_PLATFORM";
    private static final String ANDROID_PLATFORM = "android";

    private String loopbackToken() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String token = prefs.getString(PREF_TOKEN, null);
        if (token != null && !token.isEmpty()) return token;
        byte[] random = new byte[32];
        new SecureRandom().nextBytes(random);
        token = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        prefs.edit().putString(PREF_TOKEN, token).commit();
        return token;
    }

    private void stageRepo() throws Exception {
        File root = new File(getFilesDir(), "repo");
        root.mkdirs();
        String base = root.getCanonicalPath() + File.separator;
        try (InputStream raw = getAssets().open("repo.zip"); ZipInputStream zip = new ZipInputStream(raw)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                File target = new File(root, entry.getName());
                if (!target.getCanonicalPath().startsWith(base)) throw new SecurityException("Invalid packaged path");
                if (entry.isDirectory()) {
                    target.mkdirs();
                } else {
                    target.getParentFile().mkdirs();
                    try (FileOutputStream out = new FileOutputStream(target)) {
                        int length;
                        while ((length = zip.read(buffer)) != -1) out.write(buffer, 0, length);
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private void requestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33
            && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {"android.permission.POST_NOTIFICATIONS"}, REQUEST_NOTIFICATIONS);
        }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestNotificationPermission();
        TextView loading = new TextView(this);
        loading.setText("Starting...");
        setContentView(loading);
        new Thread(() -> {
            try {
                stageRepo();
                String token = loopbackToken();
                if (!Python.isStarted()) Python.start(new AndroidPlatform(this));
                Python py = Python.getInstance();
                // Chaquopy shares this process's environment with Python, so the
                // backend reads the token from here before it starts.
                py.getModule("os").get("environ").callAttr("__setitem__", TOKEN_ENV, token);
                py.getModule("os").get("environ").callAttr("__setitem__", PLATFORM_ENV, ANDROID_PLATFORM);
                // The foreground-service bridge: Python imports it as tgms_bridge
                // and calls startRun()/stopRun() around an active analysis run.
                // Chaquopy wraps the Java instance as a Python object, so it is
                // stored in the module dict rather than in sys.modules.
                PyObject bridge = py.getModule("java").callAttr("jclass", ForegroundServiceBridge.class.getName()).callAttr("getInstance");
                py.getModule("sys").get("modules").callAttr("__setitem__", "tgms_bridge", bridge);
                int port = py.getModule("bootstrap").callAttr("start", getFilesDir().getAbsolutePath()).toInt();
                runOnUiThread(() -> {
                    LinearLayout content = new LinearLayout(this);
                    content.setOrientation(LinearLayout.VERTICAL);
                    content.setOnApplyWindowInsetsListener((v, insets) -> {
                        int top = android.os.Build.VERSION.SDK_INT >= 30
                            ? insets.getInsets(android.view.WindowInsets.Type.systemBars()).top
                            : insets.getSystemWindowInsetTop();
                        v.setPadding(0, top, 0, 0);
                        return insets;
                    });
                    WebView.setWebContentsDebuggingEnabled(true);
                    WebView view = new WebView(this);
                    view.getSettings().setJavaScriptEnabled(true);
                    view.getSettings().setDomStorageEnabled(true);
                    view.getSettings().setAllowFileAccess(false);
                    view.getSettings().setAllowContentAccess(false);
                    view.setWebViewClient(new WebViewClient() {
                        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                            Uri uri = request.getUrl();
                            return !("http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == port);
                        }
                    });
                    content.addView(view, new LinearLayout.LayoutParams(-1, 0, 1));
                    setContentView(content);
                    // A cookie rather than a request header: loadUrl(url, headers)
                    // only covers the first request, while subresources and XHR
                    // would otherwise go out unauthenticated.
                    CookieManager cookies = CookieManager.getInstance();
                    cookies.setAcceptCookie(true);
                    cookies.setCookie("http://127.0.0.1:" + port + "/", TOKEN_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict");
                    cookies.flush();
                    view.loadUrl("http://127.0.0.1:" + port + "/");
                });
            } catch (Exception error) {
                android.util.Log.e("TGMStocks", "Experimental backend failed", error);
                runOnUiThread(() -> loading.setText("Experimental stock API failed to start. Check Android logs; no stock analysis ran."));
            }
        }).start();
    }
}
