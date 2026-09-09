package com.superfunteam.walky;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public class WalkSync extends Worker {
  public WalkSync(@NonNull Context c, @NonNull WorkerParameters p) {
    super(c, p);
  }

  public static void enqueue(Context c) {
    WorkManager.getInstance(c)
        .enqueueUniqueWork(
            "walky-sync",
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            new OneTimeWorkRequest.Builder(WalkSync.class)
                .setConstraints(
                    new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build());
  }

  public static void periodic(Context c) {
    WorkManager.getInstance(c)
        .enqueueUniquePeriodicWork(
            "walky-refresh",
            ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(WalkSync.class, 30, TimeUnit.MINUTES)
                .setConstraints(
                    new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build());
  }

  private JSONObject request(String path, String method, JSONObject body) throws Exception {
    var p = WalkState.prefs(getApplicationContext());
    var conn = (HttpURLConnection) new URL(p.getString("url", "") + path).openConnection();
    conn.setConnectTimeout(12000);
    conn.setReadTimeout(12000);
    conn.setInstanceFollowRedirects(false);
    conn.setRequestMethod(method);
    conn.setRequestProperty("Authorization", "Bearer " + p.getString("token", ""));
    try {
      if (body != null) {
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        try (var out = conn.getOutputStream()) {
          out.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
      }
      int code = conn.getResponseCode();
      if (code == 401 || code == 403) {
        throw new SecurityException("Reconnect your calendar");
      }
      if (code < 200 || code >= 300) throw new java.io.IOException("Service unavailable");
      try (var input = conn.getInputStream()) {
        var bytes = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int size;
        while ((size = input.read(buffer)) != -1) bytes.write(buffer, 0, size);
        return new JSONObject(bytes.toString("UTF-8"));
      }
    } finally {
      conn.disconnect();
    }
  }

  @NonNull
  public Result doWork() {
    Context c = getApplicationContext();
    if (!WalkState.configured(c)) return Result.failure();
    try {
      for (String date : WalkState.pending(c)) {
        request("/api/walks", "POST", new JSONObject().put("date", date));
        WalkState.dequeue(c, date);
      }
      JSONObject s = request("/api/status", "GET", null);
      var dates = s.getJSONArray("dates");
      var confirmed = new HashSet<String>();
      for (int i = 0; i < dates.length(); i++) confirmed.add(dates.getString(i));
      WalkState.prefs(c)
          .edit()
          .putString("statusDate", s.getString("today"))
          .putBoolean("walked", s.getBoolean("walkedToday"))
          .putInt("streak", s.getInt("streak"))
          .putStringSet("walkDates", confirmed)
          .putString("timezone", s.getString("timezone"))
          .putLong("syncedAt", System.currentTimeMillis())
          .remove("error")
          .apply();
      WalkWidget.updateAll(c);
      return Result.success();
    } catch (SecurityException e) {
      WalkState.prefs(c).edit().putString("error", "Open app to reconnect").apply();
      WalkWidget.updateAll(c);
      return Result.failure();
    } catch (Exception e) {
      WalkState.prefs(c).edit().putString("error", "Waiting for connection").apply();
      WalkWidget.updateAll(c);
      return Result.retry();
    }
  }
}
