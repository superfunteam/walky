package com.superfunteam.walky;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class WalkWidget extends AppWidgetProvider {
  public static final String LOG = "com.superfunteam.walky.LOG";

  public static void updateAll(Context c) {
    var manager = AppWidgetManager.getInstance(c);
    for (int id : manager.getAppWidgetIds(new ComponentName(c, WalkWidget.class)))
      update(c, manager, id);
  }

  private static void update(Context c, AppWidgetManager manager, int id) {
    var p = WalkState.prefs(c);
    String today = WalkState.today(c);
    boolean ready = WalkState.configured(c),
        pending = WalkState.pending(c).contains(today),
        done = today.equals(p.getString("statusDate", "")) && p.getBoolean("walked", false);
    var views = new RemoteViews(c.getPackageName(), R.layout.walk_widget);
    String title =
        !ready ? "Let's connect" : pending ? "Walk queued" : done ? "We did it! ✓" : "We walked";
    String subtitle =
        !ready
            ? "Tap to set up Walky"
            : pending
                ? "Saved on phone · waiting to sync"
                : done
                    ? p.getInt("streak", 0) + " day streak · logged today"
                    : p.contains("error") ? p.getString("error", "") : "Tap to log today";
    views.setTextViewText(R.id.widget_title, title);
    views.setTextViewText(R.id.widget_status, subtitle);
    var open =
        PendingIntent.getActivity(
            c,
            0,
            new Intent(c, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    var log =
        PendingIntent.getBroadcast(
            c,
            1,
            new Intent(c, WalkWidget.class).setAction(LOG),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(R.id.widget_root, ready && !done && !pending ? log : open);
    views.setOnClickPendingIntent(R.id.widget_brand, open);
    manager.updateAppWidget(id, views);
  }

  @Override
  public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
    for (int id : ids) update(c, manager, id);
    WalkSync.periodic(c);
    WalkSync.enqueue(c);
  }

  @Override
  public void onReceive(Context c, Intent intent) {
    super.onReceive(c, intent);
    if (LOG.equals(intent.getAction()) && WalkState.configured(c)) {
      WalkState.log(c);
    }
  }
}
