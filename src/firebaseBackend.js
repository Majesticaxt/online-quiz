import { initializeApp } from "firebase/app";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

const app = firebaseEnabled ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function readCollection(name) {
  const snapshot = await getDocs(collection(db, name));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

async function readAttempts() {
  const snapshot = await getDocs(collection(db, "attempts"));
  return Object.fromEntries(snapshot.docs.map((entry) => [entry.id, entry.data()]));
}

async function readSettings(fallback) {
  const snapshot = await getDoc(doc(db, "settings", "quiz"));
  return snapshot.exists() ? snapshot.data() : fallback;
}

export async function loadQuizData(keys, fallbackSettings) {
  if (!firebaseEnabled) {
    return {
      students: readStorage(keys.students, []),
      subjects: readStorage(keys.subjects, []),
      attempts: readStorage(keys.attempts, {}),
      settings: readStorage(keys.settings, fallbackSettings)
    };
  }

  const [students, subjects, attempts, settings] = await Promise.all([
    readCollection("students"),
    readCollection("subjects"),
    readAttempts(),
    readSettings(fallbackSettings)
  ]);

  return {
    students,
    subjects,
    attempts,
    settings
  };
}

export async function saveStudents(students, key) {
  if (!firebaseEnabled) {
    writeStorage(key, students);
    return;
  }

  const existing = await getDocs(collection(db, "students"));
  const batch = writeBatch(db);
  existing.docs.forEach((entry) => {
    batch.delete(doc(db, "students", entry.id));
  });
  students.forEach((student) => {
    batch.set(doc(db, "students", student.serial), student);
  });
  await batch.commit();
}

export async function saveSubjects(subjects, key) {
  if (!firebaseEnabled) {
    writeStorage(key, subjects);
    return;
  }

  const existing = await getDocs(collection(db, "subjects"));
  const batch = writeBatch(db);
  existing.docs.forEach((entry) => {
    batch.delete(doc(db, "subjects", entry.id));
  });
  subjects.forEach((subject) => {
    batch.set(doc(db, "subjects", subject.id), subject);
  });
  await batch.commit();
}

export async function saveSettings(settings, key) {
  if (!firebaseEnabled) {
    writeStorage(key, settings);
    return;
  }

  await setDoc(doc(db, "settings", "quiz"), settings);
}

export async function saveAttempt(attempt, key, currentAttempts) {
  const attemptId = `${attempt.serial}:${attempt.subjectId}`;

  if (!firebaseEnabled) {
    writeStorage(key, { ...currentAttempts, [attemptId]: attempt });
    return;
  }

  await setDoc(doc(db, "attempts", attemptId), attempt);
}

export async function deleteStoredAttempt(attemptId, key, currentAttempts) {
  if (!firebaseEnabled) {
    const nextAttempts = { ...currentAttempts };
    delete nextAttempts[attemptId];
    writeStorage(key, nextAttempts);
    return;
  }

  await deleteDoc(doc(db, "attempts", attemptId));
}

export async function clearStoredAttempts(key) {
  if (!firebaseEnabled) {
    writeStorage(key, {});
    return;
  }

  const snapshot = await getDocs(collection(db, "attempts"));
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(doc(db, "attempts", entry.id))));
}
