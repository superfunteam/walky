package com.superfunteam.walky;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;
import java.net.URI;

public class MainActivity extends Activity {
  private WebView web;

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
    var p = WalkState.prefs(this);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL);
    layout.setGravity(Gravity.CENTER_VERTICAL);
    layout.setPadding(dp(28), dp(40), dp(28), dp(40));
    layout.setBackgroundColor(Color.rgb(251, 252, 248));
    TextView title = new TextView(this);
    title.setText("walky ✳\nSmall steps, together.");
    title.setTextSize(30);
    title.setTextColor(Color.rgb(23, 62, 50));
    layout.addView(title);
    TextView description = new TextView(this);
    description.setText("Connect once, then log walks with one tap from your home screen.");
    description.setTextSize(16);
    description.setPadding(0, dp(18), 0, dp(24));
    layout.addView(description);
    EditText url = new EditText(this);
    url.setHint("https://walky.wims.vc");
    url.setInputType(17);
    url.setText(p.getString("url", "https://walky.wims.vc"));
    url.setSingleLine(true);
    layout.addView(url);
    EditText code = new EditText(this);
    code.setHint("Shared connection code");
    code.setInputType(129);
    code.setSingleLine(true);
    code.setText(p.getString("token", ""));
    layout.addView(code);
    Button save = new Button(this);
    save.setText("Connect our calendar");
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
            if (!WalkState.pending(this).isEmpty()
                && (!address.equals(p.getString("url", ""))
                    || !token.equals(p.getString("token", "")))) {
              error.setText("Sync pending walks before switching your connection.");
              return;
            }
            p.edit()
                .putString("url", address)
                .putString("token", token)
                .remove("statusDate")
                .remove("error")
                .apply();
            WalkSync.periodic(this);
            WalkSync.enqueue(this);
            showApp();
          } catch (Exception e) {
            error.setText("Enter an HTTPS service address and the full connection code.");
          }
        });
    setContentView(layout);
  }

  private void showApp() {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setFitsSystemWindows(true);
    root.setBackgroundColor(Color.rgb(251, 252, 248));
    LinearLayout toolbar = new LinearLayout(this);
    toolbar.setGravity(Gravity.END);
    Button widget = new Button(this);
    widget.setText("Add widget");
    widget.setTextSize(12);
    Button settings = new Button(this);
    settings.setText("Connection");
    settings.setTextSize(12);
    toolbar.addView(widget);
    toolbar.addView(settings);
    root.addView(toolbar);
    widget.setOnClickListener(
        v -> {
          var manager = getSystemService(AppWidgetManager.class);
          if (manager.isRequestPinAppWidgetSupported())
            manager.requestPinAppWidget(new ComponentName(this, WalkWidget.class), null, null);
          else
            Toast.makeText(
                    this,
                    "Long press your home screen, choose Widgets, then Walky.",
                    Toast.LENGTH_LONG)
                .show();
        });
    settings.setOnClickListener(v -> setup());
    web = new WebView(this);
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
    setContentView(root);
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    String token = android.net.Uri.encode(WalkState.prefs(this).getString("token", ""));
    cookies.setCookie(
        origin,
        "walky=" + token + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000",
        ok -> {
          cookies.flush();
          web.loadUrl(origin + "/");
        });
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (WalkState.configured(this)) {
      WalkWidget.updateAll(this);
      WalkSync.enqueue(this);
    }
  }

  @Override
  protected void onDestroy() {
    if (web != null) web.destroy();
    super.onDestroy();
  }
}
