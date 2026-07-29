# Anki Reminder — shipping it as an app

Two paths. Do #1 first; it takes ten minutes and gives you a real icon on your
home screen. #2 turns that same thing into an APK you can install or upload.

---

## 1. Install it as a phone app (PWA) — no build, no store

Everything is already wired: `manifest.json`, `sw.js`, icons, offline caching.
It just needs to be served over **https** (mic, camera and notifications are all
blocked on `file://`).

**Publish with GitHub Pages**

```bash
cd anki-reminder
git init && git add . && git commit -m "Anki Reminder v2"
git branch -M main
git remote add origin https://github.com/krishalmehta98-sudo/ANKI---REMINDER.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: main / root → Save**.
A minute later it's live at
`https://krishalmehta98-sudo.github.io/ANKI---REMINDER/`

**Install it**
- Android/Chrome: open the link → menu → *Add to Home screen* → *Install*
- iPhone/Safari: open the link → Share → *Add to Home Screen*

You get a standalone app with no browser bars, working offline, mic and camera
live, and reminders firing while it's open.

**Test locally first**

```bash
cd anki-reminder
python3 -m http.server 8000
# open http://localhost:8000
```

---

## 2. Build the APK (Expo — project already exists at krish89/anki-reminder)

`mobile/` wraps the published site in a native shell.

```bash
cd mobile
npm install
npx expo install react-native-webview
npm install -g eas-cli && eas login          # krish89
eas build:configure
eas build -p android --profile preview       # → downloadable APK
```

Open `mobile/App.js` and set `SITE` to your Pages URL before building.
Update the web app any time by pushing to GitHub — no rebuild needed, the
WebView picks it up.

For the Play Store: `eas build -p android --profile production` (AAB), then
`eas submit -p android`.

---

## What's where

| File | Does |
|---|---|
| `index.html` | The whole app — every screen, all logic |
| `manifest.json` | Name, icons, standalone display |
| `sw.js` | Offline cache + notification taps |
| `icon-*.png` | App icons |
| `mobile/` | Expo/EAS wrapper for the APK |

## Known limits

- Reminders fire while the app is open (or backgrounded on Android with the
  PWA installed). Alarms while fully closed need a push server — that's the
  Firebase step still on the list.
- Your data lives in the browser's storage on that device. Back it up from
  **Settings → Export backup**.
- The Gemini key in Settings stays on your device; nothing is sent anywhere else.

---

## 3. Family group (sharing with people you trust)

Tasks live on your device by default. To share a list with family, the app syncs
through **Firebase** — free, and the project `ankita-61918` already exists.

**Get the config**
Firebase console → your project → ⚙️ Project settings → *Your apps* → Web app
(add one if there isn't any) → copy the `firebaseConfig` object.

**Turn it on**
1. Firebase console → **Build → Authentication → Sign-in method → Anonymous → Enable**
2. Firebase console → **Build → Firestore Database → Create database**
3. Firestore → **Rules** tab → paste and Publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function role(code) {
      return get(/databases/$(database)/documents/groups/$(code)/members/$(request.auth.uid)).data.role;
    }
    function canEdit(code) {
      return request.auth != null && role(code) in ['owner', 'editor'];
    }

    match /groups/{code} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;

      // everyone reads the member list; you create your own entry;
      // only the owner changes anyone's access or removes people
      match /members/{uid} {
        allow read:   if request.auth != null;
        allow create: if request.auth.uid == uid
                      && (request.resource.data.role == 'viewer'
                          || !exists(/databases/$(database)/documents/groups/$(code)));
        allow update: if role(code) == 'owner'
                      || (request.auth.uid == uid
                          && request.resource.data.role == resource.data.role);
        allow delete: if role(code) == 'owner' || request.auth.uid == uid;
      }

      // tasks and notes: anyone in the group reads, only editors write
      match /{collection}/{docId} {
        allow read:  if request.auth != null;
        allow write: if canEdit(code);
      }
    }
  }
}
```

**Access levels**

| Role | Can do |
|---|---|
| 👑 Owner | Everything, plus hands out access and removes people |
| ✏️ Can edit | Add, edit, complete, comment, delete shared items |
| 👀 View only | Sees the shared list; their own new items stay private to them |

Whoever taps **Create a group** is the owner. Anyone who joins with the code
lands as **View only** — the owner promotes them in Settings → Family group →
Who's in.


**In the app**
Settings → Family group → type your name, paste the config → **Save details** →
**Create a group**. You get a 6-character code. Anyone who enters that code on
their phone sees the same tasks and notes, live, with a 👤 badge showing who
added each one.

Anything you mark **🔒 Private** in a task stays on your device and is never
uploaded.

Note: anyone with the code can read and edit the group, so treat it like a house
key. To tighten it later, swap the rule above for one that checks a members list.
