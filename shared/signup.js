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
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoXwHKUgWeBv7rmnLZACzlVoEcXKyZEnI",
  authDomain: "sign-up-e2a6c.firebaseapp.com",
  projectId: "sign-up-e2a6c",
  storageBucket: "sign-up-e2a6c.firebasestorage.app",
  messagingSenderId: "1014249305987",
  appId: "1:1014249305987:web:42bb551d2b879ed39ba8b6",
};

// IMPORTANT: use a NAMED app so we never accidentally reuse some other default app
const APP_NAME = "main";
const app = getApps().some((a) => a.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(firebaseConfig, APP_NAME);

const auth = getAuth(app);

// IMPORTANT: DO NOT pass "default" here. Just use getFirestore(app)
const db = getFirestore(app);

const ASSETS = {
  eye: "/files/eye.svg",
  eyeOff: "/files/eye-off.svg",
  login: "/files/login.png",
};

let injected = false;
let wired = false;
let wrapEl = null;
let modalEl = null;

function setModalOpenState(isOpen) {
  document.body.classList.toggle("modal-open", isOpen);
  window.dispatchEvent(new Event(isOpen ? "modal:open" : "modal:close"));
}

function ensureCss() {
  const href = "/shared/auth.css";
  const exists = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .some((l) => (l.getAttribute("href") || "") === href);
  if (exists) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function q(sel) {
  return wrapEl ? wrapEl.querySelector(sel) : null;
}

function setMsg(t) {
  const msg = q("#su_msg");
  if (msg) msg.textContent = t || "";
}

function resetSignupModal() {
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

  if (pwInput) pwInput.type = "password";
  const eye = q("#su_togglePw");
  if (eye) eye.src = ASSETS.eye;
}

export async function ensureSignupInjected() {
  if (injected) return;

  ensureCss();

  wrapEl = document.createElement("div");
  wrapEl.innerHTML = `
    <div id="signupModal" class="modal" style="display:none;">
      <div class="modal-content animate">
        <div class="login-box">
          <h1>Sign up</h1>
          <span class="close" title="Close">&#10005;</span>
          <img src="${ASSETS.login}" class="avatar" alt="Avatar" loading="eager" decoding="async" />

          <form class="login-form" action="#" method="post" autocomplete="off">
            <label class="email">
              <input id="su_email" type="email" name="email" placeholder="Enter an email"
                spellcheck="false" autocapitalize="off" autocorrect="off" autocomplete="email" required />
            </label>

            <label class="username">
              <input id="su_username" type="text" name="username" placeholder="Enter a username"
                spellcheck="false" autocapitalize="off" autocorrect="off" required />
            </label>

            <label class="password-field">
              <input id="su_password" type="password" name="password" placeholder="Enter a password"
                spellcheck="false" autocorrect="off" required />
              <img id="su_togglePw" class="eye-icon" src="${ASSETS.eye}" alt="Toggle password visibility" />
            </label>

            <label class="password-field">
              <input id="su_confirmPassword" type="password" name="confirmPassword" placeholder="Confirm password"
                spellcheck="false" autocorrect="off" required />
            </label>

            <button type="button" id="su_signupBtn" class="loginbtn">Sign up</button>
            <p id="su_msg"></p>
          </form>

          <div id="su_successOverlay" class="success-overlay" style="display:none;">
            <div class="success-card">
              <p id="su_successMsg" class="success-text"></p>
              <button type="button" id="su_okBtn" class="loginbtn okbtn">OK</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapEl);

  modalEl = q("#signupModal");
  if (!modalEl) throw new Error("[signup.js] Could not find #signupModal after injection.");

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

const RESERVED = new Set(["admin","support","staff","root","system","moderator","login","signup","api","settings"]);
function normalizeUsername(u) { return (u || "").trim().toLowerCase(); }

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

function makeAvatarSeed(usernameLower) {
  return `u:${usernameLower}`;
}
function makeAvatarUrl(seed) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function wireHandlers() {
  if (wired) return;

  const closeBtn = q(".close");
  const okBtn = q("#su_okBtn");
  const signupBtn = q("#su_signupBtn");

  const emailInput = q("#su_email");
  const usernameInput = q("#su_username");
  const pwInput = q("#su_password");
  const pw2Input = q("#su_confirmPassword");

  const eye = q("#su_togglePw");

  closeBtn?.addEventListener("click", closeSignup);
  okBtn?.addEventListener("click", closeSignup);

  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeSignup();
  });

  if (eye && pwInput) {
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

    const email = (emailInput?.value || "").trim();
    const username = normalizeUsername(usernameInput?.value || "");
    const pw = pwInput?.value || "";
    const pw2 = pw2Input?.value || "";

    const uErr = usernamePolicy(username);
    if (uErr) return setMsg(`Username problems: ${uErr}`);
    if (!email) return setMsg("Enter an email.");
    if (pw !== pw2) return setMsg("Password problems: Passwords do not match.");

    const pErr = passwordPolicy(pw, username, email);
    if (pErr) return setMsg(`Password problems: ${pErr}`);

    inFlight = true;
    signupBtn.disabled = true;

    let cred = null;

    try {
      cred = await createUserWithEmailAndPassword(auth, email, pw);

      // Reserve username atomically
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "usernames", username);
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error("USERNAME_TAKEN");
        tx.set(ref, { uid: cred.user.uid, createdAt: serverTimestamp() });
      });

      // Create users/{uid}
      const avatarSeed = makeAvatarSeed(username);
      const avatarUrl = makeAvatarUrl(avatarSeed);

      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          email,
          username,
          createdAt: serverTimestamp(),
          avatarSeed,
          avatarUrl,
        },
        { merge: true }
      );

      await sendEmailVerification(cred.user);
      await signOut(auth);

      const text = "Account created. Verification email sent. Check spam/promotions.";
      setMsg(text);

      const overlay = q("#su_successOverlay");
      const successMsg = q("#su_successMsg");
      if (overlay && successMsg) {
        overlay.style.display = "flex";
        successMsg.textContent = text;
      }
    } catch (e) {
      console.error("[signup.js] Signup failed:", e);

      if (e?.message === "USERNAME_TAKEN") setMsg("Username problems: Username is already taken.");
      else setMsg(e?.code || e?.message || "Signup failed.");

      // cleanup auth user if we created one but failed reservation/write
      if (cred?.user) {
        try { await deleteUser(cred.user); } catch {}
      }
    } finally {
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