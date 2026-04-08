import { useCallback, useEffect } from 'react';
import { get, set, del } from 'idb-keyval';
import { ref, update } from 'firebase/database';
import { uploadMedia } from '../services/storage';
import { database } from '../services/firebase';

const QUEUE_KEY = 'sanbaha_upload_queue';
const MAX_RETRIES = 5;

export const useUploadQueue = () => {
  const enqueue = useCallback(async (reportId, file) => {
    const existing = (await get(QUEUE_KEY)) || [];
    const next = [
      ...existing.filter((i) => i.reportId !== reportId),
      { reportId, file, fileName: file.name, fileType: file.type, retryCount: 0, lastAttempt: null },
    ];
    await set(QUEUE_KEY, next);
  }, []);

  const processQueue = useCallback(async () => {
    const queue = (await get(QUEUE_KEY)) || [];
    if (queue.length === 0) return;

    for (const item of queue) {
      if (item.retryCount >= MAX_RETRIES) continue;
      try {
        const file = item.file instanceof File
          ? item.file
          : new File([item.file], item.fileName, { type: item.fileType });

        const { storagePath, downloadURL, isVideo } = await uploadMedia(item.reportId, file);

        await update(ref(database, `media_uploads/${item.reportId}`), {
          originalPath: storagePath,
          downloadURL,
          isVideo,
          uploadedAt: new Date().toISOString(),
          processingStatus: 'pending',
        });

        await del(item.reportId);

        const refreshed = (await get(QUEUE_KEY)) || [];
        await set(QUEUE_KEY, refreshed.filter((i) => i.reportId !== item.reportId));
      } catch {
        const refreshed = (await get(QUEUE_KEY)) || [];
        await set(
          QUEUE_KEY,
          refreshed.map((i) =>
            i.reportId === item.reportId
              ? { ...i, retryCount: i.retryCount + 1, lastAttempt: new Date().toISOString() }
              : i
          )
        );
      }
    }
  }, []);

  useEffect(() => {
    processQueue();
    window.addEventListener('online', processQueue);
    return () => window.removeEventListener('online', processQueue);
  }, [processQueue]);

  return { enqueue, processQueue };
};
