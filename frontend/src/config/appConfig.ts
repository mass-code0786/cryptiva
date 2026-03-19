const FALLBACK_APK_URL = "/downloads/cryptiva-android-latest.apk";

export const apkDownloadUrl =
  import.meta.env.VITE_APK_DOWNLOAD_URL?.trim() || FALLBACK_APK_URL;

export const apkHostingPath = FALLBACK_APK_URL;
