const admin = require('firebase-admin');
admin.initializeApp();

const { processMedia } = require('./src/processMedia');
const { retentionCleanup } = require('./src/retentionCleanup');

exports.processMedia = processMedia;
exports.retentionCleanup = retentionCleanup;
