package com.superfunteam.walky;

import android.content.Context;
import android.content.SharedPreferences;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;

final class WalkState {
  static SharedPreferences prefs(Context c) {
    return c.getSharedPreferences("walky", Context.MODE_PRIVATE);
  }

  static String today(Context c) {
    try {
      return LocalDate.now(ZoneId.of(prefs(c).getString("timezone", "America/Chicago"))).toString();
    } catch (Exception e) {
      return LocalDate.now(ZoneId.of("America/Chicago")).toString();
    }
  }

  static boolean configured(Context c) {
    return !prefs(c).getString("url", "").isEmpty() && !prefs(c).getString("token", "").isEmpty();
  }

  static synchronized void queue(Context c, String date) {
    Set<String> dates = new HashSet<>(prefs(c).getStringSet("pending", new HashSet<>()));
    dates.add(date);
    prefs(c).edit().putStringSet("pending", dates).apply();
  }

  static synchronized void dequeue(Context c, String date) {
    Set<String> dates = new HashSet<>(prefs(c).getStringSet("pending", new HashSet<>()));
    dates.remove(date);
    prefs(c).edit().putStringSet("pending", dates).apply();
  }

  static synchronized Set<String> pending(Context c) {
    return new HashSet<>(prefs(c).getStringSet("pending", new HashSet<>()));
  }

  static void log(Context c) {
    queue(c, today(c));
    WalkWidget.updateAll(c);
    WalkSync.enqueue(c);
  }
}
