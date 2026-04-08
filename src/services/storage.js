import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

export const uploadMedia = (reportId, file, onProgress) => {
  const isVideo = file.type.startsWith('video/');
  const ext = isVideo
    ? (file.name.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4')
    : 'jpg';
  const storagePath = `uploads/${reportId}/original.${ext}`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes),
      reject,
      async () => {
        const downloadURL = await getDownloadURL(task.snapshot.ref);
        resolve({ storagePath, downloadURL, isVideo });
      }
    );
  });
};
