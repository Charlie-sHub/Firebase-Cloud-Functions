/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as algoliaSearch from "algoliasearch";
import firestore = require("@google-cloud/firestore");


admin.initializeApp();
const firestoreDatabase = admin.firestore();

// Backup function
const fireClient = new firestore.v1.FirestoreAdminClient();

const bucket = "gs://world-on-backup-bucket";

exports.scheduledFirestoreExport = functions.pubsub
    .schedule("every 24 hours")
    .onRun(() => {
      const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const databaseName = fireClient.databasePath(projectId!, "(default)");

      return fireClient.exportDocuments({
        name: databaseName,
        outputUriPrefix: bucket,
        collectionIds: [],
      })
          .then((responses) => {
            const response = responses[0];
            console.log(`Operation Name: ${response["name"]}`);
            return;
          })
          .catch((error) => {
            console.error(error);
            throw new Error("Export operation failed");
          });
    });

// Algolia functions
const APP_ID = functions.config().algolia.app;
const ADMIN_KEY = functions.config().algolia.key;

const algoliaClient =algoliaSearch.default(APP_ID, ADMIN_KEY);
const experienceIndex = algoliaClient.initIndex("prod_experience");
const userIndex = algoliaClient.initIndex("prod_user");
const tagIndex = algoliaClient.initIndex("prod_tag");

export const sendExperienceCollectionToAlgolia = functions.https
    .onRequest(async (req, res) => {
      const algoliaRecords : any[] = [];
      const querySnapshot = await firestoreDatabase.collection("experiences").get();

      querySnapshot.docs.forEach((doc) => {
        const document = doc.data();
        const id = doc.id;
        const record = experienceRecord(id, document);
        record.objectID = id,
        algoliaRecords.push(record);
      });

      experienceIndex.saveObjects(algoliaRecords, (_error: any, content: any) => {
        res.status(200).send("experiences was indexed to Algolia successfully.");
      });
    });

export const sendUserCollectionToAlgolia = functions.https
    .onRequest(async (req, res) => {
      const algoliaRecords : any[] = [];
      const querySnapshot = await firestoreDatabase.collection("users").get();

      querySnapshot.docs.forEach((doc) => {
        const document = doc.data();
        const id = doc.id;
        const record = userRecord(id, document);
        record.objectID = id,
        algoliaRecords.push(record);
      });

      userIndex.saveObjects(algoliaRecords, (_error: any, content: any) => {
        res.status(200).send("users was indexed to Algolia successfully.");
      });
    });

export const sendTagCollectionToAlgolia = functions.https
    .onRequest(async (req, res) => {
      const algoliaRecords : any[] = [];
      const querySnapshot = await firestoreDatabase.collection("tags").get();

      querySnapshot.docs.forEach((doc) => {
        const document = doc.data();
        const id = doc.id;
        const record = tagRecord(id, document);
        record.objectID = id,
        algoliaRecords.push(record);
      });

      tagIndex.saveObjects(algoliaRecords, (_error: any, content: any) => {
        res.status(200).send("tags was indexed to Algolia successfully.");
      });
    });

export const addExperienceToIndex = functions.firestore.document("experiences/{id}")
    .onCreate(async (snapshot) => {
      const data = snapshot.data();
      const id = snapshot.id;
      const record = experienceRecord(id, data);
      record.objectID = id;
      return experienceIndex.saveObject({...record, id});
    });

export const updateExperienceIndex = functions.region("europe-west1").https.onCall(async (data, context) => {
  const experienceId = data.experienceId;
  const experienceDocument = await firestoreDatabase.collection("experiences").doc(experienceId).get();
  const experienceData = experienceDocument.data();
  if (experienceData != undefined) {
    const record = experienceRecord(experienceId, experienceData);
    record.objectID = experienceId;
    return experienceIndex.saveObject({...record});
  } else {
    console.log("Undefined experience document");
    return "Error: undefined experience document";
  }
});

export const deleteExperienceIndex = functions.firestore.document("experiences/{id}")
    .onDelete(async (snapshot) => {
      const id = snapshot.id;
      return experienceIndex.deleteObject(id);
    });

export const addUserToIndex = functions.firestore.document("users/{id}")
    .onCreate(async (snapshot) => {
      const data = snapshot.data();
      const id = snapshot.id;
      const record = userRecord(id, data);
      record.objectID = id;
      return userIndex.saveObject({...record, id});
    });

// This is a callable function to limit the amount of writes
// User documents are updated for many reasons in the client
// But the vast majority of the time this shouldn't be executed
export const updateUserIndex = functions.region("europe-west1").https.onCall(async (data, context) => {
  const userId = data.userId;
  const userDocument = await firestoreDatabase.collection("users").doc(userId).get();
  const userData = userDocument.data();
  if (userData != undefined) {
    const record = userRecord(userId, userData);
    record.objectID = userId;
    return userIndex.saveObject({...record});
  } else {
    console.log("Undefined user document");
    return "Error: undefined user document";
  }
});

export const deleteUserIndex = functions.firestore.document("users/{id}")
    .onDelete(async (snapshot) => {
      const id = snapshot.id;
      return userIndex.deleteObject(id);
    });

export const addTagToIndex = functions.firestore.document("tags/{id}")
    .onCreate(async (snapshot) => {
      const data = snapshot.data();
      const id = snapshot.id;
      const record = tagRecord(id, data);
      record.objectID = id;
      return tagIndex.saveObject({...record, id});
    });

export const updateTagIndex = functions.firestore.document("tags/{id}")
    .onUpdate(async (change) => {
      const newData = change.after;
      const id = newData.id;
      const newDataData = newData.data();
      const record = tagRecord(id, newDataData);
      record.objectID = id;
      return tagIndex.saveObject({...record, id});
    });

export const deleteTagIndex = functions.firestore.document("tags/{id}")
    .onDelete(async (snapshot) => {
      const id = snapshot.id;
      return tagIndex.deleteObject(id);
    });

/**
 * Creates the record of an experience to be saved in an algolia index
 * @param {string} id the id for the record
 * @param {firestore.DocumentData} data The document data.
 * @return {any} The experience record based on the given data
 */
function experienceRecord(id: string, data: firestore.DocumentData): any {
  const record = {
    objectID: id,
    id: data.id,
    title: data.title,
    difficulty: data.difficulty,
    creatorId: data.creatorId,
    creationDate: data.creationDate,
  };
  return record;
}

/**
 * Creates the record of an user to be saved in an algolia index
 * @param {string} id The id for the record
 * @param {firestore.DocumentData} data The document data.
 * @return {any} The user record based on the given data
 */
function userRecord(id: string, data: firestore.DocumentData): any {
  const record = {
    objectID: id,
    id: data.id,
    name: data.name,
    username: data.username,
  };
  return record;
}
/**
 * Creates the record of an user to be saved in an algolia index
 * @param {string} id The id for the record
 * @param {firestore.DocumentData} data The document data.
 * @return {any} The tag record based on the given data
 */
function tagRecord(id: string, data: firestore.DocumentData): any {
  const record = {
    objectID: id,
    id: data.id,
    name: data.name,
    creationDate: data.creationDate,
  };
  return record;
}

// Update propagation

// This function may end up being called too much
export const propagateUserUpdate = functions.region("europe-west1").https.onCall(async (data, context) => {
  try {
    const userId = data.userId;
    const updatePromises: any[] = [];
    const updatedDocument = await firestoreDatabase.collection("users").doc(userId).get();
    const updatedData = updatedDocument.data();
    // This will have to change every time the SimpleUser class is changed
    const simpleUpdatedData = {
      id: updatedData?.id,
      name: updatedData?.name,
      username: updatedData?.username,
      imageURL: updatedData?.imageURL,
      level: updatedData?.level,
      experiencePoints: updatedData?.experiencePoints,
      adminPowers: updatedData?.adminPowers,
      followersAmount: updatedData?.followersAmount,
    };
    const experiencesQuery = await firestoreDatabase.collection("experiences").get();
    const experienceByCreatorQuery = await firestoreDatabase.collection("experiences").where("creatorId", "==", userId).get();
    const receiverNotificationQuery = await firestoreDatabase.collection("notifications").where("receiver.id", "==", userId).get();
    const senderNotificationQuery = await firestoreDatabase.collection("notifications").where("sender.id", "==", userId).get();
    const experienceCreatorNotificationQuery = await firestoreDatabase.collection("notifications").where("experience.creatorId", "==", userId).get();
    // Updates the comments
    experiencesQuery.docs.forEach(async (experienceDocument) => {
      const commentsQuery = await experienceDocument.ref.collection("comments").where("poster.id", "==", userId).get();
      updatePromises.push(commentsQuery.docs.forEach((commentDocument) => commentDocument.ref.update({"poster": simpleUpdatedData})));
    });
    // Updates the creator of the experiences
    experienceByCreatorQuery.docs.forEach((experienceDocument) => {
      updatePromises.push(experienceDocument.ref.update({"creator": simpleUpdatedData}));
    });
    // Updates the receiver of the notifications
    receiverNotificationQuery.docs.forEach((notificationDocument) => {
      updatePromises.push(notificationDocument.ref.update({"receiver": simpleUpdatedData}));
    });
    // Updates the sender of the notifications
    senderNotificationQuery.docs.forEach((notificationDocument) => {
      updatePromises.push(notificationDocument.ref.update({"sender": simpleUpdatedData}));
    });
    // Updates the creator of the experiences of the notifications
    experienceCreatorNotificationQuery.docs.forEach((notificationDocument) => {
      updatePromises.push(notificationDocument.ref.update({"experience.creator": simpleUpdatedData}));
    });
    await Promise.all(updatePromises);
    return "Success";
  } catch (error) {
    console.error(error);
    return "Error";
  }
});

export const propagateExperienceUpdate = functions.region("europe-west1").https.onCall(async (data, context) => {
  try {
    const experienceId = data.experienceId;
    const updatePromises: any[] = [];
    const updatedDocument = await firestoreDatabase.collection("experiences").doc(experienceId).get();
    const updatedData = updatedDocument.data();
    const experiencesNotificationQuery = await firestoreDatabase.collection("notifications").where("experience.id", "==", experienceId).get();
    // Updates the experiences of the notifications
    experiencesNotificationQuery.docs.forEach((notificationDocument) => {
      updatePromises.push(notificationDocument.ref.update({"experience": updatedData}));
    });
    await Promise.all(updatePromises);
    return "Success";
  } catch (error) {
    console.error(error);
    return "Error";
  }
});

// Image deletion
export const deleteUserImageOnUserDelete = functions.firestore.document("users/{id}").onDelete(async (snapshot) => {
  const userData = snapshot.data();
  const fileName = userData.imageUrl.substr(userData.imageUrl.indexOf("%2F") + 3, (userData.imageUrl.indexOf("?")) - (userData.imageUrl.indexOf("%2F") + 3));
  console.log(fileName);
  // const storage = admin.storage();
  // const defaultBucket = storage.bucket();
  // const file = defaultBucket.deleteFiles(userData);
  // return file.delete();
});
