package com.tangjingxuan.syncwatch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;

import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;
import java.nio.ByteBuffer;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class ScreenCaptureService extends Service {
    public interface Listener {
        void onNativeCaptureState(CaptureState state);
        void onNativeCaptureFrame(CaptureFrame frame);
    }

    public static final class CaptureState {
        public final String state;
        public final String sessionId;
        public final String reason;
        public final String message;
        public final int width;
        public final int height;
        public final int fps;

        CaptureState(String state, String sessionId, String reason, String message,
                     int width, int height, int fps) {
            this.state = state == null ? "idle" : state;
            this.sessionId = sessionId == null ? "" : sessionId;
            this.reason = reason == null ? "" : reason;
            this.message = message == null ? "" : message;
            this.width = width;
            this.height = height;
            this.fps = fps;
        }
    }

    public static final class CaptureFrame {
        public final String sessionId;
        public final long sequence;
        public final int width;
        public final int height;
        public final String jpegBase64;
        public final int byteLength;

        CaptureFrame(String sessionId, long sequence, int width, int height,
                     String jpegBase64, int byteLength) {
            this.sessionId = sessionId;
            this.sequence = sequence;
            this.width = width;
            this.height = height;
            this.jpegBase64 = jpegBase64;
            this.byteLength = byteLength;
        }
    }

    private static final String ACTION_START = "com.tangjingxuan.syncwatch.screen.START";
    private static final String ACTION_STOP = "com.tangjingxuan.syncwatch.screen.STOP";
    private static final String EXTRA_RESULT_CODE = "resultCode";
    private static final String EXTRA_RESULT_DATA = "resultData";
    private static final String EXTRA_SESSION_ID = "sessionId";
    private static final String EXTRA_STOP_REASON = "stopReason";
    private static final String NOTIFICATION_CHANNEL = "syncwatch_screen_share";
    private static final int NOTIFICATION_ID = 4202;
    static final int TARGET_FPS = 12;
    static final int PRESSURE_FPS = 10;
    static final int LOW_PRESSURE_FPS = 8;
    static final int MAX_CAPTURE_DIMENSION = 1920;
    static final int LOW_MEMORY_CAPTURE_DIMENSION = 1600;
    static final int LOW_MEMORY_CLASS_MB = 192;
    static final int MAX_JPEG_BYTES = 1400 * 1024;
    static final int MEDIUM_PRESSURE_JPEG_BYTES = 800 * 1024;
    static final int HIGH_PRESSURE_JPEG_BYTES = 1100 * 1024;
    static final long ENCODE_PRESSURE_MS = 65L;

    private static final Object LISTENER_LOCK = new Object();
    private static WeakReference<Listener> listenerReference = new WeakReference<>(null);
    private static WeakReference<ScreenCaptureService> serviceReference = new WeakReference<>(null);
    private static volatile CaptureState latestState =
            new CaptureState("idle", "", "", "", 0, 0, TARGET_FPS);

    private HandlerThread captureThread;
    private Handler captureHandler;
    private DisplayManager displayManager;
    private MediaProjection mediaProjection;
    private MediaProjection.Callback projectionCallback;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private boolean captureActive;
    private boolean stopping;
    private String sessionId = "";
    private int captureWidth;
    private int captureHeight;
    private int captureDensity;
    private long sequence;
    private long lastFrameAt;
    private long adaptiveFrameIntervalMs = 1000L / TARGET_FPS;
    private boolean screenReceiverRegistered;

    private final Runnable reconfigureRunnable = this::reconfigureDisplayOnCaptureThread;

    private final DisplayManager.DisplayListener displayListener = new DisplayManager.DisplayListener() {
        @Override
        public void onDisplayAdded(int displayId) {
        }

        @Override
        public void onDisplayRemoved(int displayId) {
            if (displayId == Display.DEFAULT_DISPLAY) {
                stopFromCaptureThread("display-removed", "屏幕已断开");
            }
        }

        @Override
        public void onDisplayChanged(int displayId) {
            if (displayId != Display.DEFAULT_DISPLAY || captureHandler == null) return;
            captureHandler.removeCallbacks(reconfigureRunnable);
            captureHandler.postDelayed(reconfigureRunnable, 250);
        }
    };

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent == null ? null : intent.getAction())
                    && captureHandler != null) {
                captureHandler.post(() -> stopFromCaptureThread(
                        "screen-locked", "屏幕已锁定，共享已自动停止"));
            }
        }
    };

    public static void setListener(Listener listener) {
        CaptureState snapshot;
        synchronized (LISTENER_LOCK) {
            listenerReference = new WeakReference<>(listener);
            snapshot = latestState;
        }
        if (listener != null) listener.onNativeCaptureState(snapshot);
    }

    public static void clearListener(Listener listener) {
        synchronized (LISTENER_LOCK) {
            Listener current = listenerReference.get();
            if (current == listener) listenerReference.clear();
        }
    }

    public static CaptureState getLatestState() {
        return latestState;
    }

    public static boolean isCaptureActive() {
        CaptureState state = latestState;
        return "starting".equals(state.state) || "started".equals(state.state);
    }

    public static void startCapture(Context context, int resultCode, Intent resultData,
                                    String requestedSessionId) {
        Intent intent = new Intent(context, ScreenCaptureService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_RESULT_CODE, resultCode);
        intent.putExtra(EXTRA_RESULT_DATA, resultData);
        intent.putExtra(EXTRA_SESSION_ID, requestedSessionId);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    public static void stopCapture(Context context, String reason) {
        ScreenCaptureService service = serviceReference.get();
        if (service != null && service.captureHandler != null) {
            service.captureHandler.post(() -> service.stopFromCaptureThread(
                    sanitizeReason(reason), stopMessage(reason)));
            return;
        }
        Intent intent = new Intent(context, ScreenCaptureService.class);
        intent.setAction(ACTION_STOP);
        intent.putExtra(EXTRA_STOP_REASON, sanitizeReason(reason));
        try {
            context.startService(intent);
        } catch (RuntimeException ignored) {
            publishState(new CaptureState("stopped", latestState.sessionId,
                    sanitizeReason(reason), stopMessage(reason), 0, 0, TARGET_FPS));
        }
    }

    private static String sanitizeReason(String reason) {
        String value = reason == null ? "user" : reason.trim();
        return value.isEmpty() ? "user" : value;
    }

    private static String stopMessage(String reason) {
        if ("screen-locked".equals(reason)) return "屏幕已锁定，共享已自动停止";
        if ("page-navigation".equals(reason)) return "页面已切换，共享已停止";
        if ("server-changed".equals(reason)) return "服务器已切换，共享已停止";
        if ("activity-destroyed".equals(reason)) return "应用已关闭，共享已停止";
        return "屏幕共享已停止";
    }

    @Override
    public void onCreate() {
        super.onCreate();
        captureThread = new HandlerThread("SyncWatchScreenCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
        displayManager = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        if (displayManager != null) displayManager.registerDisplayListener(displayListener, captureHandler);
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReceiver, filter);
        }
        screenReceiverRegistered = true;
        serviceReference = new WeakReference<>(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? "" : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            String reason = intent.getStringExtra(EXTRA_STOP_REASON);
            captureHandler.post(() -> stopFromCaptureThread(
                    sanitizeReason(reason), stopMessage(reason)));
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(action)) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        String requestedSessionId = intent.getStringExtra(EXTRA_SESSION_ID);
        if (requestedSessionId == null || requestedSessionId.isEmpty()) {
            requestedSessionId = UUID.randomUUID().toString();
        }
        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, ActivityResultCodes.RESULT_CANCELED);
        Intent resultData = getParcelableIntentExtra(intent, EXTRA_RESULT_DATA);

        try {
            startProjectionForeground(buildNotification());
        } catch (RuntimeException error) {
            publishState(new CaptureState("error", requestedSessionId, "foreground-service",
                    safeMessage(error, "无法启动屏幕共享前台服务"), 0, 0, TARGET_FPS));
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        final String startSessionId = requestedSessionId;
        captureHandler.post(() -> startProjectionOnCaptureThread(
                resultCode, resultData, startSessionId));
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private static Intent getParcelableIntentExtra(Intent source, String key) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return source.getParcelableExtra(key, Intent.class);
        }
        return source.getParcelableExtra(key);
    }

    private void startProjectionForeground(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL, "屏幕共享", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("SyncWatch 正在共享手机屏幕");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Intent stopIntent = new Intent(this, ScreenCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        stopIntent.putExtra(EXTRA_STOP_REASON, "notification-stop");
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent stopPending = PendingIntent.getService(this, 4202, stopIntent, pendingFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("SyncWatch 正在共享屏幕")
                .setContentText("点击“停止共享”可立即结束")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_media_pause, "停止共享", stopPending).build());
        return builder.build();
    }

    private void startProjectionOnCaptureThread(int resultCode, Intent resultData,
                                                String requestedSessionId) {
        if (captureActive || mediaProjection != null) {
            publishState(new CaptureState("error", requestedSessionId, "already-active",
                    "已有屏幕共享会话正在运行", captureWidth, captureHeight, TARGET_FPS));
            return;
        }
        if (resultCode != ActivityResultCodes.RESULT_OK || resultData == null) {
            publishState(new CaptureState("error", requestedSessionId, "invalid-authorization",
                    "系统未返回有效的屏幕共享授权", 0, 0, TARGET_FPS));
            stopForegroundAndSelf();
            return;
        }

        sessionId = requestedSessionId;
        sequence = 0;
        lastFrameAt = 0;
        stopping = false;
        publishState(new CaptureState("starting", sessionId, "", "正在启动屏幕共享",
                0, 0, TARGET_FPS));

        try {
            MediaProjectionManager manager = (MediaProjectionManager)
                    getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (manager == null) throw new IllegalStateException("系统屏幕捕获服务不可用");
            mediaProjection = manager.getMediaProjection(resultCode, resultData);
            if (mediaProjection == null) throw new IllegalStateException("系统拒绝了屏幕捕获授权");

            projectionCallback = new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    if (captureHandler != null) captureHandler.post(() ->
                            handleProjectionRevokedOnCaptureThread());
                }
            };
            mediaProjection.registerCallback(projectionCallback, captureHandler);

            CaptureDimensions dimensions = readCaptureDimensions();
            captureWidth = dimensions.width;
            captureHeight = dimensions.height;
            captureDensity = dimensions.density;
            imageReader = createImageReader(captureWidth, captureHeight);
            virtualDisplay = mediaProjection.createVirtualDisplay(
                    "SyncWatchScreen",
                    captureWidth,
                    captureHeight,
                    captureDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader.getSurface(),
                    null,
                    captureHandler);
            if (virtualDisplay == null) throw new IllegalStateException("无法创建屏幕镜像");

            lastFrameAt = SystemClock.elapsedRealtime();
            captureActive = true;
            publishState(new CaptureState("started", sessionId, "", "屏幕共享已开始",
                    captureWidth, captureHeight, TARGET_FPS));
        } catch (RuntimeException error) {
            String message = safeMessage(error, "启动屏幕共享失败");
            cleanupCaptureOnCaptureThread(true);
            publishState(new CaptureState("error", sessionId, "capture-start-failed",
                    message, 0, 0, TARGET_FPS));
            stopForegroundAndSelf();
        }
    }

    private ImageReader createImageReader(int width, int height) {
        ImageReader reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        reader.setOnImageAvailableListener(this::handleImageAvailable, captureHandler);
        return reader;
    }

    private void handleImageAvailable(ImageReader reader) {
        if (!captureActive || stopping) {
            discardLatestImage(reader);
            return;
        }
        long now = SystemClock.elapsedRealtime();
        if (now - lastFrameAt < adaptiveFrameIntervalMs) {
            discardLatestImage(reader);
            return;
        }

        Image image = null;
        Bitmap paddedBitmap = null;
        Bitmap frameBitmap = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null) return;
            Image.Plane[] planes = image.getPlanes();
            if (planes.length == 0) return;
            Image.Plane plane = planes[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            if (pixelStride <= 0 || rowStride <= 0) return;
            int paddedWidth = captureWidth + Math.max(0,
                    (rowStride - pixelStride * captureWidth) / pixelStride);
            paddedBitmap = Bitmap.createBitmap(paddedWidth, captureHeight, Bitmap.Config.ARGB_8888);
            paddedBitmap.copyPixelsFromBuffer(buffer);
            if (paddedWidth == captureWidth) {
                frameBitmap = paddedBitmap;
            } else {
                frameBitmap = Bitmap.createBitmap(paddedBitmap, 0, 0,
                        captureWidth, captureHeight);
            }

            long encodeStartedAt = SystemClock.elapsedRealtime();
            byte[] jpeg = compressWithinLimit(frameBitmap);
            long encodeDurationMs = Math.max(0L, SystemClock.elapsedRealtime() - encodeStartedAt);
            if (jpeg == null || jpeg.length == 0 || jpeg.length > MAX_JPEG_BYTES) return;
            updateAdaptiveFrameInterval(encodeDurationMs, jpeg.length);
            lastFrameAt = SystemClock.elapsedRealtime();
            CaptureFrame frame = new CaptureFrame(
                    sessionId,
                    ++sequence,
                    captureWidth,
                    captureHeight,
                    Base64.encodeToString(jpeg, Base64.NO_WRAP),
                    jpeg.length);
            publishFrame(frame);
        } catch (RuntimeException ignored) {
            // Individual damaged frames are dropped; the projection session stays alive.
        } finally {
            if (image != null) image.close();
            if (frameBitmap != null && frameBitmap != paddedBitmap) frameBitmap.recycle();
            if (paddedBitmap != null) paddedBitmap.recycle();
        }
    }

    private static void discardLatestImage(ImageReader reader) {
        Image image = null;
        try {
            image = reader.acquireLatestImage();
        } catch (RuntimeException ignored) {
        } finally {
            if (image != null) image.close();
        }
    }

    private static byte[] compressWithinLimit(Bitmap bitmap) {
        int[] qualities = {88, 82, 76, 68, 60, 52, 44};
        for (int quality : qualities) {
            ByteArrayOutputStream output = new ByteArrayOutputStream(256 * 1024);
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output)) return null;
            byte[] bytes = output.toByteArray();
            if (bytes.length <= MAX_JPEG_BYTES) return bytes;
        }
        return null;
    }

    private void updateAdaptiveFrameInterval(long encodeDurationMs, int jpegBytes) {
        if (jpegBytes >= HIGH_PRESSURE_JPEG_BYTES || encodeDurationMs >= ENCODE_PRESSURE_MS * 2) {
            adaptiveFrameIntervalMs = 1000L / LOW_PRESSURE_FPS;
        } else if (jpegBytes >= MEDIUM_PRESSURE_JPEG_BYTES || encodeDurationMs >= ENCODE_PRESSURE_MS) {
            adaptiveFrameIntervalMs = 1000L / PRESSURE_FPS;
        } else {
            adaptiveFrameIntervalMs = 1000L / TARGET_FPS;
        }
    }

    private void reconfigureDisplayOnCaptureThread() {
        if (!captureActive || stopping || virtualDisplay == null) return;
        CaptureDimensions dimensions;
        try {
            dimensions = readCaptureDimensions();
        } catch (RuntimeException error) {
            stopFromCaptureThread("display-error", safeMessage(error, "无法读取屏幕尺寸"));
            return;
        }
        if (dimensions.width == captureWidth && dimensions.height == captureHeight
                && dimensions.density == captureDensity) return;

        ImageReader replacement = null;
        try {
            replacement = createImageReader(dimensions.width, dimensions.height);
            ImageReader previous = imageReader;
            virtualDisplay.setSurface(null);
            virtualDisplay.resize(dimensions.width, dimensions.height, dimensions.density);
            virtualDisplay.setSurface(replacement.getSurface());
            imageReader = replacement;
            captureWidth = dimensions.width;
            captureHeight = dimensions.height;
            captureDensity = dimensions.density;
            lastFrameAt = 0;
            if (previous != null) {
                previous.setOnImageAvailableListener(null, null);
                previous.close();
            }
            publishState(new CaptureState("started", sessionId, "display-resized",
                    "屏幕方向或尺寸已更新", captureWidth, captureHeight, TARGET_FPS));
        } catch (RuntimeException error) {
            if (replacement != null && replacement != imageReader) replacement.close();
            stopFromCaptureThread("display-resize-failed",
                    safeMessage(error, "屏幕旋转后无法继续共享"));
        }
    }

    @SuppressWarnings("deprecation")
    private CaptureDimensions readCaptureDimensions() {
        if (displayManager == null) throw new IllegalStateException("显示服务不可用");
        Display display = displayManager.getDisplay(Display.DEFAULT_DISPLAY);
        if (display == null) throw new IllegalStateException("主屏幕不可用");
        DisplayMetrics metrics = new DisplayMetrics();
        display.getRealMetrics(metrics);
        int sourceWidth = Math.max(1, metrics.widthPixels);
        int sourceHeight = Math.max(1, metrics.heightPixels);
        int dimensionLimit = captureDimensionLimit();
        int longest = Math.max(sourceWidth, sourceHeight);
        float scale = longest > dimensionLimit
                ? (float) dimensionLimit / longest
                : 1f;
        int width = makeEven(Math.max(2, Math.round(sourceWidth * scale)));
        int height = makeEven(Math.max(2, Math.round(sourceHeight * scale)));
        return new CaptureDimensions(width, height, Math.max(1, metrics.densityDpi));
    }

    private int captureDimensionLimit() {
        try {
            ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (manager != null && (manager.isLowRamDevice()
                    || manager.getMemoryClass() <= LOW_MEMORY_CLASS_MB)) {
                return LOW_MEMORY_CAPTURE_DIMENSION;
            }
        } catch (RuntimeException ignored) {
        }
        return MAX_CAPTURE_DIMENSION;
    }

    private static int makeEven(int value) {
        return (value & 1) == 0 ? value : value - 1;
    }

    private void handleProjectionRevokedOnCaptureThread() {
        if (!captureActive && mediaProjection == null) return;
        String stoppedSession = sessionId;
        cleanupCaptureOnCaptureThread(false);
        publishState(new CaptureState("stopped", stoppedSession, "projection-revoked",
                "系统已撤销屏幕共享授权", 0, 0, TARGET_FPS));
        stopForegroundAndSelf();
    }

    private void stopFromCaptureThread(String reason, String message) {
        if (stopping) return;
        stopping = true;
        String stoppedSession = sessionId.isEmpty() ? latestState.sessionId : sessionId;
        cleanupCaptureOnCaptureThread(true);
        publishState(new CaptureState("stopped", stoppedSession,
                sanitizeReason(reason), message, 0, 0, TARGET_FPS));
        stopForegroundAndSelf();
    }

    private void cleanupCaptureOnCaptureThread(boolean stopProjection) {
        captureActive = false;
        if (captureHandler != null) captureHandler.removeCallbacks(reconfigureRunnable);
        if (imageReader != null) {
            try {
                imageReader.setOnImageAvailableListener(null, null);
            } catch (RuntimeException ignored) {
            }
        }
        if (virtualDisplay != null) {
            try {
                virtualDisplay.setSurface(null);
            } catch (RuntimeException ignored) {
            }
            try {
                virtualDisplay.release();
            } catch (RuntimeException ignored) {
            }
            virtualDisplay = null;
        }
        if (imageReader != null) {
            try {
                imageReader.close();
            } catch (RuntimeException ignored) {
            }
            imageReader = null;
        }
        MediaProjection projection = mediaProjection;
        MediaProjection.Callback callback = projectionCallback;
        mediaProjection = null;
        projectionCallback = null;
        if (projection != null && callback != null) {
            try {
                projection.unregisterCallback(callback);
            } catch (RuntimeException ignored) {
            }
        }
        if (projection != null && stopProjection) {
            try {
                projection.stop();
            } catch (RuntimeException ignored) {
            }
        }
        captureWidth = 0;
        captureHeight = 0;
        captureDensity = 0;
        sessionId = "";
        sequence = 0;
        lastFrameAt = 0;
        adaptiveFrameIntervalMs = 1000L / TARGET_FPS;
        stopping = false;
    }

    private void stopForegroundAndSelf() {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                //noinspection deprecation
                stopForeground(true);
            }
            stopSelf();
        });
    }

    private static void publishState(CaptureState state) {
        latestState = state;
        Listener listener;
        synchronized (LISTENER_LOCK) {
            listener = listenerReference.get();
        }
        if (listener != null) listener.onNativeCaptureState(state);
    }

    private static void publishFrame(CaptureFrame frame) {
        Listener listener;
        synchronized (LISTENER_LOCK) {
            listener = listenerReference.get();
        }
        if (listener != null) listener.onNativeCaptureFrame(frame);
    }

    private static String safeMessage(Throwable error, String fallback) {
        String message = error == null ? "" : error.getMessage();
        if (message != null && message.matches(".*[\\u3400-\\u9FFF].*")) {
            return message.trim();
        }
        return fallback;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (captureHandler != null) captureHandler.post(() ->
                stopFromCaptureThread("task-removed", "应用已从最近任务移除，共享已停止"));
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        serviceReference.clear();
        if (displayManager != null) {
            try {
                displayManager.unregisterDisplayListener(displayListener);
            } catch (RuntimeException ignored) {
            }
        }
        if (screenReceiverRegistered) {
            try {
                unregisterReceiver(screenReceiver);
            } catch (RuntimeException ignored) {
            }
            screenReceiverRegistered = false;
        }
        if (captureHandler != null && captureThread != null) {
            CountDownLatch latch = new CountDownLatch(1);
            captureHandler.post(() -> {
                try {
                    if (captureActive || mediaProjection != null) {
                        String stoppedSession = sessionId;
                        cleanupCaptureOnCaptureThread(true);
                        publishState(new CaptureState("stopped", stoppedSession,
                                "service-destroyed", "屏幕共享服务已停止", 0, 0, TARGET_FPS));
                    }
                } finally {
                    latch.countDown();
                }
            });
            try {
                latch.await(800, TimeUnit.MILLISECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
            captureThread.quitSafely();
        }
        captureHandler = null;
        captureThread = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static final class CaptureDimensions {
        final int width;
        final int height;
        final int density;

        CaptureDimensions(int width, int height, int density) {
            this.width = width;
            this.height = height;
            this.density = density;
        }
    }

    private static final class ActivityResultCodes {
        static final int RESULT_OK = -1;
        static final int RESULT_CANCELED = 0;
    }
}
