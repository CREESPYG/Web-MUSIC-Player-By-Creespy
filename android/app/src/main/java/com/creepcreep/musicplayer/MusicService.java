package com.creepcreep.musicplayer;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.core.app.NotificationCompat;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MusicService extends Service implements AudioManager.OnAudioFocusChangeListener {

    private static final String CHANNEL_ID = "creepcreep_audio";
    private static final int NOTIFICATION_ID = 1;
    public static final String ACTION_PLAY = "com.creepcreep.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.creepcreep.ACTION_PAUSE";
    public static final String ACTION_NEXT = "com.creepcreep.ACTION_NEXT";
    public static final String ACTION_PREV = "com.creepcreep.ACTION_PREV";
    public static final String ACTION_STOP = "com.creepcreep.ACTION_STOP";
    public static final String ACTION_UPDATE_METADATA = "com.creepcreep.ACTION_UPDATE_METADATA";

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean hasAudioFocus = false;

    private String currentTitle = "CREEP CREEP";
    private String currentArtist = "CREEP CREEP";
    private String currentAlbum = "CREEP CREEP";
    private String currentArtworkUrl = null;
    private Bitmap currentArtBitmap = null;
    private boolean isPlaying = false;

    private BroadcastReceiver noisyReceiver;
    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();
    private final Handler sleepTimerHandler = new Handler(Looper.getMainLooper());
    private Runnable sleepTimerRunnable;

    public static MusicService instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        initMediaSession();
        initAudioFocus();
        acquireLocks();
        registerNoisyReceiver();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Music Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controls for CREEP CREEP music playback");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "CreepCreepMusic");
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setActive(true);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                requestAudioFocus();
                sendCommandToWebView("media-play");
                updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
            }

            @Override
            public void onPause() {
                sendCommandToWebView("media-pause");
                updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
            }

            @Override
            public void onSkipToNext() {
                sendCommandToWebView("media-next");
            }

            @Override
            public void onSkipToPrevious() {
                sendCommandToWebView("media-previous");
            }

            @Override
            public void onStop() {
                sendCommandToWebView("media-pause");
                updatePlaybackState(PlaybackStateCompat.STATE_STOPPED);
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
            }

            @Override
            public void onSeekTo(long pos) {
                sendCommandToWebView("media-seek:" + pos);
            }
        });
    }

    private void initAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build();
        audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attrs)
            .setOnAudioFocusChangeListener(this)
            .setAcceptsDelayedFocusGain(true)
            .build();
    }

    private void acquireLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "creepcreep:playback");
                wakeLock.acquire(120 * 60 * 1000L); // 2 hours max
            }
        } catch (Exception e) {
            // noop
        }

        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "creepcreep:wifilock");
                wifiLock.acquire();
            }
        } catch (Exception e) {
            // noop
        }
    }

    private void registerNoisyReceiver() {
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                    sendCommandToWebView("media-pause");
                    updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
                }
            }
        };
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        registerReceiver(noisyReceiver, filter);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            switch (intent.getAction()) {
                case ACTION_PLAY:
                    requestAudioFocus();
                    sendCommandToWebView("media-play");
                    updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
                    return START_STICKY;
                case ACTION_PAUSE:
                    sendCommandToWebView("media-pause");
                    updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
                    return START_STICKY;
                case ACTION_NEXT:
                    sendCommandToWebView("media-next");
                    return START_STICKY;
                case ACTION_PREV:
                    sendCommandToWebView("media-previous");
                    return START_STICKY;
                case ACTION_STOP:
                    stopForeground(STOP_FOREGROUND_REMOVE);
                    stopSelf();
                    return START_NOT_STICKY;
                case ACTION_UPDATE_METADATA:
                    String title = intent.getStringExtra("title");
                    String artist = intent.getStringExtra("artist");
                    String album = intent.getStringExtra("album");
                    String artworkUrl = intent.getStringExtra("artworkUrl");
                    updateMetadata(title, artist, album, artworkUrl);
                    return START_STICKY;
            }
        }

        requestAudioFocus();
        startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        return START_STICKY;
    }

    private void requestAudioFocus() {
        if (!hasAudioFocus && audioManager != null) {
            int result = audioManager.requestAudioFocus(audioFocusRequest);
            hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        }
    }

    private void releaseAudioFocus() {
        if (hasAudioFocus && audioManager != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
            hasAudioFocus = false;
        }
    }

    @Override
    public void onAudioFocusChange(int focusChange) {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
                sendCommandToWebView("media-pause");
                updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                sendCommandToWebView("media-pause");
                updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
                break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                // Can duck or lower volume
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                sendCommandToWebView("media-play");
                updatePlaybackState(PlaybackStateCompat.STATE_PLAYING);
                break;
        }
    }

    private void sendCommandToWebView(String command) {
        Intent intent = new Intent("com.creepcreep.WEBVIEW_COMMAND");
        intent.putExtra("command", command);
        sendBroadcast(intent);

        if (BackgroundAudioPlugin.instance != null) {
            BackgroundAudioPlugin.instance.sendToWebView(command);
        }
    }

    private void updateMetadata(String title, String artist, String album, String artworkUrl) {
        if (title != null && !title.isEmpty()) currentTitle = title;
        if (artist != null && !artist.isEmpty()) currentArtist = artist;
        if (album != null && !album.isEmpty()) currentAlbum = album;

        boolean artChanged = artworkUrl != null && !artworkUrl.equals(currentArtworkUrl);
        if (artworkUrl != null) currentArtworkUrl = artworkUrl;

        applyMetadataToSession();
        refreshNotification();

        if (artChanged && artworkUrl != null && !artworkUrl.isEmpty()) {
            loadArtworkAsync(artworkUrl);
        }
    }

    private void applyMetadataToSession() {
        if (mediaSession == null) return;
        Bitmap art = currentArtBitmap != null ? currentArtBitmap : BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ART, art);

        mediaSession.setMetadata(metaBuilder.build());
    }

    private void loadArtworkAsync(String urlString) {
        imageExecutor.execute(() -> {
            try {
                URL url = new URL(urlString);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setDoInput(true);
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.connect();
                InputStream input = connection.getInputStream();
                Bitmap bitmap = BitmapFactory.decodeStream(input);
                if (bitmap != null) {
                    currentArtBitmap = bitmap;
                    applyMetadataToSession();
                    refreshNotification();
                }
            } catch (Exception e) {
                // Fallback to default launcher icon
            }
        });
    }

    public void updatePlaybackState(int state) {
        isPlaying = (state == PlaybackStateCompat.STATE_PLAYING);
        if (mediaSession != null) {
            PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY |
                    PlaybackStateCompat.ACTION_PAUSE |
                    PlaybackStateCompat.ACTION_PLAY_PAUSE |
                    PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                    PlaybackStateCompat.ACTION_SEEK_TO |
                    PlaybackStateCompat.ACTION_STOP
                )
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f);
            mediaSession.setPlaybackState(stateBuilder.build());
        }
        refreshNotification();
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent playIntent = new Intent(this, MusicService.class);
        playIntent.setAction(ACTION_PLAY);
        PendingIntent playPending = PendingIntent.getService(this, 1, playIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent pauseIntent = new Intent(this, MusicService.class);
        pauseIntent.setAction(ACTION_PAUSE);
        PendingIntent pausePending = PendingIntent.getService(this, 2, pauseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent prevIntent = new Intent(this, MusicService.class);
        prevIntent.setAction(ACTION_PREV);
        PendingIntent prevPending = PendingIntent.getService(this, 3, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent nextIntent = new Intent(this, MusicService.class);
        nextIntent.setAction(ACTION_NEXT);
        PendingIntent nextPending = PendingIntent.getService(this, 4, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Bitmap art = currentArtBitmap != null ? currentArtBitmap : BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText(currentAlbum)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(art)
            .setContentIntent(pendingIntent)
            .setOngoing(isPlaying)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .addAction(android.R.drawable.ic_media_previous, "Previous", prevPending)
            .addAction(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, isPlaying ? "Pause" : "Play", isPlaying ? pausePending : playPending)
            .addAction(android.R.drawable.ic_media_next, "Next", nextPending)
            .setSilent(true);

        return builder.build();
    }

    private void refreshNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    public void setSleepTimer(long seconds) {
        cancelSleepTimer();
        if (seconds <= 0) return;
        sleepTimerRunnable = () -> {
            sendCommandToWebView("media-pause");
            updatePlaybackState(PlaybackStateCompat.STATE_PAUSED);
            releaseAudioFocus();
        };
        sleepTimerHandler.postDelayed(sleepTimerRunnable, seconds * 1000L);
    }

    public void cancelSleepTimer() {
        if (sleepTimerRunnable != null) {
            sleepTimerHandler.removeCallbacks(sleepTimerRunnable);
            sleepTimerRunnable = null;
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // Retain playback when swiped from recents
    }

    @Override
    public void onDestroy() {
        cancelSleepTimer();
        releaseAudioFocus();
        if (noisyReceiver != null) {
            try {
                unregisterReceiver(noisyReceiver);
            } catch (Exception e) {
                // noop
            }
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        imageExecutor.shutdown();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

