// /account/account.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---- Firebase (match shared/signup.js + shared/auth.js) ----
const firebaseConfig = {
  apiKey: "AIzaSyDoXwHKUgWeBv7rmnLZACzlVoEcXKyZEnI",
  authDomain: "sign-up-e2a6c.firebaseapp.com",
  projectId: "sign-up-e2a6c",
  storageBucket: "sign-up-e2a6c.firebasestorage.app",
  messagingSenderId: "1014249305987",
  appId: "1:1014249305987:web:42bb551d2b879ed39ba8b6",
};

const APP_NAME = "main";
const app = getApps().some((a) => a.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(firebaseConfig, APP_NAME);

const auth = getAuth(app);

// ---- DOM (must match your HTML ids) ----
const avatarImg = document.getElementById("avatarImg");
const emailText = document.getElementById("emailText");
const usernameText = document.getElementById("usernameText");
const statusMsg = document.getElementById("statusMsg");
const resetPwBtn = document.getElementById("resetPwBtn");
const signOutBtn = document.getElementById("signOutBtn");
const avatarGrid = document.getElementById("avatarGrid");

// Hard fail if HTML ids are wrong (so it never silently does nothing)
const required = { avatarImg, emailText, usernameText, statusMsg, resetPwBtn, signOutBtn, avatarGrid };
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  throw new Error(`[account.js] Missing required DOM ids: ${missing.join(", ")}`);
}

function setStatus(t) {
  statusMsg.textContent = t || "";
}

function dicebearUrl(style, seed) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

// 12 options: 6 + 6 (your “male/female” split)
const STYLE_A = "adventurer";          // group A
const STYLE_B = "adventurer-neutral";  // group B

function makeSeed(uid, username, i) {
  const base = (username || uid || "user").toLowerCase();
  return `u:${base}:${i}`;
}

async function getUserDoc(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() || {}) : null;
}

async function ensureUserDoc(user) {
  // If someone existed before you started writing users/{uid}, create minimal doc.
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(
    ref,
    { uid: user.uid, email: user.email || "", username: "", createdAt: serverTimestamp() },
    { merge: true }
  );
}

function renderAvatarGrid(user, profile) {
  avatarGrid.innerHTML = "";

  const currentUrl = profile?.avatarUrl ? String(profile.avatarUrl) : "";

  for (let i = 0; i < 12; i++) {
    const style = i < 6 ? STYLE_A : STYLE_B;
    const seed = makeSeed(user.uid, profile?.username, i);
    const url = dicebearUrl(style, seed);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-tile";
    btn.title = `Avatar ${i + 1}`;
    if (url === currentUrl) btn.classList.add("selected");

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = `Avatar ${i + 1}`;
    img.src = url;

    btn.appendChild(img);

    btn.addEventListener("click", async () => {
      try {
        setStatus("Saving avatar...");
        btn.disabled = true;

        await setDoc(
          doc(db, "users", user.uid),
          {
            avatarStyle: style,
            avatarIndex: i,
            avatarSeed: seed,
            avatarUrl: url,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        avatarImg.src = url;

        // update selection UI
        avatarGrid.querySelectorAll(".avatar-tile.selected").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");

        setStatus("Avatar updated.");
        setTimeout(() => setStatus(""), 1500);
      } catch (e) {
        console.error("[account.js] avatar save failed:", e);
        setStatus("Could not save avatar.");
      } finally {
        btn.disabled = false;
      }
    });

    avatarGrid.appendChild(btn);
  }
}

function pickAvatarUrl(user, profile) {
  if (profile?.avatarUrl) return String(profile.avatarUrl);
  if (profile?.avatarSeed) {
    const style = profile?.avatarStyle || STYLE_A;
    return dicebearUrl(style, String(profile.avatarSeed));
  }
  // fallback deterministic
  const seed = user.email ? `u:${user.email.toLowerCase()}` : `u:${user.uid}`;
  return dicebearUrl(STYLE_A, seed);
}

// ---- Buttons ----
resetPwBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user?.email) return setStatus("No signed-in user.");
  try {
    setStatus("Sending reset email...");
    await sendPasswordResetEmail(auth, user.email);
    setStatus("Password reset email sent. Check spam/promotions.");
  } catch (e) {
    console.error("[account.js] reset email failed:", e);
    setStatus("Could not send reset email.");
  }
});

signOutBtn.addEventListener("click", async () => {
  try {
    setStatus("Signing out...");
    await signOut(auth);

    // IMPORTANT: do NOT open signin modal here.
    // Redirect somewhere safe after sign-out.
    window.location.href = "/";
  } catch (e) {
    console.error("[account.js] sign out failed:", e);
    setStatus("Sign out failed.");
  }
});

// ---- Auth gating: account page requires login ----
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Must be signed in to view this page.
    // Do NOT open modal; just redirect.
    window.location.replace("/");
    return;
  }

  try {
    setStatus("Loading account...");
    await ensureUserDoc(user);

    const profile = await getUserDoc(user.uid);

    emailText.textContent = user.email || profile?.email || "—";
    usernameText.textContent = profile?.username || "—";

    avatarImg.src = pickAvatarUrl(user, profile);

    renderAvatarGrid(user, profile);

    setStatus("");
  } catch (e) {
    console.error("[account.js] load failed:", e);
    setStatus("Could not load account data.");
  }
});