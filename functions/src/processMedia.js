// functions/src/processMedia.js
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const admin = require('firebase-admin');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const os = require('os');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

const THUMB_WIDTH = 400;

exports.processMedia = onObjectFinalized(
  { region: 'asia-southeast1', memory: '512MiB' },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    // Only process originals under uploads/
    if (!filePath.startsWith('uploads/') || !filePath.includes('/original.')) return;

    const bucket = admin.storage().bucket(event.data.bucket);
    const reportId = filePath.split('/')[1];
    const db = admin.database();

    if (contentType.startsWith('image/')) {
      await processImage(bucket, filePath, reportId, db);
    } else if (contentType.startsWith('video/')) {
      await processVideo(bucket, filePath, reportId, db);
    }
  }
);

async function processImage(bucket, filePath, reportId, db) {
  const tmpInput = path.join(os.tmpdir(), `original-${reportId}.jpg`);
  const tmpThumb = path.join(os.tmpdir(), `thumb-${reportId}.jpg`);

  await bucket.file(filePath).download({ destination: tmpInput });

  await sharp(tmpInput)
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(tmpThumb);

  const thumbDest = `uploads/${reportId}/thumb_400.jpg`;
  await bucket.upload(tmpThumb, {
    destination: thumbDest,
    metadata: { contentType: 'image/jpeg' },
  });

  await db.ref(`media_uploads/${reportId}`).update({
    thumbPath: thumbDest,
    processingStatus: 'complete',
  });

  fs.unlinkSync(tmpInput);
  fs.unlinkSync(tmpThumb);
}

async function processVideo(bucket, filePath, reportId, db) {
  const tmpInput = path.join(os.tmpdir(), `video-${reportId}.mp4`);
  const tmpFrame = path.join(os.tmpdir(), `frame-${reportId}.jpg`);

  await bucket.file(filePath).download({ destination: tmpInput });

  await new Promise((resolve, reject) => {
    ffmpeg(tmpInput)
      .screenshots({ count: 1, filename: path.basename(tmpFrame), folder: os.tmpdir() })
      .on('end', resolve)
      .on('error', reject);
  });

  const frameDest = `uploads/${reportId}/thumb_video.jpg`;
  await bucket.upload(tmpFrame, {
    destination: frameDest,
    metadata: { contentType: 'image/jpeg' },
  });

  await db.ref(`media_uploads/${reportId}`).update({
    thumbPath: frameDest,
    processingStatus: 'complete',
  });

  if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
  if (fs.existsSync(tmpFrame)) fs.unlinkSync(tmpFrame);
}
