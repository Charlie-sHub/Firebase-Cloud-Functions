import * as functions from "firebase-functions";

//  Start writing Firebase Functions
//  https:firebase.google.com/docs/functions/typescript

export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

import firestore = require("@google-cloud/firestore");
const client = new firestore.v1.FirestoreAdminClient();

const bucket = "gs://world-on-backup-bucket";

exports.scheduledFirestoreExport = functions.pubsub
    .schedule("every 24 hours")
    .onRun(() => {
      const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const databaseName = client.databasePath(projectId!, "(default)");

      return client.exportDocuments({
        name: databaseName,
        outputUriPrefix: bucket,
        // Leave collectionIds empty to export all collections
        // or set to a list of collection IDs to export,
        // collectionIds: ['users', 'posts']
        collectionIds: [],
      })
          .then((responses) => {
            const response = responses[0];
            console.log(`Operation Name: ${response["name"]}`);
            return;
          })
          .catch((err) => {
            console.error(err);
            throw new Error("Export operation failed");
          });
    });
