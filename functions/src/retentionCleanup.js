// functions/src/retentionCleanup.js
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

exports.retentionCleanup = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Manila',
    region: 'asia-southeast1',
  },
  async () => {
    const db = admin.database();
    const bucket = admin.storage().bucket();
    const now = Date.now();

    const MS_90_DAYS = 90 * 24 * 60 * 60 * 1000;
    const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

    let crowdReportsDeleted = 0;
    let mediaUploadsDeleted = 0;
    let socialIntakeDeleted = 0;

    // 1. Clean up /crowd_reports — entries older than 90 days
    const crowdSnap = await db.ref('/crowd_reports').once('value');
    const crowdVal = crowdSnap.val();
    if (crowdVal) {
      const crowdDeletions = [];
      for (const [key, entry] of Object.entries(crowdVal)) {
        const submittedAt = new Date(entry.submittedAt).getTime();
        if (now - submittedAt > MS_90_DAYS) {
          crowdDeletions.push(db.ref(`/crowd_reports/${key}`).remove());
          crowdReportsDeleted++;
        }
      }
      await Promise.all(crowdDeletions);
    }

    // 2. Clean up /media_uploads — entries older than 90 days
    //    Also delete the corresponding Storage folder: uploads/{reportId}/
    const mediaSnap = await db.ref('/media_uploads').once('value');
    const mediaVal = mediaSnap.val();
    if (mediaVal) {
      const mediaDeletions = [];
      for (const [key, entry] of Object.entries(mediaVal)) {
        const submittedAt = new Date(entry.submittedAt).getTime();
        if (now - submittedAt > MS_90_DAYS) {
          mediaDeletions.push(
            db.ref(`/media_uploads/${key}`).remove().then(() =>
              bucket.deleteFiles({ prefix: `uploads/${key}/` })
            )
          );
          mediaUploadsDeleted++;
        }
      }
      await Promise.all(mediaDeletions);
    }

    // 3. Clean up /social_intake
    //    - rejected entries older than 30 days
    //    - accepted/approved entries older than 90 days
    const socialSnap = await db.ref('/social_intake').once('value');
    const socialVal = socialSnap.val();
    if (socialVal) {
      const socialDeletions = [];
      for (const [key, entry] of Object.entries(socialVal)) {
        const fetchedAt = new Date(entry.fetchedAt).getTime();
        const status = entry.status;
        const age = now - fetchedAt;

        const isRejected = status === 'rejected';
        const isAccepted = status === 'accepted' || status === 'approved';

        if ((isRejected && age > MS_30_DAYS) || (isAccepted && age > MS_90_DAYS)) {
          socialDeletions.push(db.ref(`/social_intake/${key}`).remove());
          socialIntakeDeleted++;
        }
      }
      await Promise.all(socialDeletions);
    }

    logger.info('Retention cleanup done', {
      crowdReportsDeleted,
      mediaUploadsDeleted,
      socialIntakeDeleted,
    });
  }
);
