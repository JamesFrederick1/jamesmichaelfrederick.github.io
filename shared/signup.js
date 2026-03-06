// /shared/signup.js
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  runTransaction,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { auth, firestore, FIRESTORE_DB_CANDIDATES } from "/shared/firebase.js";

const ASSETS = { eye: "/files/eye.svg", eyeOff: "/files/eye-off.svg" };

let injected = false;
let wired = false;
let root = null;
let modalEl = null;

function ensureCss() {
  const href = "/shared/auth.css";
  const exists = [...document.querySelectorAll('link[rel="stylesheet"]')].some(
    (l) => (l.getAttribute("href") || "") === href
  );
  if (!exists) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

function resetUI() {
  setMsg("");
  const overlay = q("#su_successOverlay");
  const successMsg = q("#su_successMsg");
  if (overlay) overlay.style.display = "none";
  if (successMsg) successMsg.textContent = "";

  const emailInput = q("#su_email");
  const usernameInput = q("#su_username");
  const pwInput = q("#su_password");
  const pw2Input = q("#su_confirmPassword");
  if (emailInput) emailInput.value = "";
  if (usernameInput) usernameInput.value = "";
  if (pwInput) pwInput.value = "";
  if (pw2Input) pw2Input.value = "";

  const eye = q("#su_togglePw");
  if (pwInput) pwInput.type = "password";
  if (eye) eye.src = ASSETS.eye;
}

function q(sel) { return root ? root.querySelector(sel) : null; }

function setMsg(text, kind = "") {
  const el = q("#su_msg");
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("error", "success");
  if (kind) el.classList.add(kind);
}

function normalizeUsername(u) { return (u || "").trim().toLowerCase(); }

const RESERVED = new Set(["admin","support","staff","root","system","moderator","login","signup","api","settings"]);

function usernamePolicy(u) {
  if (u.length < 3 || u.length > 20) return "Username must be 3–20 characters.";
  if (!/^[\x00-\x7F]+$/.test(u)) return "Username must be ASCII only.";
  if (/\s/.test(u)) return "Username cannot contain spaces.";
  if (!/^[a-z0-9_]+$/.test(u)) return "Username can only contain a–z, 0–9, underscore (_).";
  if (!/^[a-z]/.test(u)) return "Username must start with a letter.";
  if (u.includes("__")) return "Username cannot contain consecutive underscores (__).";
  if (RESERVED.has(u)) return "That username is reserved.";
  if (u.includes("@")) return "Username cannot look like an email.";
  if (/^\d+$/.test(u)) return "Username cannot be all digits.";
  return null;
}

function countClasses(pw) {
  let c = 0;
  if (/[a-z]/.test(pw)) c++;
  if (/[A-Z]/.test(pw)) c++;
  if (/[0-9]/.test(pw)) c++;
  if (/[^A-Za-z0-9]/.test(pw)) c++;
  return c;
}

function passwordPolicy(pw, username, email) {
  if (pw.length < 12 || pw.length > 72) return "Password must be 12–72 characters.";
  if (countClasses(pw) < 2) return "Password must include at least 2 types (lower/upper/number/symbol).";
  if (/(.)\1\1/.test(pw)) return "Password cannot contain 3 identical characters in a row.";
  const pwLower = pw.toLowerCase();
  if (username && pwLower.includes(username)) return "Password cannot contain your username.";
  const local = (email || "").split("@")[0]?.toLowerCase() || "";
  if (local && pwLower.includes(local)) return "Password cannot contain your email name.";
  return null;
}

// Timeout wrapper so NOTHING can hang forever
function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function ensureSignupInjected() {
  if (injected) return;

  ensureCss();

  // If modal already exists on page, use it
  const existingModal = document.querySelector("#signupModal");
  const existingBtn = document.querySelector("#su_signupBtn");
  if (existingModal && existingBtn) {
    root = document;
    modalEl = existingModal;
    injected = true;
    wireHandlers();
    return;
  }

  // Otherwise inject shared modal
  const res = await fetch("/shared/signup-modal.html", { cache: "no-store" });
  if (!res.ok) throw new Error(`signup-modal.html fetch failed: ${res.status}`);

  const wrap = document.createElement("div");
  wrap.innerHTML = await res.text();
  document.body.appendChild(wrap);

  root = wrap;
  modalEl = q("#signupModal") || q(".modal");
  if (!modalEl) throw new Error("[signup.js] Could not find #signupModal.");

  injected = true;
  wireHandlers();
}

export function openSignup() {
  if (!modalEl) return;

  // ✅ tell banner "auth overlay is open" (treat signup like login)
  window.__authOverlayOpen = "signup";
  window.dispatchEvent(new Event("modal:open"));

  resetUI();
  modalEl.style.display = "flex";
  document.body.style.overflow = "hidden";
  document.body.classList.add("modal-open");
  document.documentElement.style.overflow = "hidden";
}
export function closeSignup() {
  if (!modalEl) return;

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  modalEl.style.display = "none";
  document.body.classList.remove("modal-open");
  resetUI();

  // ✅ tell banner "auth overlay closed"
  window.__authOverlayOpen = null;
  window.dispatchEvent(new Event("modal:close"));
}

function mapError(e) {
  const code = e?.code || "";
  const msg = String(e?.message || "");

  if (e?.message === "USERNAME_TAKEN") return "Username is already taken.";
  if (code === "auth/email-already-in-use") return "Email is already in use.";
  if (code === "auth/invalid-email") return "Invalid email.";
  if (code === "auth/weak-password") return "Password is too weak.";

  if (code === "permission-denied") return "Firestore rules blocked signup (permission-denied).";
  if (/database/i.test(msg) && /does not exist/i.test(msg)) return "Firestore databaseId mismatch (no such database).";
  if (msg === "firestore-timeout") return "Firestore is not responding (timeout).";

  return code || msg || "Signup failed.";
}

async function writeProfileToFirestore(user, email, username) {
  let lastErr = null;

  for (const dbId of FIRESTORE_DB_CANDIDATES) {
    const db = firestore(dbId);

    try {
      // Reserve username atomically
      await withTimeout(
        runTransaction(db, async (tx) => {
          const ref = doc(db, "usernames", username);
          const snap = await tx.get(ref);
          if (snap.exists()) throw new Error("USERNAME_TAKEN");
          tx.set(ref, { uid: user.uid, createdAt: serverTimestamp() });
        }),
        4000,
        "firestore-timeout"
      );

      await withTimeout(
        setDoc(
          doc(db, "users", user.uid),
          { uid: user.uid, email, username, createdAt: serverTimestamp() },
          { merge: true }
        ),
        4000,
        "firestore-timeout"
      );

      console.warn("[signup.js] Firestore OK using databaseId:", dbId);
      return;
    } catch (e) {
      lastErr = e;

      if (e?.message === "USERNAME_TAKEN") throw e;

      const m = String(e?.message || "");
      if (/does not exist/i.test(m) || e?.code === "not-found" || e?.code === "failed-precondition") {
        continue;
      }

      throw e;
    }
  }

  throw lastErr || new Error("Firestore write failed.");
}

function wireHandlers() {
  if (wired) return;

  const signupBtn = q("#su_signupBtn");
  const closeBtn = q(".close");
  const okBtn = q("#su_okBtn");

  const emailInput = q("#su_email");
  const usernameInput = q("#su_username");
  const pwInput = q("#su_password");
  const pw2Input = q("#su_confirmPassword");
  const eye = q("#su_togglePw");

  if (!signupBtn || !emailInput || !usernameInput || !pwInput || !pw2Input) {
    throw new Error("[signup.js] Missing required signup elements (ids must be su_*).");
  }

  closeBtn?.addEventListener("click", closeSignup);
  okBtn?.addEventListener("click", closeSignup);
  modalEl?.addEventListener("click", (e) => { if (e.target === modalEl) closeSignup(); });

  if (eye) {
    eye.src = ASSETS.eye;
    eye.addEventListener("pointerdown", (e) => e.preventDefault());
    eye.addEventListener("click", () => {
      const hidden = pwInput.type === "password";
      pwInput.type = hidden ? "text" : "password";
      eye.src = hidden ? ASSETS.eyeOff : ASSETS.eye;
      pwInput.focus();
    });
  }

  let inFlight = false;

  signupBtn.addEventListener("click", async () => {
    if (inFlight) return;
    setMsg("");

    const email = (emailInput.value || "").trim();
    const username = normalizeUsername(usernameInput.value || "");
    const pw = pwInput.value || "";
    const pw2 = pw2Input.value || "";

    const uErr = usernamePolicy(username);
    if (uErr) return setMsg(uErr, "error");
    if (!email) return setMsg("Enter an email.", "error");
    if (pw !== pw2) return setMsg("Passwords do not match.", "error");

    const pErr = passwordPolicy(pw, username, email);
    if (pErr) return setMsg(pErr, "error");

    inFlight = true;
    signupBtn.disabled = true;

    let cred = null;
    window.__signupInProgress = true;

    try {
      setMsg("Creating account...");

      cred = await withTimeout(
        createUserWithEmailAndPassword(auth, email, pw),
        8000,
        "auth-timeout"
      );

      await writeProfileToFirestore(cred.user, email, username);

      await withTimeout(sendEmailVerification(cred.user), 8000, "verify-timeout");

      await signOut(auth);

      const text = "Account created. Verification email sent. Check spam/promotions.";
      setMsg(text, "success");

      const overlay = q("#su_successOverlay");
      const successMsg = q("#su_successMsg");
      if (overlay && successMsg) {
        overlay.style.display = "flex";
        successMsg.textContent = text;
      }
    } catch (e) {
      console.error("[signup.js] Signup failed:", e);
      setMsg(mapError(e), "error");

      if (cred?.user) {
        try { await deleteUser(cred.user); } catch {}
      }
    } finally {
      window.__signupInProgress = false;

      const overlay = q("#su_successOverlay");
      const overlayShowing = overlay && overlay.style.display === "flex";
      if (!overlayShowing) {
        inFlight = false;
        signupBtn.disabled = false;
      }
    }
  });

  wired = true;
}

export default null;