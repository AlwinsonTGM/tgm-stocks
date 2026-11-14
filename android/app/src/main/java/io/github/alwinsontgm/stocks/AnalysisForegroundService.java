package io.github.alwinsontgm.stocks;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Keeps the process alive, with a persistent notification, while an analysis
 * run is active. Android may freeze or kill a backgrounded app; a foreground
 * service is the supported way to keep user-started work running.
 *
 * The service is started and stopped by {@link ForegroundServiceBridge} from
 * Python. It carries no state of its own: the run counter lives on the Python
 * side, so a start/stop race cannot leave it running after the last run.
 *
 * The notification is deliberately generic. It never names a stock, a
 * portfolio holding or an API key.
 */
public class AnalysisForegroundService extends Service {
    static final String CHANNEL_ID = "analysis_run";
    static final int NOTIFICATION_ID = 1;

    @Override public void onCreate() {
        super.onCreate();
        createChannel(this);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification(this);
        if (Build.VERSION.SDK_INT >= 29) {
            // dataSync: a network-backed, user-started run. It is the type that
            // needs no runtime permission and fits an analysis that fetches data
            // and calls a model.
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        // Not sticky: if the process dies the run is gone, and a restart would
        // show a notification for work that is no longer happening.
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent intent) {
        return null;
    }

    private static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.analysis_service_channel_name),
            NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(context.getString(R.string.analysis_service_channel_description));
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private static Notification buildNotification(Context context) {
        Intent open = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
        return builder
            .setSmallIcon(R.drawable.ic_stat_analysis)
            .setContentTitle(context.getString(R.string.analysis_service_title))
            .setContentText(context.getString(R.string.analysis_service_text))
            .setContentIntent(contentIntent)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .build();
    }
}
