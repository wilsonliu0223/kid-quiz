import { CONFIG } from "./config.site.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

/** @type {import('firebase/app').FirebaseApp | null} */
let app = null;
/** @type {import('firebase/database').Database | null} */
let db = null;
/** @type {import('firebase/auth').Auth | null} */
let auth = null;
/** @type {Promise<void> | null} */
let readyPromise = null;

export function isFirebaseConfigured() {
  const fb = CONFIG.FIREBASE;
  return !!(
    fb?.apiKey &&
    fb?.authDomain &&
    fb?.databaseURL &&
    fb?.projectId &&
    fb?.appId
  );
}

export function getFirebaseConfigSummary() {
  if (!isFirebaseConfigured()) return null;
  return {
    projectId: CONFIG.FIREBASE.projectId,
    databaseURL: CONFIG.FIREBASE.databaseURL,
  };
}

/**
 * @returns {Promise<{ db: import('firebase/database').Database, auth: import('firebase/auth').Auth, uid: string }>}
 */
export async function ensureFirebase() {
  if (!isFirebaseConfigured()) {
    const err = new Error("FIREBASE_NOT_CONFIGURED");
    err.code = "FIREBASE_NOT_CONFIGURED";
    throw err;
  }

  if (!readyPromise) {
    readyPromise = (async () => {
      app = initializeApp({ ...CONFIG.FIREBASE });
      db = getDatabase(app);
      auth = getAuth(app);
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    })();
  }

  try {
    await readyPromise;
  } catch (err) {
    readyPromise = null;
    const wrap = new Error("FIREBASE_AUTH_FAILED");
    wrap.code = "FIREBASE_AUTH_FAILED";
    wrap.cause = err;
    throw wrap;
  }
  if (!db || !auth?.currentUser) {
    throw new Error("FIREBASE_INIT_FAILED");
  }

  return { db, auth, uid: auth.currentUser.uid };
}

export function getFirebaseDb() {
  return db;
}
