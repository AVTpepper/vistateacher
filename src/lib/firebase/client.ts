import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

import { getClientEnv } from "@/lib/env/client";

interface FirebaseClientServices {
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: FirebaseClientServices | undefined;
let emulatorsConnected = false;

export function getFirebaseClient(): FirebaseClientServices {
  if (services) return services;

  const env = getClientEnv();
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
      });

  services = {
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };

  if (
    env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS &&
    typeof window !== "undefined" &&
    !emulatorsConnected
  ) {
    connectAuthEmulator(services.auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(services.db, "127.0.0.1", 8080);
    connectStorageEmulator(services.storage, "127.0.0.1", 9199);
    emulatorsConnected = true;
  }

  return services;
}
