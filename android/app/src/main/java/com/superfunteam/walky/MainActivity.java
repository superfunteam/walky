package com.superfunteam.walky;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.RippleDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;
import java.net.URI;

public class MainActivity extends Activity {
  private WebView web;
  private AlertDialog connectionDialog;

  @Override
  public void onCreate(Bundle b) {
    super.onCreate(b);
    if (WalkWidget.LOG.equals(getIntent().getAction()) && WalkState.configured(this)) {
      WalkState.log(this);
      Toast.makeText(this, "Walk queued. Nice work, you two.", Toast.LENGTH_SHORT).show();
      finish();
      return;
    }
    if (WalkState.configured(this)) showApp();
    else setup();
  }

  private int dp(int n) {
    return (int) (n * getResources().getDisplayMetrics().density);
  }

  private void setup() {
    if (connectionDialog != null) return;
    boolean editing = web != null;
    var p = WalkState.prefs(this);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.setGravity(editing ? Gravity.TOP : Gravity.CENTER_VERTICAL);
    layout.setPadding(dp(24), dp(28), dp(24), dp(28));
    layout.setBackgroundColor(Color.rgb(251, 252, 248));
    TextView title = new TextView(this);
    title.setText(editing ? "Your connection" : "walky ✳\nSmall steps, together.");
    title.setTextSize(editing ? 24 : 30);
    title.setTextColor(Color.rgb(23, 62, 50));
    layout.addView(title);
    TextView description = new TextView(this);
    description.setText(
        editing
            ? "Your shared calendar, on both phones."
            : "Connect once, then log walks with one tap from your home screen.");
    description.setTextSize(16);
    description.setPadding(0, dp(18), 0, dp(24));
    layout.addView(description);
    EditText url = new EditText(this);
    url.setHint("https://walky.wims.vc");
    url.setContentDescription("Service address");
    url.setInputType(17);
    url.setText(p.getString("url", "https://walky.wims.vc"));
    url.setSingleLine(true);
    layout.addView(url);
    EditText code = new EditText(this);
    code.setHint("Shared connection code");
    code.setContentDescription("Shared connection code");
    code.setInputType(129);
    code.setSingleLine(true);
    code.setText(p.getString("token", ""));
    layout.addView(code);
    Button save = new Button(this);
    save.setText(editing ? "Save connection" : "Connect our calendar");
    save.setAllCaps(false);
    layout.addView(save);
    TextView error = new TextView(this);
    error.setTextColor(Color.rgb(170, 70, 30));
    layout.addView(error);
    save.setOnClickListener(
        v -> {
          String address = url.getText().toString().trim().replaceAll("/+$", ""),
              token = code.getText().toString().trim();
          try {
            URI uri = new URI(address);
            if (!"https".equals(uri.getScheme())
                || uri.getHost() == null
                || uri.getUserInfo() != null
                || uri.getQuery() != null
                || uri.getFragment() != null
                || !(uri.getPath() == null || uri.getPath().isEmpty())) throw new Exception();
            if (token.length() < 32) throw new Exception();
            boolean changed =
                !address.equals(p.getString("url", "")) || !token.equals(p.getString("token", ""));
            if (!WalkState.pending(this).isEmpty() && changed) {
              error.setText("Sync pending walks before switching your connection.");
              return;
            }
            var settings =
                p.edit().putString("url", address).putString("token", token).remove("error");
            if (changed)
              settings
                  .remove("statusDate")
                  .remove("walkDates")
                  .remove("streak")
                  .remove("walked")
                  .remove("syncedAt")
                  .remove("timezone");
            settings.apply();
            WalkWidget.updateAll(this);
            WalkSync.periodic(this);
            WalkSync.enqueue(this);
            if (connectionDialog != null) connectionDialog.dismiss();
            if (!editing || changed) showApp();
          } catch (Exception e) {
            error.setText("Enter an HTTPS service address and the full connection code.");
          }
        });
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    scroll.setFitsSystemWindows(true);
    scroll.setBackgroundColor(Color.rgb(251, 252, 248));
    scroll.addView(layout);
    if (editing) {
      connectionDialog =
          new AlertDialog.Builder(this)
              .setView(scroll)
              .setNegativeButton("Cancel", (dialog, which) -> dialog.dismiss())
              .create();
      connectionDialog.setOnDismissListener(dialog -> connectionDialog = null);
      connectionDialog.show();
    } else setContentView(scroll);
  }

  private void showApp() {
    if (web != null) {
      ((ViewGroup) web.getParent()).removeView(web);
      web.destroy();
    }
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setFitsSystemWindows(true);
    root.setBackgroundColor(Color.rgb(251, 252, 248));
    web = new WebView(this);
    web.setBackgroundColor(Color.rgb(251, 252, 248));
    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    String origin = WalkState.prefs(this).getString("url", "");
    web.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) {
            if (!r.isForMainFrame()) return false;
            String target = r.getUrl().toString();
            if (target.startsWith(origin + "/") || target.equals(origin)) return false;
            try {
              startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl()));
            } catch (Exception ignored) {
            }
            return true;
          }

          @Override
          public void onReceivedError(WebView w, WebResourceRequest request, WebResourceError e) {
            if (request.isForMainFrame())
              Toast.makeText(
                      MainActivity.this,
                      "Can't reach Walky. The widget can queue your walk while offline.",
                      Toast.LENGTH_LONG)
                  .show();
          }
        });
    root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
    LinearLayout toolbar = new LinearLayout(this);
    toolbar.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
    toolbar.setPadding(dp(12), 0, dp(12), 0);
    Button options = new Button(this);
    options.setText("App options  ⋯");
    options.setContentDescription("App options");
    options.setAllCaps(false);
    options.setTextSize(13);
    options.setTextColor(Color.rgb(94, 114, 100));
    options.setElevation(0);
    options.setStateListAnimator(null);
    options.setMinHeight(0);
    options.setMinimumHeight(0);
    options.setPadding(dp(12), 0, dp(12), 0);
    options.setBackground(new RippleDrawable(ColorStateList.valueOf(0x18215741), null, null));
    toolbar.addView(
        options, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)));
    root.addView(
        toolbar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
    options.setOnClickListener(
        v -> {
          PopupMenu menu = new PopupMenu(this, options);
          menu.getMenu().add(0, 1, 0, "Add small WALK button");
          menu.getMenu().add(0, 2, 1, "Add large stats widget");
          menu.getMenu().add(0, 3, 2, "Connection");
          menu.setOnMenuItemClickListener(
              item -> {
                if (item.getItemId() == 1) addWidget(WalkButtonWidget.class);
                else if (item.getItemId() == 2) addWidget(WalkWidget.class);
                else setup();
                return true;
              });
          menu.show();
        });
    setContentView(root);
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    String token = android.net.Uri.encode(WalkState.prefs(this).getString("token", ""));
    WebView target = web;
    cookies.setCookie(
        origin,
        "walky=" + token + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000",
        ok -> {
          cookies.flush();
          if (web == target && !isDestroyed()) target.loadUrl(origin + "/");
        });
  }

  private void addWidget(Class<?> provider) {
    var manager = getSystemService(AppWidgetManager.class);
    if (manager.isRequestPinAppWidgetSupported())
      manager.requestPinAppWidget(new ComponentName(this, provider), null, null);
    else
      Toast.makeText(
              this, "Long press your home screen, choose Widgets, then Walky.", Toast.LENGTH_LONG)
          .show();
  }

  @Override
  public void onConfigurationChanged(Configuration configuration) {
    super.onConfigurationChanged(configuration);
    if (web != null) web.invalidate();
  }

  @Override
  protected void onPause() {
    if (web != null) web.onPause();
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (web != null) web.onResume();
    if (WalkState.configured(this)) {
      WalkWidget.updateAll(this);
      WalkSync.enqueue(this);
    }
  }

  @Override
  protected void onDestroy() {
    if (connectionDialog != null) connectionDialog.dismiss();
    if (web != null) web.destroy();
    super.onDestroy();
  }
}
