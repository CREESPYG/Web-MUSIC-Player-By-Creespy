package com.creepcreep.musicplayer;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    public static BackgroundAudioPlugin instance;
    private BroadcastReceiver webCommandReceiver;
    private static final String WEBVIEW_COMMAND_ACTION = "com.creepcreep.WEBVIEW_COMMAND";

    @Override
    public void load() {
        super.load();
        instance = this;
        registerCommandReceiver();
    }

    private void registerCommandReceiver() {
        webCommandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String command = intent.getStringExtra("command");
                if (command != null) {
                    JSObject data = new JSObject();
                    data.put("command", command);
                    notifyListeners("mediaCommand", data);
                }
            }
        };
        IntentFilter filter = new IntentFilter(WEBVIEW_COMMAND_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(webCommandReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(webCommandReceiver, filter);
        }
    }

    @PluginMethod
    public void startService(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        Intent serviceIntent = new Intent(activity, MusicService.class);
        serviceIntent.setAction(MusicService.ACTION_PLAY);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(serviceIntent);
        } else {
            activity.startService(serviceIntent);
        }

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        Intent serviceIntent = new Intent(activity, MusicService.class);
        serviceIntent.setAction(MusicService.ACTION_STOP);
        activity.startService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void updateMetadata(PluginCall call) {
        String title = call.getString("title", "Unknown");
        String artist = call.getString("artist", "CREEP CREEP");
        String album = call.getString("album", "CREEP CREEP");
        String artworkUrl = call.getString("artworkUrl", "");

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        Intent serviceIntent = new Intent(activity, MusicService.class);
        serviceIntent.setAction(MusicService.ACTION_UPDATE_METADATA);
        serviceIntent.putExtra("title", title);
        serviceIntent.putExtra("artist", artist);
        serviceIntent.putExtra("album", album);
        serviceIntent.putExtra("artworkUrl", artworkUrl);
        activity.startService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void updatePlaybackState(PluginCall call) {
        String state = call.getString("state", "paused");
        MusicService svc = MusicService.instance;
        if (svc != null) {
            if ("playing".equals(state)) {
                svc.updatePlaybackState(android.support.v4.media.session.PlaybackStateCompat.STATE_PLAYING);
            } else {
                svc.updatePlaybackState(android.support.v4.media.session.PlaybackStateCompat.STATE_PAUSED);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void setSleepTimer(PluginCall call) {
        int seconds = call.getInt("seconds", 0);
        MusicService svc = MusicService.instance;
        if (svc != null) {
            svc.setSleepTimer(seconds);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelSleepTimer(PluginCall call) {
        MusicService svc = MusicService.instance;
        if (svc != null) {
            svc.cancelSleepTimer();
        }
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", MusicService.instance != null);
        call.resolve(result);
    }

    public void sendToWebView(String command) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            String js = "javascript:window.dispatchEvent(new CustomEvent('mediaCommand',{detail:{command:'" + command + "'}}))";
            final String finalJs = js;
            getActivity().runOnUiThread(() -> {
                try {
                    getBridge().getWebView().evaluateJavascript(finalJs, null);
                } catch (Exception e) {
                    // noop
                }
            });
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (webCommandReceiver != null) {
            try {
                getContext().unregisterReceiver(webCommandReceiver);
            } catch (Exception e) {
                // noop
            }
        }
        instance = null;
        super.handleOnDestroy();
    }
}
