package com.gradetracker.app;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;

/**
 * 成绩追踪 v2 外壳
 *
 * 相对原版（file:// + 空 WebChromeClient）补齐：
 *  1. WebViewAssetLoader：用 https://appassets.androidplatform.net 提供本地资源，origin 稳定
 *  2. onShowFileChooser：让 <input type=file> 真正能选文件（导入备份/分数线）
 *  3. DownloadListener：兜底 <a download>
 *  4. JS 桥 AndroidBridge：存图片 / 存文件 / 发通知 / 写备份
 *  5. 返回键：先交给页面（window.appHandleBack），再退回系统
 *
 * 前端已做降级：桥不存在时功能自动退化为长按保存 / 文本框复制 / 页内提醒。
 */
public class MainActivity extends AppCompatActivity {

    private static final int REQ_FILE_CHOOSER = 1001;
    private static final String CHANNEL_ID = "exam_reminder";

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage 必须
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);           // 走 AssetLoader 后不再需要 file://
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // 本地资源映射到 https://appassets.androidplatform.net/assets/...
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // 站内跳转才交给 WebView；外部链接交给系统浏览器
                Uri uri = request.getUrl();
                if (uri.getHost() != null && uri.getHost().equals("appassets.androidplatform.net")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES,
                            new String[]{"application/json", "text/plain", "text/csv", "text/comma-separated-values"});
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        // 兜底：页面里 <a download> 触发时，用系统浏览器/下载器接管
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                if (url != null && url.startsWith("data:")) {
                    String base64 = url.substring(url.indexOf(',') + 1);
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    saveBytes("export_" + System.currentTimeMillis(),
                            mimeType != null ? mimeType : "application/octet-stream", bytes);
                    return;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception e) {
                toast("下载失败，请用页面内的「导出备份」");
            }
        });

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");

        // 返回键：先让页面处理（关弹层 / 回首页）
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                webView.evaluateJavascript(
                        "(function(){try{return !!(window.appHandleBack && window.appHandleBack());}catch(e){return false;}})()",
                        value -> {
                            if (!"true".equals(value)) {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                                setEnabled(true);
                            }
                        });
            }
        });

        createNotificationChannel();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (fileCallback != null) {
                Uri[] results = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
                fileCallback.onReceiveValue(results);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /* ==================== JS 桥 ==================== */

    private class Bridge {

        /** 保存 canvas/toDataURL 的 PNG 到相册 */
        @JavascriptInterface
        public void saveImage(String dataUrl, String fileName) {
            try {
                String base64 = dataUrl.contains(",") ? dataUrl.substring(dataUrl.indexOf(',') + 1) : dataUrl;
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);

                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, safeName(fileName, "png"));
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/成绩追踪");
                    values.put(MediaStore.Images.Media.IS_PENDING, 1);
                }
                ContentResolver resolver = getContentResolver();
                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("insert failed");
                try (OutputStream os = resolver.openOutputStream(uri)) {
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear();
                    values.put(MediaStore.Images.Media.IS_PENDING, 0);
                    resolver.update(uri, values, null, null);
                }
                toast("已保存到相册");
            } catch (Exception e) {
                toast("保存失败：" + e.getMessage());
            }
        }

        /** 保存文本文件（JSON / CSV）到下载目录 */
        @JavascriptInterface
        public void saveFile(String fileName, String content, String mime) {
            try {
                saveBytes(fileName, mime == null ? "application/octet-stream" : mime,
                        content.getBytes(StandardCharsets.UTF_8));
                toast("已保存：" + fileName);
            } catch (Exception e) {
                toast("保存失败：" + e.getMessage());
            }
        }

        /** 本地通知（考试提醒） */
        @JavascriptInterface
        public void notify(String title, String message) {
            try {
                NotificationCompat.Builder b = new NotificationCompat.Builder(MainActivity.this, CHANNEL_ID)
                        .setSmallIcon(android.R.drawable.ic_dialog_info)
                        .setContentTitle(title)
                        .setContentText(message)
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT);
                NotificationManager nm = getSystemService(NotificationManager.class);
                nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
            } catch (Exception e) {
                toast("通知失败：" + e.getMessage());
            }
        }

        /** 每日快照落盘：files/backups/ 保留最近 5 份 */
        @JavascriptInterface
        public void writeBackup(String json) {
            try {
                File dir = new File(getFilesDir(), "backups");
                if (!dir.exists() && !dir.mkdirs()) return;
                File f = new File(dir, "backup_" + System.currentTimeMillis() + ".json");
                try (FileOutputStream fos = new FileOutputStream(f)) {
                    fos.write(json.getBytes(StandardCharsets.UTF_8));
                }
                File[] files = dir.listFiles();
                if (files != null && files.length > 5) {
                    Arrays.sort(files, Comparator.comparingLong(File::lastModified));
                    for (int i = 0; i < files.length - 5; i++) {
                        //noinspection ResultOfMethodCallIgnored
                        files[i].delete();
                    }
                }
            } catch (Exception ignored) {
            }
        }
    }

    /* ==================== 工具 ==================== */

    private void saveBytes(String fileName, String mime, byte[] bytes) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName(fileName, "txt"));
        values.put(MediaStore.Downloads.MIME_TYPE, mime);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/成绩追踪");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
        }
        ContentResolver resolver = getContentResolver();
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("无法创建文件");
        try (OutputStream os = resolver.openOutputStream(uri)) {
            os.write(bytes);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
        }
    }

    private static String safeName(String name, String fallbackExt) {
        if (name == null || name.trim().isEmpty()) {
            return "gradetracker_" + System.currentTimeMillis() + "." + fallbackExt;
        }
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "考试提醒", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("考试倒计时与复习提醒");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
    }
}
