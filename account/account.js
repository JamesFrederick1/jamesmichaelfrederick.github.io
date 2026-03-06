// /account/account.js
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { doc, getDoc, setDoc, serverTimestamp } from
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { auth, firestore, FIRESTORE_DB_CANDIDATES } from "/shared/firebase.js";

// ---- DOM ----
const avatarImg = document.getElementById("avatarImg");
const emailText = document.getElementById("emailText");
const usernameText = document.getElementById("usernameText");
const statusMsg = document.getElementById("statusMsg");
const resetPwBtn = document.getElementById("resetPwBtn");
const signOutBtn = document.getElementById("signOutBtn");
const avatarGrid = document.getElementById("avatarGrid");

const required = { avatarImg, emailText, usernameText, statusMsg, resetPwBtn, signOutBtn, avatarGrid };
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) throw new Error(`[account.js] Missing required DOM ids: ${missing.join(", ")}`);

// ---- Config ----
// “Half boy / half girl” = two distinct dicebear styles.
// (You can swap styles later; the batch still stays fixed per user.)
const STYLE_A = "adventurer";
const STYLE_B = "adventurer-neutral";

// Grid size: choose a fixed batch size. (5 x 8 = 40 looks good in a scroll box)
const COLS_DESKTOP = 5;
const ROWS = 8;
const BATCH_SIZE = COLS_DESKTOP * ROWS; // 40
const HALF = Math.floor(BATCH_SIZE / 2);

// localStorage key used by your auth.js cache
const AVATAR_LS_PREFIX = "avatarUrl:";

function setStatus(t) {
  statusMsg.textContent = t || "";
}

function dicebearUrl(style, seed) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

function makeRandomSeed() {
  // short, stable-looking random seed; stored once in Firestore
  const buf = new Uint32Array(3);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((n) => n.toString(16)).join("-");
}

// ---- Firestore DB picker (matches your multi-db candidate approach) ----
let _dbId = null;

async function pickWorkingDbIdForUser(uid) {
  if (_dbId) return _dbId;

  // Try candidates until one works
  for (const dbId of FIRESTORE_DB_CANDIDATES) {
    try {
      const db = firestore(dbId);
      // Just attempting a read is enough to validate DB path + rules
      await getDoc(doc(db, "users", uid));
      _dbId = dbId;
      return _dbId;
    } catch (e) {
      const code = e?.code || "";
      const msg = String(e?.message || "");
      // Try next candidate for “wrong DB / not provisioned”
      if (code === "failed-precondition" || code === "not-found" || /does not exist/i.test(msg)) continue;

      // For permission errors, still stop — user doc reads should be allowed per your rules
      // but if not, we don’t want to loop forever.
      console.error("[account.js] DB candidate failed:", dbId, e);
      continue;
    }
  }

  throw new Error("No working Firestore database candidate found. Check FIRESTORE_DB_CANDIDATES + rules.");
}

async function getProfile(uid) {
  const dbId = await pickWorkingDbIdForUser(uid);
  const db = firestore(dbId);
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() || {}) : {};
}

async function mergeProfile(uid, patch) {
  const dbId = await pickWorkingDbIdForUser(uid);
  const db = firestore(dbId);
  const ref = doc(db, "users", uid);
  await setDoc(ref, patch, { merge: true });
}

async function ensureUserDoc(user) {
  const profile = await getProfile(user.uid);

  // minimal baseline doc
  if (!profile?.createdAt) {
    await mergeProfile(user.uid, {
      uid: user.uid,
      email: user.email || "",
      createdAt: serverTimestamp(),
    });
  }

  // ensure “avatar batch” seed exists (this is what makes the batch UNIQUE per user)
  if (!profile?.avatarBatchSeed) {
    const avatarBatchSeed = makeRandomSeed();
    await mergeProfile(user.uid, {
      avatarBatchSeed,
      // optional: store the “batch style set” so you can change code later safely
      avatarBatchStyleA: STYLE_A,
      avatarBatchStyleB: STYLE_B,
      avatarBatchSize: BATCH_SIZE,
      updatedAt: serverTimestamp(),
    });
    // refresh local view
    return await getProfile(user.uid);
  }

  return profile;
}

function styleForIndex(i) {
  return i < HALF ? STYLE_A : STYLE_B;
}

function seedForIndex(batchSeed, i) {
  // Stable per user + per tile, and won’t change unless you delete avatarBatchSeed
  return `${batchSeed}:${i}`;
}

function pickAvatarUrl(user, profile) {
  if (profile?.avatarUrl) return String(profile.avatarUrl);

  // If only seed/style is present, rebuild
  if (profile?.avatarSeed) {
    const style = profile?.avatarStyle || STYLE_A;
    return dicebearUrl(style, String(profile.avatarSeed));
  }

  // fallback deterministic if nothing exists yet
  const batchSeed = profile?.avatarBatchSeed || `u:${user.uid}`;
  return dicebearUrl(STYLE_A, seedForIndex(batchSeed, 0));
}

function clearSelectedTiles() {
  avatarGrid.querySelectorAll(".avatar-tile.selected").forEach((el) => el.classList.remove("selected"));
}

function markSelectedByUrl(url) {
  const tiles = avatarGrid.querySelectorAll(".avatar-tile");
  for (const tile of tiles) {
    if (tile?.dataset?.url === url) tile.classList.add("selected");
  }
}

async function saveAvatarSelection(user, { style, index, seed, url }) {
  // Firestore write
  await mergeProfile(user.uid, {
    avatarStyle: style,
    avatarIndex: index,
    avatarSeed: seed,
    avatarUrl: url,
    updatedAt: serverTimestamp(),
  });

  // Update auth.js cache paths so banner updates fast
  try {
    localStorage.setItem(AVATAR_LS_PREFIX + user.uid, url);
  } catch {}

  try {
    window.__avatarCache?.set?.(user.uid, url);
  } catch {}
}

function renderAvatarGrid(user, profile) {
  avatarGrid.innerHTML = "";

  const batchSeed = String(profile.avatarBatchSeed || "");
  const currentUrl = profile?.avatarUrl ? String(profile.avatarUrl) : "";

  for (let i = 0; i < BATCH_SIZE; i++) {
    const style = styleForIndex(i);
    const seed = seedForIndex(batchSeed, i);
    const url = dicebearUrl(style, seed);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "avatar-tile";
    btn.title = `Avatar ${i + 1}`;
    btn.dataset.url = url;

    if (url === currentUrl) btn.classList.add("selected");

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = `Avatar ${i + 1}`;
    img.src = url;

    btn.appendChild(img);

    btn.addEventListener("click", async () => {
      const u = auth.currentUser;
      if (!u) return;

      try {
        setStatus("Saving avatar...");
        btn.disabled = true;

        await saveAvatarSelection(u, { style, index: i, seed, url });

        avatarImg.src = url;
        clearSelectedTiles();
        btn.classList.add("selected");

        setStatus("Avatar updated.");
        setTimeout(() => setStatus(""), 1200);
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
    window.location.href = "/";
  } catch (e) {
    console.error("[account.js] sign out failed:", e);
    setStatus("Sign out failed.");
  }
});

// ---- Auth gating ----
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("/");
    return;
  }

  try {
    setStatus("Loading account...");
    const profile = await ensureUserDoc(user);

    emailText.textContent = user.email || profile?.email || "—";
    usernameText.textContent = profile?.username || "—";

    const url = pickAvatarUrl(user, profile);
    avatarImg.src = url;

    renderAvatarGrid(user, profile);

    // ensure selection highlight correct even if profile.avatarUrl was set previously
    if (profile?.avatarUrl) markSelectedByUrl(String(profile.avatarUrl));

    setStatus("");
  } catch (e) {
    console.error("[account.js] load failed:", e);
    setStatus("Could not load account data.");
  }
});