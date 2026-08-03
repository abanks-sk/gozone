import { Platform } from 'react-native';
import api from '../api/client';

/**
 * Take or choose a photo and publish it, returning the path the server serves it back from.
 *
 * The storefront used to ask for a "cover photo link" — a text box wanting a URL from somebody
 * holding a phone with a photo on it. This uploads the photo instead.
 *
 * Published **publicly** (`?visibility=public`), unlike the driver app's copy, which uploads
 * identity documents readable only by their owner and an admin. Shop imagery is the opposite: a
 * customer browsing GoShop has to see it, and on the web an `<Image>` cannot attach a token.
 *
 * `expo-image-picker` is loaded lazily. A top-level import of an Expo native module has crashed
 * startup in Expo Go before, and a vendor who never edits their storefront should not pay for it.
 */

export type PickedPhoto = { uri: string; width: number; height: number };

export type CaptureResult =
  | { ok: true; photo: PickedPhoto }
  | { ok: false; reason: 'cancelled' | 'camera-denied' | 'library-denied' | 'no-camera' };

async function picker() {
  return await import('expo-image-picker');
}

/** Take a photo, or choose one — whichever was asked for, and never the other. */
export async function capturePhoto(useCamera: boolean): Promise<CaptureResult> {
  const ImagePicker = await picker();

  if (useCamera) {
    // No camera capture in a browser — say so rather than quietly opening the file picker.
    if (Platform.OS === 'web') return { ok: false, reason: 'no-camera' };
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: 'camera-denied' };
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // Compressed on the device: an unmodified phone photo is several megabytes, which is slow to
      // upload on a Ghanaian mobile connection and far more than a shop card needs.
      quality: 0.6,
      allowsEditing: true,
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
    allowsEditing: true,
  });
  if (res.canceled || !res.assets?.length) return { ok: false, reason: 'cancelled' };
  const a = res.assets[0];
  return { ok: true, photo: { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 } };
}

/** A sentence for the vendor explaining why nothing was captured — null when they backed out. */
export function captureFailureMessage(reason: Exclude<CaptureResult, { ok: true }>['reason']): string | null {
  switch (reason) {
    case 'cancelled': return null;
    case 'camera-denied': return 'GoZone needs permission to use the camera. Turn it on in Settings, or choose a photo from your gallery instead.';
    case 'library-denied': return 'GoZone needs permission to see your photos. Turn it on in Settings, or take a photo instead.';
    case 'no-camera': return 'The camera is only available in the app on your phone. Choose a photo from your files here.';
  }
}

/**
 * Publish a picked photo. Returns the server path (`/auth/uploads/{id}`).
 *
 * Native and web disagree about what a file is: React Native accepts the `{ uri, name, type }`
 * shape in FormData, while a browser needs a real Blob — passing the RN shape there uploads the
 * string "[object Object]". Hence the split.
 */
export async function uploadPhoto(photo: PickedPhoto): Promise<string> {
  const form = new FormData();
  const name = `shop-${Date.now()}.jpg`;

  if (Platform.OS === 'web') {
    const blob = await (await fetch(photo.uri)).blob();
    form.append('file', blob, name);
  } else {
    form.append('file', { uri: photo.uri, name, type: 'image/jpeg' } as any);
  }

  // Content-Type is left unset on purpose: the runtime fills in multipart/form-data *with the
  // boundary*, and setting it by hand drops the boundary and the server cannot parse the body.
  const { data } = await api.post<{ id: string; url: string }>('/auth/uploads?visibility=public', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    transformRequest: (d) => d,
  });
  return data.url;
}

/** Pick and publish in one step. Returns null if nothing was captured. */
export async function captureAndUpload(useCamera: boolean): Promise<string | null> {
  const res = await capturePhoto(useCamera);
  if (!res.ok) return null;
  return await uploadPhoto(res.photo);
}
