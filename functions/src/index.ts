/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as algoliaSearch from "algoliasearch";
import firestore = require("@google-cloud/firestore");

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

// Algolia functions
const APP_ID = functions.config().algolia.app;
const ADMIN_KEY = functions.config().algolia.key;

const algoliaClient =algoliaSearch.default(APP_ID, ADMIN_KEY);
const experienceIndex = algoliaClient.initIndex("prod_experience");
const userIndex = algoliaClient.initIndex("prod_user");
const tagIndex = algoliaClient.initIndex("prod_tag");

admin.initializeApp();
const db = admin.firestore();

export const sendExperienceCollectionToAlgolia = functions.https
    .onRequest(async (req, res) => {
      const algoliaRecords : any[] = [];
      const querySnapshot = await db.collection("experiences").get();

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
      const querySnapshot = await db.collection("users").get();

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
      const querySnapshot = await db.collection("tags").get();

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

export const updateExperienceIndex = functions.firestore.document("experiences/{id}")
    .onUpdate(async (change) => {
      const newData = change.after;
      const id = newData.id;
      const newDataData = newData.data();
      const record = experienceRecord(id, newDataData);
      record.objectID = id;
      return experienceIndex.saveObject({...record, id});
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

export const updateUserIndex = functions.firestore.document("users/{id}")
    .onUpdate(async (change) => {
      const newData = change.after;
      const id = newData.id;
      const newDataData = newData.data();
      const record = userRecord(id, newDataData);
      record.objectID = id;
      return userIndex.saveObject({...record, id});
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
