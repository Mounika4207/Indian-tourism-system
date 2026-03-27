// ============================================================
// firebase-auth.js — Incredible India Tourism
// Handles: Login, Signup, Favourites, Reviews, Trip Planner,
//          Safety Alerts — all stored in Firebase Firestore
// ============================================================
// STEP 1: Go to https://console.firebase.google.com
// STEP 2: Create project → Enable Authentication (Google + Email)
// STEP 3: Enable Firestore Database
// STEP 4: Replace config below with your own keys
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc,
  collection, getDocs, addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── YOUR FIREBASE CONFIG ──────────────────────────────────────
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
// ─────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ════════════════════════════════════════════════
// AUTH STATE — runs on every page load
// ════════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (user) {
    showUserUI(user);
    loadUserData(user.uid);
  } else {
    showGuestUI();
  }
});

function showUserUI(user) {
  document.getElementById("authBtn")?.classList.add("hidden");
  document.getElementById("userMenu")?.classList.remove("hidden");
  const nameEl = document.getElementById("userName");
  if (nameEl) nameEl.textContent = "👤 " + (user.displayName?.split(" ")[0] || "User");
}

function showGuestUI() {
  document.getElementById("authBtn")?.classList.remove("hidden");
  document.getElementById("userMenu")?.classList.add("hidden");
}

// ════════════════════════════════════════════════
// SIGN UP (Email + Password)
// ════════════════════════════════════════════════
async function signUpWithEmail(name, email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // Create user document in Firestore
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email,
      createdAt: serverTimestamp(),
      role: "user"
    });
    closeAuthModal();
    showToast("✅ Account created! Welcome, " + name);
  } catch (err) {
    showToast("❌ " + getFriendlyError(err.code));
  }
}

// ════════════════════════════════════════════════
// LOGIN (Email + Password)
// ════════════════════════════════════════════════
async function loginWithEmail(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    closeAuthModal();
    showToast("✅ Logged in successfully!");
  } catch (err) {
    showToast("❌ " + getFriendlyError(err.code));
  }
}

// ════════════════════════════════════════════════
// GOOGLE SIGN IN
// ════════════════════════════════════════════════
async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    // Create user doc if first time
    const userRef = doc(db, "users", cred.user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        name: cred.user.displayName,
        email: cred.user.email,
        createdAt: serverTimestamp(),
        role: "user"
      });
    }
    closeAuthModal();
    showToast("✅ Welcome, " + cred.user.displayName.split(" ")[0] + "!");
  } catch (err) {
    showToast("❌ Google sign-in failed.");
    console.error(err);
  }
}

// ════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════
async function logout() {
  await signOut(auth);
  showToast("👋 Logged out successfully!");
  location.reload();
}

// ════════════════════════════════════════════════
// ❤️ FAVOURITES — Firestore per user
// ════════════════════════════════════════════════
async function saveFavourite(place) {
  const user = auth.currentUser;
  if (!user) { openAuthModal(); return; }
  const ref = doc(db, "users", user.uid, "favourites", String(place.id));
  await setDoc(ref, { ...place, savedAt: serverTimestamp() });
  showToast("❤️ " + place.name + " saved to favourites!");
}

async function removeFavourite(placeId) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, "users", user.uid, "favourites", String(placeId)));
  showToast("💔 Removed from favourites");
}

async function getFavourites() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(collection(db, "users", user.uid, "favourites"));
  return snap.docs.map(d => d.data());
}

async function isFavourite(placeId) {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDoc(doc(db, "users", user.uid, "favourites", String(placeId)));
  return snap.exists();
}

// ════════════════════════════════════════════════
// ⭐ REVIEWS — Stored in Firestore
// ════════════════════════════════════════════════
async function submitReview(placeId, placeName, rating, text) {
  const user = auth.currentUser;
  if (!user) { openAuthModal(); return; }
  await addDoc(collection(db, "reviews", String(placeId), "entries"), {
    userId:    user.uid,
    userName:  user.displayName || "Anonymous",
    placeName,
    rating,
    text,
    createdAt: serverTimestamp()
  });
  showToast("✅ Review submitted!");
}

async function getReviews(placeId) {
  const q = query(
    collection(db, "reviews", String(placeId), "entries"),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ════════════════════════════════════════════════
// 📅 TRIP PLANNER — Saved per user
// ════════════════════════════════════════════════
async function addToTrip(place) {
  const user = auth.currentUser;
  if (!user) { openAuthModal(); return; }
  const ref = doc(db, "users", user.uid, "tripPlanner", String(place.id));
  await setDoc(ref, { ...place, addedAt: serverTimestamp() });
  showToast("📅 " + place.name + " added to Trip Planner!");
}

async function removeFromTrip(placeId) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, "users", user.uid, "tripPlanner", String(placeId)));
}

async function getTrip() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(collection(db, "users", user.uid, "tripPlanner"));
  return snap.docs.map(d => d.data()).sort((a, b) => (a.addedAt?.seconds || 0) - (b.addedAt?.seconds || 0));
}

// ════════════════════════════════════════════════
// 🚨 SAFETY ALERTS — Read from Firestore (admin sets)
// ════════════════════════════════════════════════
async function getSafetyAlerts(placeId) {
  try {
    const snap = await getDocs(collection(db, "safetyAlerts", String(placeId), "alerts"));
    return snap.docs.map(d => d.data());
  } catch { return []; }
}

// Admin can add alerts in Firebase console:
// Collection: safetyAlerts → Document: {placeId} → alerts → {message, level, date}
// level: "info" | "warning" | "danger"

// ════════════════════════════════════════════════
// LOAD USER DATA on page load
// ════════════════════════════════════════════════
async function loadUserData(uid) {
  // Load favourites into localStorage as cache for quick UI rendering
  const favs = await getFavourites();
  localStorage.setItem("favourites", JSON.stringify(favs));
  // Refresh UI if renderPlaces exists on page
  if (typeof renderPlaces === "function") renderPlaces(window._allPlaces || []);
}

// ════════════════════════════════════════════════
// AUTH MODAL HTML (add this to your HTML pages)
// ════════════════════════════════════════════════
function openAuthModal() {
  document.getElementById("authModal")?.classList.add("open");
}
function closeAuthModal() {
  document.getElementById("authModal")?.classList.remove("open");
}

// ════════════════════════════════════════════════
// ERROR MESSAGES
// ════════════════════════════════════════════════
function getFriendlyError(code) {
  const errors = {
    "auth/email-already-in-use":   "Email already registered. Please login.",
    "auth/wrong-password":         "Incorrect password. Try again.",
    "auth/user-not-found":         "No account found. Please sign up.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "auth/too-many-requests":      "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection."
  };
  return errors[code] || "Something went wrong. Please try again.";
}

function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "toast show";
  setTimeout(() => t.className = "toast", 3000);
}

// ════════════════════════════════════════════════
// EXPORT for use in other files
// ════════════════════════════════════════════════
export {
  auth, db,
  loginWithGoogle, loginWithEmail, signUpWithEmail, logout,
  saveFavourite, removeFavourite, getFavourites, isFavourite,
  submitReview, getReviews,
  addToTrip, removeFromTrip, getTrip,
  getSafetyAlerts,
  openAuthModal, closeAuthModal
};