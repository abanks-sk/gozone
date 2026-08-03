import { Platform } from 'react-native';
import api from '../api/client';

/**
 * Take or choose a photo and upload it, returning the path the server will serve it back from.
 *
 * KYC documents used to be a placeholder string the app set on tap — nothing was ever captured or
 * sent, so an admin "reviewing" a driver was looking at a URL that pointed nowhere. This is the
 * real thing.
 *
 * `expo-image-picker` is loaded lazily. A top-level import of an Expo native module has crashed
 * startup in Expo Go before (see `src/lib/push.ts` and expo-location), and a driver who never
 * opens the KYC screen should not pay for it — or be broken by it.
 */

export type PickedPhoto = { uri: string; width: number; height: number };

/**
 * Why no photo came back. "Take photo" was reported as opening a picker instead of the camera, and
 * a bare `null` made that impossible to tell apart from a refused permission or a cancelled shot —
 * all three did nothing and said nothing. The caller can now explain itself.
 */
export type CaptureResult =
  | { ok: true; photo: PickedPhoto }
  | { ok: false; reason: 'cancelled' | 'camera-denied' | 'library-denied' | 'no-camera' };

async function picker() {
  return await import('expo-image-picker');
}

/**
 * Take a photo, or choose one — whichever was asked for, and never the other.
 *
 * Asking for the camera used to fall through to the library whenever the camera was unavailable,
 * which on web means every time: "Take photo" opened a file-selection dialog. Silently doing the
 * other thing is worse than saying you cannot do this one, because the driver has no idea their
 * device just made a decision for them.
 */
export async function capturePhoto(useCamera: boolean): Promise<CaptureResult> {
  const ImagePicker = await picker();

  if (useCamera) {
    // No camera capture in a browser — say so rather than quietly offering the file picker.
    if (Platform.OS === 'web') return { ok: false, reason: 'no-camera' };

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'camera-denied' };
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // Compressed on the device: an unmodified phone photo is several megabytes, which is slow
      // to upload on a Ghanaian mobile connection and far more detail than a reviewer needs.
      quality: 0.6,
      allowsEditing: false,
    });
    if (shot.canceled || !shot.assets?.length) return { ok: false, reason: 'cancelled' };
    const a = shot.assets[0];
    return { ok: true, photo: { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 } };
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'library-denied' };
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.length) return { ok: false, reason: 'cancelled' };
  const a = res.assets[0];
  return { ok: true, photo: { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 } };
}

/** A sentence for the driver explaining why nothing was captured — null when they simply backed out. */
export function captureFailureMessage(reason: Exclude<CaptureResult, { ok: true }>['reason']): string | null {
  switch (reason) {
    case 'cancelled': return null;
    case 'camera-denied': return 'GoZone needs permission to use the camera. Turn it on in Settings, or use Choose to pick a photo instead.';
    case 'library-denied': return 'GoZone needs permission to see your photos. Turn it on in Settings, or use Take photo instead.';
    case 'no-camera': return 'The camera is only available in the app on your phone. Use Choose to select a photo here.';
  }
}

/**
 * Upload a picked photo. Returns the server path (`/auth/uploads/{id}`).
 *
 * Native and web disagree about what a file is: React Native accepts the `{ uri, name, type }`
 * shape in FormData, while a browser needs a real Blob — passing the RN shape there uploads the
 * string "[object Object]". Hence the split.
 */
export async function uploadPhoto(photo: PickedPhoto): Promise<string> {
  const form = new FormData();
  const name = `doc-${Date.now()}.jpg`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(photo.uri)).blob();
    form.append('file', blob, name);
  } else {
    form.append('file', { uri: photo.uri, name, type: 'image/jpeg' } as any);
  }

  // Content-Type is left unset on purpose: the runtime fills in multipart/form-data *with the
  // boundary*, and setting it by hand drops the boundary and the server cannot parse the body.
  const { data } = await api.post<{ id: string; url: string }>('/auth/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    transformRequest: (d) => d,
  });
  return data.url;
}

/** Pick and upload in one step. Returns null if nothing was captured. */
export async function captureAndUpload(useCamera: boolean): Promise<string | null> {
  const res = await capturePhoto(useCamera);
  if (!res.ok) return null;
  return await uploadPhoto(res.photo);
}
