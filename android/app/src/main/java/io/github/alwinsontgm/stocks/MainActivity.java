package io.github.alwinsontgm.stocks;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
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

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView loading = new TextView(this);
        loading.setText("Starting...");
        setContentView(loading);
        new Thread(() -> {
            try {
                stageRepo();
                if (!Python.isStarted()) Python.start(new AndroidPlatform(this));
                int port = Python.getInstance().getModule("bootstrap").callAttr("start", getFilesDir().getAbsolutePath()).toInt();
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
                    view.loadUrl("http://127.0.0.1:" + port + "/");
                });
            } catch (Exception error) {
                android.util.Log.e("TGMStocks", "Experimental backend failed", error);
                runOnUiThread(() -> loading.setText("Experimental stock API failed to start. Check Android logs; no stock analysis ran."));
            }
        }).start();
    }
}
