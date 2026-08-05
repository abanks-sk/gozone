# Building the three APKs

`customer-app`, `driver-app` and `vendor-app` are separate Expo apps. Each is built on its own —
three logins' worth of nothing, three builds, three APKs.

---

## Once, before the first build

You need a free Expo account: <https://expo.dev/signup>. Then, from any of the app folders:

```bash
npx eas-cli login
```

That login is shared across all three — do it once.

---

## Build one app

From inside the app folder (e.g. `customer-app`):

```bash
npx eas-cli build --platform android --profile preview
```

The first run asks to create an EAS project — say yes. It then asks about an Android keystore;
let EAS generate one. The build runs on Expo's servers (~10–20 min) and ends with a URL to
download the `.apk`.

Repeat in `driver-app` and `vendor-app`.

### Why `--profile preview` and not `production`

`production` produces an **`.aab`** — a Play Store upload bundle that a phone cannot install. The
`preview` profile in `eas.json` sets `"buildType": "apk"`, which is the file you can download and
sideload. Using the wrong profile is the single most common way to wait twenty minutes for an
unusable artefact.

---

## Why `eas.json` carries the Google client ID

EAS builds in the cloud from an upload that **respects `.gitignore`** — and `.env` is gitignored,
correctly, because it holds secrets. So `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` from `.env` never
reaches the build machine, and the Google button would come out saying "not configured" with
nothing to explain why.

It lives in `eas.json` under `build.<profile>.env` instead. That file is committed, which is fine
here specifically: an OAuth **client ID is public by design** — it identifies the app and
authorises nothing. The client *secret* is the sensitive half, and this flow never uses one. Do
not add any other secret to this file.

---

## After installing: point the app at a backend

A standalone build has no Expo dev server to infer the address from, so it does not know where
GoZone is until you tell it.

On the welcome screen tap **Server address**, then enter:

- **Local Docker:** `http://<your-computer-IP>:8080` — find it with `ipconfig` (the IPv4 address
  on your active adapter). The phone and computer must be on the same network.
- **Hosted:** the Railway gateway URL.

It saves, tests the connection, and remembers it. Changing backend later is this screen again —
**not** a rebuild.

---

## Rebuilding

You only need a new build when native configuration changes — a new native dependency, an
`app.json` change, or new `EXPO_PUBLIC_*` values. JavaScript-only changes do not need one for
development purposes; and changing the backend address certainly does not.
