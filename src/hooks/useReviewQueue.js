import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../services/firebase';

export const useReviewQueue = () => {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const uploadsRef = ref(database, 'media_uploads');
    const unsubscribe = onValue(uploadsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setPendingCount(0); return; }
      const count = Object.values(data).filter(
        (item) => item.processingStatus === 'complete' && !item.mediaVerified
      ).length;
      setPendingCount(count);
    });
    return unsubscribe;
  }, []);

  return pendingCount;
};
