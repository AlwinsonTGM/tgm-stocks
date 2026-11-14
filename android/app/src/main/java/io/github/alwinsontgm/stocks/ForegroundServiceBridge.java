package io.github.alwinsontgm.stocks;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * The Python-facing half of the foreground service.
 *
 * {@link BridgeProvider} creates this instance when the process starts and
 * MainActivity installs it as the Chaquopy module {@code tgms_bridge} before
 * the backend starts, so Python calls {@code startRun()} and {@code stopRun()}
 * as plain module functions. The Python hook
 * ({@code src/services/run_foreground_service.py}) calls them only when
 * {@code TGMS_PLATFORM=android}.
 *
 * Failures are logged and swallowed: a notification problem must never break
 * an analysis.
 */
public final class ForegroundServiceBridge {
    private static final String TAG = "TGMStocks";
    private static volatile ForegroundServiceBridge instance;

    private final Context context;

    private ForegroundServiceBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    /**
     * The single instance Python receives. Chaquopy wraps Java objects, so the
     * bridge needs a public no-argument constructor to be exposed; the context
     * comes from the provider that created it.
     */
    public static ForegroundServiceBridge getInstance() {
        ForegroundServiceBridge current = instance;
        if (current == null) {
            throw new IllegalStateException("ForegroundServiceBridge is not initialized");
        }
        return current;
    }

    static void initialize(Context context) {
        if (instance == null) {
            instance = new ForegroundServiceBridge(context);
        }
    }

    /** Start the service, or leave it running if it already is. */
    public void startRun() {
        Intent intent = new Intent(context, AnalysisForegroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException error) {
            // ForegroundServiceStartNotAllowedException on Android 12+ when the
            // app is already in the background. The run continues; only the
            // protection against being killed is lost.
            Log.w(TAG, "Foreground service could not start", error);
        }
    }

    /** Stop the service and remove its notification. */
    public void stopRun() {
        try {
            context.stopService(new Intent(context, AnalysisForegroundService.class));
        } catch (RuntimeException error) {
            Log.w(TAG, "Foreground service could not stop", error);
        }
    }
}
