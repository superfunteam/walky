package com.superfunteam.walky;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.work.Configuration;
import androidx.work.testing.SynchronousExecutor;
import androidx.work.testing.WorkManagerTestInitHelper;
import java.io.File;
import java.io.FileOutputStream;
import java.time.LocalDate;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35, application = Application.class, qualifiers = "mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class WalkWidgetTest {
  private Context context;
  private boolean workManagerInitialized;
  private static final String TODAY = "2026-09-09";

  @Before
  public void setup() {
    context = RuntimeEnvironment.getApplication();
    WalkState.prefs(context)
        .edit()
        .clear()
        .putString("url", "https://example.invalid")
        .putString("token", "test-only-connection-code")
        .putStringSet("walkDates", Set.of("2026-09-06", "2026-09-07", "2026-09-08"))
        .commit();
  }

  private View render(boolean compact, String today, int width, int height) {
    View view = WalkWidget.render(context, compact, today).apply(context, new FrameLayout(context));
    view.measure(
        View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
        View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
    view.layout(0, 0, width, height);
    return view;
  }

  private String text(View view, int id) {
    return ((TextView) view.findViewById(id)).getText().toString();
  }

  @After
  public void cleanup() {
    if (workManagerInitialized) WorkManagerTestInitHelper.closeWorkDatabase();
  }

  @Test
  public void oneTapQueuesOnceAndUpdatesBothButtonsWithoutOpeningTheApp() {
    // Work-testing holds network constraints unmet: no HTTP requests can run in this test.
    WorkManagerTestInitHelper.initializeTestWorkManager(
        context, new Configuration.Builder().setExecutor(new SynchronousExecutor()).build());
    workManagerInitialized = true;
    var manager = shadowOf(AppWidgetManager.getInstance(context));
    manager.bindAppWidgetId(101, new ComponentName(context, WalkWidget.class));
    manager.bindAppWidgetId(102, new ComponentName(context, WalkButtonWidget.class));
    WalkWidget.updateAll(context);
    manager.getViewFor(102).performClick();
    shadowOf(Looper.getMainLooper()).idle();
    assertEquals(Set.of(WalkState.today(context)), WalkState.pending(context));
    assertNull(shadowOf((Application) context).getNextStartedActivity());
    assertEquals("Walk queued", text(manager.getViewFor(101), R.id.widget_title));
    assertTrue(
        manager.getViewFor(102).getContentDescription().toString().contains("waiting to sync"));
    manager.getViewFor(102).performClick();
    shadowOf(Looper.getMainLooper()).idle();
    assertNull(shadowOf((Application) context).getNextStartedActivity());
    assertEquals(1, WalkState.pending(context).size());
    manager.getViewFor(101).performClick();
    shadowOf(Looper.getMainLooper()).idle();
    assertEquals(
        MainActivity.class.getName(),
        shadowOf((Application) context).getNextStartedActivity().getComponent().getClassName());
    assertEquals(1, WalkState.pending(context).size());

    WalkState.dequeue(context, WalkState.today(context));
    WalkWidget.updateAll(context);
    manager.getViewFor(101).performClick();
    shadowOf(Looper.getMainLooper()).idle();
    assertEquals(Set.of(WalkState.today(context)), WalkState.pending(context));
    assertTrue(
        manager.getViewFor(102).getContentDescription().toString().contains("waiting to sync"));
  }

  @Test
  public void smallButtonLogsCurrentDayEvenWhileShowingYesterdaysCheck() {
    WorkManagerTestInitHelper.initializeTestWorkManager(
        context, new Configuration.Builder().setExecutor(new SynchronousExecutor()).build());
    workManagerInitialized = true;
    String today = WalkState.today(context);
    String yesterday = LocalDate.parse(today).minusDays(1).toString();
    WalkState.prefs(context).edit().putStringSet("walkDates", Set.of(yesterday)).commit();
    View stale = render(true, yesterday, 64, 64);
    assertTrue(stale.getContentDescription().toString().contains("Today's walk is in"));
    stale.performClick();
    shadowOf(Looper.getMainLooper()).idle();
    assertEquals(Set.of(today), WalkState.pending(context));
    assertNull(shadowOf((Application) context).getNextStartedActivity());
  }

  @Test
  public void queuedWalkDoesNotInflateConfirmedStats() {
    WalkState.queue(context, TODAY);
    View large = render(false, TODAY, 240, 150);
    assertEquals("Walk queued", text(large, R.id.widget_title));
    assertEquals("3", text(large, R.id.widget_streak));
    assertEquals("2/7", text(large, R.id.widget_week));
    assertEquals("3", text(large, R.id.widget_total));
    View small = render(true, TODAY, 64, 64);
    assertEquals("WALK", text(small, R.id.widget_button_label));
    assertTrue(small.getContentDescription().toString().contains("waiting to sync"));

    WalkState.dequeue(context, TODAY);
    WalkState.prefs(context)
        .edit()
        .putStringSet("walkDates", Set.of("2026-09-06", "2026-09-07", "2026-09-08", TODAY))
        .commit();
    large = render(false, TODAY, 240, 150);
    assertEquals("We did it! ✓", text(large, R.id.widget_title));
    assertEquals("4", text(large, R.id.widget_streak));
    assertEquals("3/7", text(large, R.id.widget_week));
    assertEquals("4", text(large, R.id.widget_total));
    assertTrue(
        render(true, TODAY, 64, 64)
            .getContentDescription()
            .toString()
            .contains("Today's walk is in"));
  }

  @Test
  public void bothInstalledProvidersRefreshTogether() {
    var manager = shadowOf(AppWidgetManager.getInstance(context));
    manager.bindAppWidgetId(101, new ComponentName(context, WalkWidget.class));
    manager.bindAppWidgetId(102, new ComponentName(context, WalkButtonWidget.class));
    String today = WalkState.today(context);
    WalkState.queue(context, today);
    WalkWidget.updateAll(context);
    assertEquals("Walk queued", text(manager.getViewFor(101), R.id.widget_title));
    assertTrue(manager.getViewFor(102).getContentDescription().toString().contains("Walk queued"));
    WalkState.dequeue(context, today);
    WalkState.prefs(context).edit().putStringSet("walkDates", Set.of(today)).commit();
    WalkWidget.updateAll(context);
    assertEquals("We did it! ✓", text(manager.getViewFor(101), R.id.widget_title));
    assertTrue(manager.getViewFor(102).getContentDescription().toString().contains("We did it"));
  }

  @Test
  public void upgradeAndDisconnectedStatesDoNotInventStatistics() {
    WalkState.prefs(context)
        .edit()
        .remove("walkDates")
        .putString("statusDate", TODAY)
        .putBoolean("walked", true)
        .commit();
    View oldCache = render(false, TODAY, 240, 150);
    assertEquals("We did it! ✓", text(oldCache, R.id.widget_title));
    assertEquals("—", text(oldCache, R.id.widget_total));
    WalkState.prefs(context).edit().remove("token").commit();
    assertTrue(render(true, TODAY, 64, 64).getContentDescription().toString().contains("set up"));
    assertEquals("Let's connect", text(render(false, TODAY, 240, 150), R.id.widget_title));
  }

  @Test
  public void midnightAndMondayRecalculateCachedDates() {
    Set<String> dates = Set.of("2026-09-05", "2026-09-06", "2026-09-20", "invalid");
    WidgetStats sunday = new WidgetStats(dates, LocalDate.parse("2026-09-06"));
    assertTrue(sunday.walkedToday);
    assertEquals(2, sunday.streak);
    assertEquals(2, sunday.weekCount);
    assertEquals(2, sunday.total);
    WidgetStats monday = new WidgetStats(dates, LocalDate.parse("2026-09-07"));
    assertFalse(monday.walkedToday);
    assertEquals(2, monday.streak);
    assertEquals(0, monday.weekCount);
    WidgetStats tuesday = new WidgetStats(dates, LocalDate.parse("2026-09-08"));
    assertEquals(0, tuesday.streak);
    assertEquals(2, tuesday.total);
  }

  private void assertFits(View view) {
    assertTrue("Zero width: " + view, view.getWidth() > 0);
    assertTrue("Zero height: " + view, view.getHeight() > 0);
    if (view instanceof ViewGroup group) {
      for (int i = 0; i < group.getChildCount(); i++) {
        View child = group.getChildAt(i);
        assertTrue(
            "Clipped vertically: " + child,
            child.getTop() >= 0 && child.getBottom() <= group.getHeight());
        assertTrue(
            "Clipped horizontally: " + child,
            child.getLeft() >= 0 && child.getRight() <= group.getWidth());
        assertFits(child);
      }
    }
  }

  @Test
  public void smallestLauncherBoundsFitAndProduceNativePreviews() throws Exception {
    assertFits(render(true, TODAY, 40, 40));
    assertFits(render(true, TODAY, 57, 102));
    assertFits(render(true, TODAY, 127, 51));
    assertFits(render(false, TODAY, 180, 110));
    preview("large-ready", render(false, TODAY, 240, 150));
    preview("small-ready", render(true, TODAY, 72, 72));
    WalkState.queue(context, TODAY);
    preview("large-queued", render(false, TODAY, 240, 150));
    preview("small-queued", render(true, TODAY, 72, 72));
    WalkState.dequeue(context, TODAY);
    WalkState.prefs(context)
        .edit()
        .putStringSet("walkDates", Set.of("2026-09-06", "2026-09-07", "2026-09-08", TODAY))
        .commit();
    preview("large-done", render(false, TODAY, 240, 150));
    preview("small-done", render(true, TODAY, 72, 72));
  }

  @Test
  @Config(sdk = 26)
  public void oldestSupportedAndroidCanInflateBothWidgets() {
    assertFits(render(true, TODAY, 56, 56));
    assertFits(render(false, TODAY, 240, 150));
  }

  private void preview(String name, View view) throws Exception {
    File directory = new File("build/widget-previews");
    assertTrue(directory.isDirectory() || directory.mkdirs());
    Bitmap image =
        Bitmap.createBitmap(view.getWidth() * 3, view.getHeight() * 3, Bitmap.Config.ARGB_8888);
    Canvas canvas = new Canvas(image);
    canvas.scale(3, 3);
    view.draw(canvas);
    try (var out = new FileOutputStream(new File(directory, name + ".png"))) {
      assertTrue(image.compress(Bitmap.CompressFormat.PNG, 100, out));
    }
  }
}
