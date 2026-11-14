package io.github.alwinsontgm.stocks;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;

/**
 * Gives {@link ForegroundServiceBridge} the application context.
 *
 * Android creates content providers before any activity, so this is the usual
 * way to reach the application context at process start. The bridge needs it
 * to start and stop the foreground service, including from a run that begins
 * before the WebView has loaded. The provider stores nothing and serves no
 * queries.
 */
public final class BridgeProvider extends ContentProvider {
    @Override public boolean onCreate() {
        ForegroundServiceBridge.initialize(getContext());
        return true;
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override public String getType(Uri uri) {
        return null;
    }

    @Override public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
