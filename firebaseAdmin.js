const admin = require("firebase-admin");

// Verifying ID tokens only needs the project ID (Google's public keys are fetched automatically),
// so no service-account key is required for this.
if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}

module.exports = admin;
