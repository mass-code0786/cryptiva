# Android APK Build

This project uses Capacitor to package the existing Vite React frontend into an Android APK.

## Why this method

- Reuses the current web frontend in `frontend/`
- Works with the existing hosted backend API
- Avoids a rewrite to React Native or Flutter

## Files involved

- `frontend/package.json`
- `frontend/capacitor.config.ts`
- `frontend/src/config/appConfig.ts`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/.env.example`
- `backend/src/server.js`

## One-time setup

From the repo root:

```bash
cd frontend
npm install
npm run android:add
```

## Build the web app and sync Android

```bash
cd frontend
npm run android:build
```

This builds the Vite app into `frontend/dist` and copies it into the Capacitor Android project.

## Open Android Studio

```bash
cd frontend
npm run android:open
```

Then in Android Studio:

1. Wait for Gradle sync to finish.
2. Use `Build > Build Bundle(s) / APK(s) > Build APK(s)`.

## APK output location

The generated debug APK is typically written to:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

For release builds, create a signed release APK from Android Studio or Gradle.

## Gradle CLI build

After `npm run android:add` has created `frontend/android`:

```bash
cd frontend
npm run android:build
cd android
./gradlew assembleDebug
```

On Windows PowerShell:

```powershell
cd frontend
npm run android:build
cd android
.\gradlew.bat assembleDebug
```

## Hosting the APK

Recommended hosted path on the frontend static site:

```text
/downloads/cryptiva-android-latest.apk
```

That maps to:

```text
frontend/public/downloads/cryptiva-android-latest.apk
```

After placing the APK there and redeploying the frontend, the dashboard button can download it directly.

If you host the APK elsewhere, set:

```text
VITE_APK_DOWNLOAD_URL=https://your-domain.example/downloads/cryptiva-android-latest.apk
```

## Backend note

Capacitor Android WebView requests may come from `http://localhost`, `https://localhost`, `capacitor://localhost`, or `ionic://localhost`.
The backend CORS config has been updated to allow these origins.
