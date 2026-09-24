package com.eightbitspliff.neontetris;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;

/**
 * Hosts the HTML5 game in a fullscreen WebView and forwards game controller input
 * (Xbox etc.) to it. Controller events are handled natively and pushed to
 * window.NativePad in js/input.js, which is more reliable than the WebView Gamepad API.
 */
public class MainActivity extends Activity implements InputManager.InputDeviceListener {
    private static final String HOST = "appassets.androidplatform.net";

    private WebView web;
    private InputManager inputManager;
    private boolean pageReady = false;
    private int announcedId = -1;
    private int keyMask = 0;   // buttons reported as key events
    private int axisMask = 0;  // d-pad hat and triggers reported as motion events
    private float stickX = 0f, stickY = 0f;
    private String lastState = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(5, 6, 15));
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loadAsset(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                announcedId = -1;
                lastState = "";
                announceConnectedPad();
            }
        });

        inputManager = (InputManager) getSystemService(Context.INPUT_SERVICE);
        web.loadUrl("https://" + HOST + "/index.html");
        hideSystemUi();
    }

    // ---------- Serving the bundled game files ----------

    private WebResourceResponse loadAsset(Uri uri) {
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.equals("/")) path = "/index.html";
        try {
            InputStream in = getAssets().open("web" + path);
            return new WebResourceResponse(mimeType(path), "UTF-8", in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    new HashMap<>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    // ---------- Lifecycle / fullscreen ----------

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        inputManager.registerInputDeviceListener(this, new Handler(Looper.getMainLooper()));
        hideSystemUi();
        announceConnectedPad();
    }

    @Override
    protected void onPause() {
        js("window.androidPause && androidPause()");
        inputManager.unregisterInputDeviceListener(this);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    private void js(String code) {
        if (pageReady) web.evaluateJavascript(code, null);
    }

    // ---------- Controller input ----------

    private static boolean hasSource(int sources, int source) {
        return (sources & source) == source;
    }

    private static boolean isGamepadDevice(InputDevice d) {
        if (d == null || d.isVirtual()) return false;
        int s = d.getSources();
        return hasSource(s, InputDevice.SOURCE_GAMEPAD) || hasSource(s, InputDevice.SOURCE_JOYSTICK);
    }

    /** Maps Android key codes to the W3C "standard gamepad" button indices used by the game. */
    private static int buttonIndex(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 8;
            case KeyEvent.KEYCODE_BUTTON_START: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            case KeyEvent.KEYCODE_BUTTON_MODE: return 16;
            default: return -1;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        if (isGamepadDevice(e.getDevice())) {
            int idx = buttonIndex(code);
            if (idx >= 0) {
                announce(e.getDevice());
                if (e.getAction() == KeyEvent.ACTION_DOWN) keyMask |= (1 << idx);
                else if (e.getAction() == KeyEvent.ACTION_UP) keyMask &= ~(1 << idx);
                pushPadState();
                return true;
            }
        }
        if (code == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_UP) handleBack();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    private void handleBack() {
        if (!pageReady) { finish(); return; }
        web.evaluateJavascript("window.androidBack ? androidBack() : false", result -> {
            if (!"true".equals(result)) finish();
        });
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        int src = e.getSource();
        if ((hasSource(src, InputDevice.SOURCE_JOYSTICK) || hasSource(src, InputDevice.SOURCE_GAMEPAD))
                && e.getAction() == MotionEvent.ACTION_MOVE) {
            InputDevice dev = e.getDevice();
            announce(dev);
            stickX = axis(e, dev, MotionEvent.AXIS_X);
            stickY = axis(e, dev, MotionEvent.AXIS_Y);
            float hatX = e.getAxisValue(MotionEvent.AXIS_HAT_X);
            float hatY = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
            float lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
            float rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
            int m = 0;
            if (hatY < -0.5f) m |= 1 << 12;
            if (hatY > 0.5f) m |= 1 << 13;
            if (hatX < -0.5f) m |= 1 << 14;
            if (hatX > 0.5f) m |= 1 << 15;
            if (lt > 0.5f) m |= 1 << 6;
            if (rt > 0.5f) m |= 1 << 7;
            axisMask = m;
            pushPadState();
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    private static float axis(MotionEvent e, InputDevice dev, int ax) {
        float v = e.getAxisValue(ax);
        InputDevice.MotionRange r = dev != null ? dev.getMotionRange(ax, e.getSource()) : null;
        float flat = r != null ? Math.max(r.getFlat(), 0.15f) : 0.15f;
        return Math.abs(v) > flat ? v : 0f;
    }

    private void pushPadState() {
        String code = String.format(Locale.US, "window.NativePad&&NativePad.update(%d,%.2f,%.2f)",
                keyMask | axisMask, stickX, stickY);
        if (code.equals(lastState)) return;
        lastState = code;
        js(code);
    }

    private void announce(InputDevice d) {
        if (!pageReady || !isGamepadDevice(d) || d.getId() == announcedId) return;
        announcedId = d.getId();
        js("window.NativePad&&NativePad.connect(" + JSONObject.quote(d.getName()) + ")");
    }

    private void announceConnectedPad() {
        if (announcedId >= 0 && InputDevice.getDevice(announcedId) != null) return;
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (isGamepadDevice(d)) { announce(d); return; }
        }
    }

    @Override
    public void onInputDeviceAdded(int deviceId) {
        announce(InputDevice.getDevice(deviceId));
    }

    @Override
    public void onInputDeviceRemoved(int deviceId) {
        if (deviceId != announcedId) return;
        announcedId = -1;
        keyMask = 0;
        axisMask = 0;
        stickX = 0f;
        stickY = 0f;
        pushPadState();
        js("window.NativePad&&NativePad.disconnect()");
        announceConnectedPad();
    }

    @Override
    public void onInputDeviceChanged(int deviceId) { }

    // ---------- Rumble ----------

    @SuppressWarnings("deprecation")
    private Vibrator padVibrator() {
        InputDevice d = announcedId >= 0 ? InputDevice.getDevice(announcedId) : null;
        if (d == null) return null;
        Vibrator v = Build.VERSION.SDK_INT >= 31 ? d.getVibratorManager().getDefaultVibrator() : d.getVibrator();
        return v != null && v.hasVibrator() ? v : null;
    }

    @SuppressWarnings("deprecation")
    private Vibrator phoneVibrator() {
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    /** Methods callable from JavaScript as window.AndroidBridge. */
    public class Bridge {
        @JavascriptInterface
        public void rumble(int ms, double strong, double weak) {
            try {
                Vibrator v = padVibrator();
                int duration = Math.max(1, ms);
                if (v == null) {
                    // No controller rumble: give short feedback on the phone, unless a controller is in use.
                    if (announcedId >= 0) return;
                    v = phoneVibrator();
                    duration = Math.max(1, ms / 2);
                }
                if (v == null || !v.hasVibrator()) return;
                int amp = (int) Math.round(Math.max(strong, weak) * 255);
                amp = Math.max(1, Math.min(255, amp));
                v.vibrate(VibrationEffect.createOneShot(duration,
                        v.hasAmplitudeControl() ? amp : VibrationEffect.DEFAULT_AMPLITUDE));
            } catch (Exception ignored) {
                // Vibration is optional
            }
        }
    }
}
