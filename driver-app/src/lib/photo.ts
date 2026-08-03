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

async function picker() {
  return await import('expo-image-picker');
}

/** Ask for the camera, falling back to the library if the camera is unavailable or refused. */
export async function capturePhoto(useCamera: boolean): Promise<PickedPhoto | null> {
  const ImagePicker = await picker();

  if (useCamera && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      // Compressed on the device: an unmodified phone photo is several megabytes, which is slow
      // to upload on a Ghanaian mobile connection and far more detail than a reviewer needs.
      quality: 0.6,
      allowsEditing: false,
    });
    if (shot.canceled || !shot.assets?.length) return null;
    const a = shot.assets[0];
    return { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 };
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.6,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width ?? 0, height: a.height ?? 0 };
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

/** Pick and upload in one step. Returns null if the driver backed out. */
export async function captureAndUpload(useCamera: boolean): Promise<string | null> {
  const photo = await capturePhoto(useCamera);
  if (!photo) return null;
  return await uploadPhoto(photo);
}
