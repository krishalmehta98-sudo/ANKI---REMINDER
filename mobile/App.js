import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  AppState,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  AndroidNotificationSetting,
  EventType,
  TriggerType,
} from '@notifee/react-native';

const SITE = 'https://krishalmehta98-sudo.github.io/ANKI---REMINDER/';
const CHANNEL_ID = 'anki-alarms-v1';
const HORIZON_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SCHEDULED = 60;

/* ------------------------------------------------------------------ */
/* notification plumbing                                               */
/* ------------------------------------------------------------------ */

async function ensureChannel() {
  return notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Reminders & alarms',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 600, 300, 600],
    bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
}

function safeId(raw, ts) {
  const cleaned = String(raw == null ? '' : raw).replace(/[^a-zA-Z0-9_-]/g, '');
  return (cleaned || 'r').slice(0, 48) + '_' + ts;
}

async function scheduleOne(item) {
  if (!item || !item.ts) return;
  if (item.ts <= Date.now() + 3000) return;

  const channelId = await ensureChannel();

  await notifee.createTriggerNotification(
    {
      id: item.id,
      title: item.title || 'Reminder',
      body: item.body || 'Tap to open Anki Reminder',
      data: { taskId: item.taskId == null ? '' : String(item.taskId) },
      android: {
        channelId,
        category: AndroidCategory.ALARM,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: 'ic_launcher',
        // sticky heads-up: will not swipe away, like a WhatsApp call
        ongoing: true,
        autoCancel: false,
        // wakes the screen and takes over when locked
        fullScreenAction: { id: 'default', launchActivity: 'default' },
        pressAction: { id: 'default', launchActivity: 'default' },
        loopSound: true,
        lightUpScreen: true,
        timeoutAfter: 5 * 60 * 1000,
        actions: [
          { title: 'Done', pressAction: { id: 'done' } },
          { title: 'Snooze 10m', pressAction: { id: 'snooze' } },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: item.ts,
      alarmManager: { allowWhileIdle: true },
    }
  );
}

async function snoozeFrom(notification, minutes) {
  const mins = minutes || 10;
  await scheduleOne({
    id: 'snz_' + Date.now(),
    title: (notification && notification.title) || 'Reminder',
    body: (notification && notification.body) || '',
    ts: Date.now() + mins * 60 * 1000,
  });
}

/* Must live at module scope so Android can run it with the app killed. */
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const notification = detail && detail.notification;
  const pressAction = detail && detail.pressAction;

  if (type === EventType.ACTION_PRESS && pressAction && pressAction.id === 'snooze') {
    await snoozeFrom(notification, 10);
  }
  if (
    (type === EventType.ACTION_PRESS || type === EventType.DISMISSED) &&
    notification &&
    notification.id
  ) {
    await notifee.cancelNotification(notification.id);
  }
});

/* ------------------------------------------------------------------ */
/* payload normalisation                                               */
/* ------------------------------------------------------------------ */

const TIME_FIELDS = [
  'ts', 'timestamp', 'fireAt', 'triggerAt', 'at', 'when', 'time',
  'due', 'dueAt', 'dueDate', 'remindAt', 'reminderAt', 'datetime', 'dateTime',
  'scheduledFor', 'next', 'start', 'startAt',
];
const TITLE_FIELDS = ['title', 'text', 'name', 'task', 'label', 'todo', 'item', 'medicine'];
const BODY_FIELDS = ['body', 'notes', 'note', 'desc', 'description', 'subtitle', 'message'];

export function toTs(value, dateHint) {
  if (value == null) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') {
    if (value > 1e12) return value;
    if (value > 1e9) return value * 1000;
    return 0;
  }
  if (typeof value !== 'string') return 0;
  const s = value.trim();
  if (!s) return 0;
  if (/^\d{13}$/.test(s)) return parseInt(s, 10);
  if (/^\d{10}$/.test(s)) return parseInt(s, 10) * 1000;
  if (/^\d{1,2}:\d{2}/.test(s) && dateHint) {
    const parts = s.split(':');
    const hh = ('0' + parseInt(parts[0], 10)).slice(-2);
    const mm = ('0' + parseInt(parts[1], 10)).slice(-2);
    const d = new Date(dateHint + 'T' + hh + ':' + mm + ':00');
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? 0 : d2.getTime();
}

function pick(obj, fields) {
  for (let i = 0; i < fields.length; i++) {
    const v = obj[fields[i]];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function itemFrom(node) {
  if (!node || typeof node !== 'object') return null;
  const done =
    node.done === true ||
    node.completed === true ||
    node.checked === true ||
    node.archived === true ||
    node.skipped === true ||
    node.status === 'done' ||
    node.status === 'completed';
  if (done) return null;

  const hint =
    typeof node.date === 'string' && node.date.length >= 10 ? node.date.slice(0, 10) : null;

  let ts = 0;
  for (let i = 0; i < TIME_FIELDS.length; i++) {
    const key = TIME_FIELDS[i];
    if (node[key] != null) {
      ts = toTs(node[key], hint);
      if (ts) break;
    }
  }
  if (!ts && hint && node.time) ts = toTs(node.time, hint);
  if (!ts) return null;

  const title = pick(node, TITLE_FIELDS);
  if (!title) return null;

  const rawId = node.key != null ? node.key : (node.id != null ? node.id : title);
  return {
    id: safeId(rawId, ts),
    title: title.slice(0, 90),
    body: pick(node, BODY_FIELDS).slice(0, 140),
    ts: ts,
    taskId: node.taskId != null ? node.taskId : null,
  };
}

/** Walks any shape and pulls out everything that looks like a scheduled item. */
function harvest(node, out, depth) {
  if (!node || depth > 6 || out.length > 400) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) harvest(node[i], out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  const direct = itemFrom(node);
  if (direct) out.push(direct);

  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const v = node[keys[i]];
    if (v && typeof v === 'object') harvest(v, out, depth + 1);
  }
}

export function normalise(payload) {
  const out = [];
  harvest(payload, out, 0);

  const now = Date.now();
  const horizon = now + HORIZON_MS;
  const seen = {};
  const res = [];

  out.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (t.ts > now + 5000 && t.ts < horizon && !seen[t.id]) {
      seen[t.id] = 1;
      res.push(t);
    }
  }
  return res.slice(0, MAX_SCHEDULED);
}

/* ------------------------------------------------------------------ */
/* fallback: read state straight out of localStorage                   */
/* ------------------------------------------------------------------ */

/* Ask the page to re-send its schedule. It exposes window.__ankiNative and
   answers {type:'resend'} by pushing a fresh {type:'schedule'} payload. */
const REQUEST_SCHEDULE_JS = `
(function(){
  try {
    if (window.__ankiNative) window.__ankiNative(JSON.stringify({ type: 'resend' }));
  } catch (e) {}
})();
true;
`;

/* Safety net only: if the page never posts a schedule (old cached build,
   bridge broken), read the saved state directly after 20s. */
const FALLBACK_JS = `
(function(){
  if (window.__ankiFallback) return; window.__ankiFallback = 1;
  function send(){
    try {
      if (window.__ankiBridgeAlive) return;
      var raw = localStorage.getItem('anki-reminder-v2');
      if (!raw) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({ __ankiFallback: 1, state: JSON.parse(raw) }));
    } catch (e) {}
  }
  setTimeout(send, 20000);
  setInterval(send, 120000);
})();
true;
`;

/* ------------------------------------------------------------------ */
/* app                                                                 */
/* ------------------------------------------------------------------ */

export default function App() {
  const ref = useRef(null);
  const canBackRef = useRef(false);
  const bridgeAlive = useRef(false);
  const [canBack, setCanBack] = useState(false);
  const [alarm, setAlarm] = useState(null);

  canBackRef.current = canBack;

  /* back button — registered once, cleaned up properly */
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBackRef.current && ref.current) {
        ref.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  /* permissions + notification events */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await notifee.requestPermission();
        await ensureChannel();
        const settings = await notifee.getNotificationSettings();
        if (
          settings &&
          settings.android &&
          settings.android.alarm !== AndroidNotificationSetting.ENABLED
        ) {
          await notifee.openAlarmPermissionSettings();
        }
        const initial = await notifee.getInitialNotification();
        if (!cancelled && initial && initial.notification) setAlarm(initial.notification);
      } catch (e) {}
    })();

    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      const n = detail && detail.notification;
      if (!n) return;
      if (type === EventType.DELIVERED && n.android && n.android.fullScreenAction) setAlarm(n);
      if (type === EventType.PRESS) setAlarm(n);
      if (type === EventType.ACTION_PRESS && detail.pressAction) {
        if (detail.pressAction.id === 'snooze') snoozeFrom(n, 10);
        if (n.id) notifee.cancelNotification(n.id);
        setAlarm(null);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  /* re-ask the page for its schedule whenever we come back to the foreground */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && ref.current) {
        ref.current.injectJavaScript(REQUEST_SCHEDULE_JS);
        ref.current.injectJavaScript('window.__ankiFallback=0;' + FALLBACK_JS);
      }
    });
    return () => sub.remove();
  }, []);

  const sync = useCallback(async (list) => {
    const wanted = {};
    list.forEach((t) => {
      wanted[t.id] = 1;
    });
    try {
      const existing = await notifee.getTriggerNotificationIds();
      for (const id of existing) {
        if (!wanted[id] && id.indexOf('snz_') !== 0) {
          await notifee.cancelTriggerNotification(id);
        }
      }
      for (const t of list) await scheduleOne(t);
    } catch (e) {}
  }, []);

  const onMessage = useCallback(
    (event) => {
      let payload;
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch (e) {
        return;
      }

      // The page's own bridge. Once we've heard it, ignore the safety net.
      if (payload && payload.type === 'schedule') {
        bridgeAlive.current = true;
        if (ref.current) ref.current.injectJavaScript('window.__ankiBridgeAlive=1;true;');
        sync(normalise(payload.items || []));
        return;
      }

      if (payload && payload.__ankiFallback) {
        if (bridgeAlive.current) return;
        sync(normalise(payload.state));
        return;
      }

      const list = normalise(payload);
      if (list.length) sync(list);
    },
    [sync]
  );

  const openTaskInPage = useCallback((taskId) => {
    if (!ref.current || taskId == null || taskId === '') return;
    const msg = JSON.stringify({ type: 'open-task', taskId: taskId });
    ref.current.injectJavaScript(
      'try{window.__ankiNative(' + JSON.stringify(msg) + ')}catch(e){};true;'
    );
  }, []);

  const clearAlarm = useCallback(
    async (doSnooze) => {
      const current = alarm;
      setAlarm(null);
      try {
        if (doSnooze) {
          await snoozeFrom(current, 10);
        } else {
          const tid = current && current.data ? current.data.taskId : null;
          openTaskInPage(tid);
        }
        if (current && current.id) await notifee.cancelNotification(current.id);
      } catch (e) {}
    },
    [alarm, openTaskInPage]
  );

  return (
    <SafeAreaView style={styles.wrap}>
      <StatusBar style="light" />
      <WebView
        ref={ref}
        source={{ uri: SITE }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onNavigationStateChange={(s) => setCanBack(s.canGoBack)}
        onMessage={onMessage}
        injectedJavaScript={FALLBACK_JS}
        onLoadEnd={() => {
          if (ref.current) {
            ref.current.injectJavaScript(REQUEST_SCHEDULE_JS);
            ref.current.injectJavaScript('window.__ankiFallback=0;' + FALLBACK_JS);
          }
        }}
        style={styles.web}
      />

      {alarm ? (
        <View style={styles.overlay}>
          <Text style={styles.kicker}>REMINDER</Text>
          <Text style={styles.title}>{alarm.title || 'Time for your task'}</Text>
          {alarm.body ? <Text style={styles.body}>{alarm.body}</Text> : null}
          <Pressable style={[styles.btn, styles.primary]} onPress={() => clearAlarm(false)}>
            <Text style={styles.btnText}>Done</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.ghost]} onPress={() => clearAlarm(true)}>
            <Text style={styles.ghostText}>Snooze 10 min</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0F0F0F' },
  web: { flex: 1, backgroundColor: '#0F0F0F' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  kicker: { color: '#4FC3DC', fontSize: 13, letterSpacing: 3, marginBottom: 18 },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: { color: '#9A9A9A', fontSize: 16, textAlign: 'center', marginBottom: 28 },
  btn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 14,
  },
  primary: { backgroundColor: '#4FC3DC' },
  ghost: { backgroundColor: '#242424' },
  btnText: { color: '#0F0F0F', fontSize: 17, fontWeight: '700' },
  ghostText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
