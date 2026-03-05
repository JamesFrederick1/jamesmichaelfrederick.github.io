// /shared/signup.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// --- Firebase (singleton) ---
const firebaseConfig = {
  apiKey: "AIzaSyDoXwHKUgWeBv7rmnLZACzlVoEcXKyZEnI",
  authDomain: "sign-up-e2a6c.firebaseapp.com",
  projectId: "sign-up-e2a6c",
  storageBucket: "sign-up-e2a6c.firebasestorage.app",
  messagingSenderId: "1014249305987",
  appId: "1:1014249305987:web:42bb551d2b879ed39ba8b6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "default");

// --- Assets ---
const ASSETS = {
  eye: "/files/eye.svg",
  eyeOff: "/files/eye-off.svg",
  login: "/files/login.png",
};

// --- Injected DOM refs (kept private to avoid collisions) ---
let injected = false;
let wired = false;
let wrapEl = null;   // wrapper div appended to body
let modalEl = null;  // #signupModal overlay inside wrapper

function setModalOpenState(isOpen) {
  document.body.classList.toggle("modal-open", isOpen);
  window.dispatchEvent(new Event(isOpen ? "modal:open" : "modal:close"));
}

// Ensure signup CSS is available on every page
function ensureSignupCss() {
  const href = "/shared/auth.css";
  const exists = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some((l) => (l.getAttribute("href") || "") === href);
  if (exists) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

// Query ONLY inside injected wrapper
function q(sel) {
  return wrapEl ? wrapEl.querySelector(sel) : null;
}

function setMsg(t) {
  const msg = q("#msg");
  if (msg) msg.textContent = t || "";
}

function resetSignupModal() {
  const overlay = q("#successOverlay");
  const successMsg = q("#successMsg");

  if (overlay) overlay.style.display = "none";
  if (successMsg) successMsg.textContent = "";

  setMsg("");

  const emailInput = q("#email");
  const usernameInput = q("#username");
  const pwInput = q("#password");
  const pw2Input = q("#confirmPassword");

  if (emailInput) emailInput.value = "";
  if (usernameInput) usernameInput.value = "";
  if (pwInput) pwInput.value = "";
  if (pw2Input) pw2Input.value = "";
}

// --- PUBLIC API ---
export async function ensureSignupInjected() {
  if (injected) return;

  ensureSignupCss();

  // Inject markup as a fragment (NO <html> <head> <body>)
  wrapEl = document.createElement("div");
  wrapEl.innerHTML = `
    <div id="signupModal" class="modal" style="display:none;">
      <div class="modal-content animate">
        <div class="login-box">
          <h1>Sign up</h1>
          <span class="close" title="Close">&#10005;</span>
          <img src="${ASSETS.login}" class="avatar" />

          <form class="login-form" action="#" method="post" autocomplete="off">
            <label class="email">
              <input
                id="email"
                type="email"
                name="email"
                placeholder="Enter an email"
                spellcheck="false"
                autocapitalize="off"
                autocorrect="off"
                autocomplete="email"
                required
              />
            </label>

            <label class="username">
              <input
                id="username"
                type="text"
                name="username"
                placeholder="Enter a username"
                spellcheck="false"
                autocapitalize="off"
                autocorrect="off"
                required
              />
            </label>

            <label class="password-field">
              <input
                id="password"
                type="password"
                name="password"
                placeholder="Enter a password"
                spellcheck="false"
                autocorrect="off"
                required
              />
              <img
                id="togglePw"
                class="eye-icon"
                src="${ASSETS.eye}"
                alt="Toggle password visibility"
              />
            </label>

            <label class="password-field">
              <input
                id="confirmPassword"
                type="password"
                name="confirmPassword"
                placeholder="Confirm password"
                spellcheck="false"
                autocorrect="off"
                required
              />
            </label>

            <button type="button" id="signupBtn" class="loginbtn">Sign up</button>

            <p id="msg"></p>

            <div class="signup-link">
              Have an account?
              <a href="/signin.html?open=1" id="openSigninLink">Sign in</a>
            </div>
          </form>

          <div id="successOverlay" class="success-overlay" style="display:none;">
            <div class="success-card">
              <p id="successMsg" class="success-text"></p>
              <button type="button" id="okBtn" class="loginbtn okbtn">OK</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapEl);

  modalEl = q("#signupModal");
  if (!modalEl) {
    console.error("[signup.js] Could not find #signupModal after injection.");
    return;
  }

  injected = true;
  wireHandlers();
}

export function openSignup() {
  if (!modalEl) return;
  modalEl.style.display = "flex";
  setModalOpenState(true);
  document.body.style.overflow = "hidden";
}

export function closeSignup() {
  if (!modalEl) return;
  modalEl.style.display = "none";
  document.body.style.overflow = "";
  setModalOpenState(false);
  resetSignupModal();
}

// --- Policies ---
let COMMON_PW = new Set();

async function loadCommonPasswordsOnce() {
  if (COMMON_PW.size) return;
  try {
    const res = await fetch("/pswd.txt", { cache: "no-store" });
    if (!res.ok) return;
    const text = await res.text();
    COMMON_PW = new Set(
      text.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
  } catch {
    COMMON_PW = new Set();
  }
}

const RESERVED = new Set([
  "admin", "support", "staff", "root", "system", "moderator", "login", "signup", "api", "settings",
]);

function normalizeUsername(u) {
  return (u || "").trim().toLowerCase();
}

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
  const u = (username || "").toLowerCase();
  if (u && pwLower.includes(u)) return "Password cannot contain your username.";

  const local = (email || "").split("@")[0]?.toLowerCase() || "";
  if (local && pwLower.includes(local)) return "Password cannot contain your email name.";

  if (COMMON_PW.size > 0 && COMMON_PW.has(pwLower)) return "Password is too common.";

  return null;
}

// --- Wiring ---
function wireHandlers() {
  if (wired) return;
  if (!modalEl) return;

  const closeBtn = q(".close");
  const okBtn = q("#okBtn");
  const signupBtn = q("#signupBtn");

  const emailInput = q("#email");
  const usernameInput = q("#username");
  const pwInput = q("#password");
  const pw2Input = q("#confirmPassword");

  const eye = q("#togglePw");
  const openSigninLink = q("#openSigninLink");

  if (!closeBtn || !signupBtn || !emailInput || !usernameInput || !pwInput || !pw2Input) {
    console.error("[signup.js] Missing expected IDs inside injected signup modal.");
    return;
  }

  // Close
  closeBtn.addEventListener("click", closeSignup);
  okBtn?.addEventListener("click", closeSignup);

  // Click outside closes
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeSignup();
  });

  // Eye toggle (caret preserved)
  if (eye) {
    eye.addEventListener("pointerdown", (e) => e.preventDefault());
    eye.addEventListener("click", () => {
      const start = pwInput.selectionStart;
      const end = pwInput.selectionEnd;
      const scrollPos = pwInput.scrollLeft;

      const hidden = pwInput.type === "password";
      pwInput.type = hidden ? "text" : "password";
      eye.src = hidden ? ASSETS.eyeOff : ASSETS.eye;

      requestAnimationFrame(() => {
        pwInput.focus({ preventScroll: true });
        pwInput.setSelectionRange(start, end);
        pwInput.scrollLeft = scrollPos;
      });
    });
  }

  // "Sign in" link should open signin modal if auth.js provided it
  if (openSigninLink) {
    openSigninLink.addEventListener("click", (e) => {
      if (typeof window.__authOpenSignin === "function") {
        e.preventDefault();
        closeSignup();
        window.__authOpenSignin();
      }
      // else fallback: normal navigation
    });
  }

  // Signup action
  let inFlight = false;

  signupBtn.addEventListener("click", async () => {
    if (inFlight) return;

    setMsg("");
    await loadCommonPasswordsOnce();

    const email = (emailInput.value || "").trim();
    const username = normalizeUsername(usernameInput.value || "");
    const pw = pwInput.value || "";
    const pw2 = pw2Input.value || "";

    const uErr = usernamePolicy(username);
    if (uErr) return setMsg(`Username problems: ${uErr}`);

    if (pw !== pw2) return setMsg("Password problems: Passwords do not match.");

    const pErr = passwordPolicy(pw, username, email);
    if (pErr) return setMsg(`Password problems: ${pErr}`);

    inFlight = true;
    signupBtn.disabled = true;

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);

      // Reserve username atomically
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, "usernames", username);
          const snap = await tx.get(ref);
          if (snap.exists()) throw new Error("USERNAME_TAKEN");
          tx.set(ref, { uid: cred.user.uid, createdAt: serverTimestamp() });
        });
      } catch (e) {
        try { await deleteUser(cred.user); } catch {}
        if (e?.message === "USERNAME_TAKEN") setMsg("Username problems: Username is already taken.");
        else setMsg("Username problems: Could not reserve username right now. Try again.");
        return;
      }

      await sendEmailVerification(cred.user);
      await signOut(auth);

      const text = "Account created. Verification email sent. Check spam/promotions.";
      setMsg(text);

      const overlay = q("#successOverlay");
      const successMsg = q("#successMsg");
      if (overlay && successMsg) {
        overlay.style.display = "flex";
        successMsg.textContent = text;
      }
    } catch (e) {
      console.error("[signup.js] Signup failed:", e);
      setMsg(e?.code || e?.message || "Signup failed.");
    } finally {
      const overlay = q("#successOverlay");
      const overlayShowing = overlay && overlay.style.display === "flex";
      if (!overlayShowing) {
        inFlight = false;
        signupBtn.disabled = false;
      }
    }
  });

  wired = true;
}