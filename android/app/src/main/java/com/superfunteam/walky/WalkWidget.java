package com.superfunteam.walky;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.time.LocalDate;
import java.util.Collections;

public class WalkWidget extends AppWidgetProvider {
  public static final String LOG = "com.superfunteam.walky.LOG";

  public static void updateAll(Context c) {
    var manager = AppWidgetManager.getInstance(c);
    for (Class<?> provider : new Class<?>[] {WalkWidget.class, WalkButtonWidget.class}) {
      boolean compact = provider == WalkButtonWidget.class;
      for (int id : manager.getAppWidgetIds(new ComponentName(c, provider)))
        manager.updateAppWidget(id, render(c, compact, WalkState.today(c)));
    }
  }

  protected boolean isCompact() {
    return false;
  }

  static RemoteViews render(Context c, boolean compact, String today) {
    var p = WalkState.prefs(c);
    WidgetStats stats =
        p.contains("walkDates")
            ? new WidgetStats(
                p.getStringSet("walkDates", Collections.emptySet()), LocalDate.parse(today))
            : null;
    boolean ready = WalkState.configured(c),
        pending = WalkState.pending(c).contains(today),
        done =
            stats != null
                ? stats.walkedToday
                : today.equals(p.getString("statusDate", "")) && p.getBoolean("walked", false);
    var views =
        new RemoteViews(
            c.getPackageName(), compact ? R.layout.walk_button_widget : R.layout.walk_widget);
    String title =
        !ready ? "Let's connect" : pending ? "Walk queued" : done ? "We did it! ✓" : "We walked";
    String subtitle =
        !ready
            ? "Tap to set up Walky"
            : pending
                ? "On phone · waiting to sync"
                : done
                    ? "Today's walk is in. Nice work."
                    : p.contains("error") ? p.getString("error", "") : "Tap to log today";
    String description = title + ". " + subtitle;
    if (!compact && ready && stats != null)
      description +=
          ". "
              + stats.streak
              + " day streak. "
              + stats.weekCount
              + " of 7 walks this week. "
              + stats.total
              + " total walks.";
    views.setContentDescription(R.id.widget_root, description);
    if (compact) {
      views.setImageViewResource(
          R.id.widget_icon,
          !ready
              ? R.drawable.ic_widget_walk
              : pending
                  ? R.drawable.ic_widget_pending
                  : done ? R.drawable.ic_widget_done : R.drawable.ic_widget_walk);
    } else {
      views.setTextViewText(R.id.widget_title, title);
      views.setTextViewText(R.id.widget_status, subtitle);
      views.setTextViewText(R.id.widget_streak, ready && stats != null ? "" + stats.streak : "—");
      views.setTextViewText(
          R.id.widget_week, ready && stats != null ? stats.weekCount + "/7" : "—");
      views.setTextViewText(R.id.widget_total, ready && stats != null ? "" + stats.total : "—");
    }
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
            new Intent(c, compact ? WalkButtonWidget.class : WalkWidget.class).setAction(LOG),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    // The one-cell button must still log the current day if the launcher shows yesterday's state.
    // The API and local queue both deduplicate repeated taps by date.
    views.setOnClickPendingIntent(
        R.id.widget_root, ready && (compact || (!done && !pending)) ? log : open);
    if (!compact) views.setOnClickPendingIntent(R.id.widget_brand, open);
    return views;
  }

  @Override
  public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
    for (int id : ids) manager.updateAppWidget(id, render(c, isCompact(), WalkState.today(c)));
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
