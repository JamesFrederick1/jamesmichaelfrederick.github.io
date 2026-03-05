// /account/account.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Account page logic:
 * - Shows email + username
 * - DiceBear "adventurer" avatars:
 *    - Each user gets a fixed set of 12 avatar seeds (saved in Firestore) -> no refresh reroll
 *    - User picks one -> saved as avatarSeed
 *    - 6 male + 6 female in the grid (one-line rule inside render)
 */

const firebaseConfig = {
  apiKey: "AIzaSyDoXwHKUgWeBv7rmnLZACzlVoEcXKyZEnI",
  authDomain: "sign-up-e2a6c.firebaseapp.com",
  projectId: "sign-up-e2a6c",
  storageBucket: "sign-up-e2a6c.firebasestorage.app",
  messagingSenderId: "1014249305987",
  appId: "1:1014249305987:web:42bb551d2b879ed39ba8b6",
};

// ---------- Firebase singleton ----------
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "default");

// ---------- DOM ----------
const avatarImg = document.getElementById("avatarImg");
const emailText = document.getElementById("emailText");
const usernameText = document.getElementById("usernameText");
const statusMsg = document.getElementById("statusMsg");

const resetPwBtn = document.getElementById("resetPwBtn");
const signOutBtn = document.getElementById("signOutBtn");
const avatarGrid = document.getElementById("avatarGrid");

// ---------- DiceBear helpers ----------
const DICE_STYLE = "adventurer";
const GRID_COUNT = 12;
const GRID_SIZE = 96; // grid thumbnail size
const MAIN_SIZE = 160; // big avatar size

function diceUrl(seed, size, gender /* "male" | "female" | null */) {
  const g = gender ? `&gender=${encodeURIComponent(gender)}` : "";
  return `https://api.dicebear.com/9.x/${DICE_STYLE}/png?seed=${encodeURIComponent(
    seed
  )}&size=${size}${g}`;
}

function randSeed() {
  // short random seed; stable once saved
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function setStatus(t) {
  if (statusMsg) statusMsg.textContent = t || "";
}

function setAvatar(seed, gender) {
  if (!avatarImg) return;
  avatarImg.src = diceUrl(seed, MAIN_SIZE, gender);
  avatarImg.alt = "Avatar";
}

// ---------- Username lookup ----------
async function getUsernameForUid(uid) {
  // Best case: you store username on users/{uid}
  try {
    const uSnap = await getDoc(doc(db, "users", uid));
    if (uSnap.exists()) {
      const u = uSnap.data()?.username;
      if (typeof u === "string" && u) return u;
    }
  } catch {}

  // Fallback: you have usernames collection where docId=username -> {uid}
  // Query usernames where uid==uid
  try {
    const qy = query(collection(db, "usernames"), where("uid", "==", uid), limit(1));
    const res = await getDocs(qy);
    if (!res.empty) return res.docs[0].id; // doc id is the username
  } catch (e) {
    console.warn("[account] username query failed:", e);
  }

  return null;
}

// ---------- Avatar data in Firestore ----------
/**
 * We store in users/{uid}:
 *  - avatarSeed: string (selected seed)
 *  - avatarGender: "male"|"female" (selected)
 *  - avatarOptions: [{seed, gender}] length 12 (fixed grid seeds)
 */
async function ensureUserProfile(uid) {
  const ref = doc(db, "users", uid);
  let data = null;

  try {
    const snap = await getDoc(ref);
    data = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("[account] get users doc failed:", e);
  }

  // If missing: create minimal doc, but don't overwrite existing fields
  if (!data) {
    const opts = Array.from({ length: GRID_COUNT }, (_, i) => ({
      seed: randSeed(),
      // 6 boys / 6 girls (the "one line change" logic)
      gender: i < 6 ? "male" : "female",
    }));

    // pick first as default selection
    const first = opts[0];

    await setDoc(
      ref,
      {
        createdAt: serverTimestamp(),
        avatarOptions: opts,
        avatarSeed: first.seed,
        avatarGender: first.gender,
      },
      { merge: true }
    );

    return {
      avatarOptions: opts,
      avatarSeed: first.seed,
      avatarGender: first.gender,
    };
  }

  // Ensure avatarOptions exists & is valid
  let opts = Array.isArray(data.avatarOptions) ? data.avatarOptions : null;
  if (!opts || opts.length !== GRID_COUNT) {
    opts = Array.from({ length: GRID_COUNT }, (_, i) => ({
      seed: randSeed(),
      gender: i < 6 ? "male" : "female",
    }));
    await updateDoc(ref, { avatarOptions: opts });
  }

  // Ensure selected avatar exists
  let avatarSeed = typeof data.avatarSeed === "string" ? data.avatarSeed : "";
  let avatarGender = data.avatarGender === "male" || data.avatarGender === "female" ? data.avatarGender : "";

  if (!avatarSeed) {
    const first = opts[0];
    avatarSeed = first.seed;
    avatarGender = first.gender;
    await updateDoc(ref, { avatarSeed, avatarGender });
  }

  return { avatarOptions: opts, avatarSeed, avatarGender };
}

function renderAvatarGrid(uid, profile) {
  if (!avatarGrid) return;

  avatarGrid.innerHTML = "";

  const { avatarOptions, avatarSeed } = profile;

  avatarOptions.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-tile";
    btn.setAttribute("aria-label", `Choose avatar ${i + 1}`);

    const img = document.createElement("img");
    img.alt = `Avatar option ${i + 1}`;
    img.loading = "lazy";
    img.decoding = "async";
    img.src = diceUrl(opt.seed, GRID_SIZE, opt.gender);

    // selected styling hook
    if (opt.seed === avatarSeed) btn.classList.add("selected");

    btn.appendChild(img);

    btn.addEventListener("click", async () => {
      try {
        setStatus("Saving avatar...");
        await updateDoc(doc(db, "users", uid), {
          avatarSeed: opt.seed,
          avatarGender: opt.gender,
        });

        // update UI instantly
        setAvatar(opt.seed, opt.gender);

        // update selection highlight
        avatarGrid.querySelectorAll(".avatar-tile.selected").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");

        setStatus("Avatar updated.");
      } catch (e) {
        console.error("[account] save avatar failed:", e);
        setStatus("Could not save avatar.");
      }
    });

    avatarGrid.appendChild(btn);
  });
}

// ---------- Main ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not signed in: go home (or you can show a message instead)
    window.location.href = "/";
    return;
  }

  setStatus("");

  // Email
  if (emailText) emailText.textContent = user.email || "—";

  // Username
  const uname = await getUsernameForUid(user.uid);
  if (usernameText) usernameText.textContent = uname || "—";

  // Avatar profile
  let profile;
  try {
    profile = await ensureUserProfile(user.uid);
  } catch (e) {
    console.error("[account] ensureUserProfile failed:", e);
    setStatus("Could not load profile.");
    profile = null;
  }

  if (profile) {
    setAvatar(profile.avatarSeed, profile.avatarGender);
    renderAvatarGrid(user.uid, profile);
  }

  // Buttons
  resetPwBtn?.addEventListener("click", async () => {
    setStatus("");
    try {
      const email = user.email || "";
      if (!email) return setStatus("No email on this account.");
      await sendPasswordResetEmail(auth, email);
      setStatus("Password reset email sent. Check spam/promotions.");
    } catch (e) {
      console.error("[account] reset password failed:", e);
      setStatus("Could not send reset email.");
    }
  });

  signOutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "/";
    } catch (e) {
      console.error("[account] sign out failed:", e);
      setStatus("Could not sign out.");
    }
  });
});