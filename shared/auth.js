// /shared/auth.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { ensureSignupInjected, openSignup } from "/shared/signup.js";

import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

// IMPORTANT: DO NOT pass "default"
const db = getFirestore(app);

const ASSETS = {
  user: "/files/user.svg",
  eye: "/files/eye.svg",
  eyeOff: "/files/eye-off.svg",
};

let signinInjected = false;
let signinWired = false;

let signinRoot = null;
let signinEl = null;

function setModalOpenState(isOpen) {
  document.body.classList.toggle("modal-open", isOpen);
  window.dispatchEvent(new Event(isOpen ? "modal:open" : "modal:close"));
}

async function ensureSigninInjected() {
  if (signinInjected) return;

  const res = await fetch("/shared/signin-modal.html", { cache: "no-store" });
  if (!res.ok) throw new Error(`signin-modal.html fetch failed: ${res.status}`);

  const wrap = document.createElement("div");
  wrap.innerHTML = await res.text();
  document.body.appendChild(wrap);

  signinRoot = wrap;
  signinEl = signinRoot.querySelector("#id01");
  if (!signinEl) throw new Error("Injected signin modal missing #id01");

  signinInjected = true;

  await ensureSignupInjected();
  wireSigninHandlers();
}

function q(sel) {
  return signinRoot ? signinRoot.querySelector(sel) : null;
}

function setMsg(t) {
  const msg = q("#msg");
  if (msg) msg.textContent = t || "";
}

function clearSigninInputs() {
  const emailInput = q("#email");
  const pwInput = q("#password");
  const rememberMe = q("#rememberMe");

  if (emailInput) emailInput.value = "";
  if (pwInput) pwInput.value = "";
  if (rememberMe) rememberMe.checked = false;

  if (pwInput) pwInput.type = "password";
  const eye = q("#pwEye");
  if (eye) eye.src = ASSETS.eye;

  setMsg("");
}

function openSignin() {
  if (!signinEl) return;
  signinEl.style.display = "flex";
  setModalOpenState(true);
  document.body.style.overflow = "hidden";
}

function closeSignin({ clear = true } = {}) {
  if (signinEl) signinEl.style.display = "none";
  setModalOpenState(false);
  document.body.style.overflow = "";
  if (clear) clearSigninInputs();
}

function wireSigninHandlers() {
  if (signinWired) return;

  const closeX = q(".close");
  const emailInput = q("#email");
  const pwInput = q("#password");
  const rememberMe = q("#rememberMe");
  const signinBtn = q("#signinBtn");
  const forgotLink = q("#forgotPwLink");
  const eye = q("#pwEye");
  const openSignupLink = q("#openSignupLink");

  if (!closeX || !emailInput || !pwInput || !rememberMe || !signinBtn) {
    throw new Error("Signin modal missing required elements.");
  }

  // THIS is what keeps it as a popup (no navigation)
  if (openSignupLink) {
    openSignupLink.addEventListener("click", (e) => {
      e.preventDefault();
      closeSignin({ clear: true });
      openSignup();
    });
  }

  closeX.addEventListener("click", () => closeSignin({ clear: true }));

  signinEl.addEventListener("click", (e) => {
    if (e.target === signinEl) closeSignin({ clear: true });
  });

  if (eye) {
    eye.src = ASSETS.eye;
    eye.addEventListener("mousedown", (e) => e.preventDefault());
    eye.addEventListener("click", () => {
      const isHidden = pwInput.type === "password";
      pwInput.type = isHidden ? "text" : "password";
      eye.src = isHidden ? ASSETS.eyeOff : ASSETS.eye;
      pwInput.focus();
    });
  }

  if (forgotLink) {
    forgotLink.addEventListener("click", async (e) => {
      e.preventDefault();
      setMsg("");

      const email = (emailInput.value || "").trim();
      if (!email) return setMsg("Enter your email above first.");

      try {
        await sendPasswordResetEmail(auth, email);
        setMsg("Password reset email sent. Check spam.");
      } catch (err) {
        const code = err?.code || "";
        if (code === "auth/user-not-found") setMsg("No account found for that email.");
        else if (code === "auth/invalid-email") setMsg("Invalid email.");
        else setMsg("Could not send reset email.");
      }
    });
  }

  let inFlight = false;

  async function doSignIn() {
    if (inFlight) return;
    setMsg("");

    const email = (emailInput.value || "").trim();
    const pw = pwInput.value || "";

    if (!email) return setMsg("Enter your email.");
    if (!pw) return setMsg("Enter your password.");

    inFlight = true;
    signinBtn.disabled = true;

    try {
      await setPersistence(
        auth,
        rememberMe.checked ? browserLocalPersistence : browserSessionPersistence
      );

      const cred = await signInWithEmailAndPassword(auth, email, pw);

      if (!cred.user.emailVerified) {
        await signOut(auth);
        setMsg("Please verify your email before signing in. (Check spam.)");
        return;
      }

      closeSignin({ clear: true });
    } catch (e) {
      const code = e?.code || "";
      if (code === "auth/invalid-email") setMsg("Invalid email.");
      else if (code === "auth/user-not-found") setMsg("No account found for that email.");
      else if (code === "auth/wrong-password" || code === "auth/invalid-credential")
        setMsg("Incorrect email or password.");
      else if (code === "auth/too-many-requests") setMsg("Too many attempts. Try again later.");
      else setMsg(code || "Sign-in failed.");
    } finally {
      inFlight = false;
      signinBtn.disabled = false;
    }
  }

  signinBtn.addEventListener("click", doSignIn);
  pwInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doSignIn();
    }
  });

  signinWired = true;
}

function dicebearUrlFromSeed(seed) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

async function resolveAvatarUrl(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const d = snap.data() || {};
      if (d.avatarUrl) return String(d.avatarUrl);
      if (d.avatarSeed) return dicebearUrlFromSeed(String(d.avatarSeed));
    }
  } catch (e) {
    console.warn("[auth.js] avatar read failed:", e);
  }
  const seed = user.email ? `u:${user.email.toLowerCase()}` : `u:${user.uid}`;
  return dicebearUrlFromSeed(seed);
}

export async function initAuthButton(authAreaEl) {
  if (!authAreaEl) return;

  await ensureSigninInjected();

  if (!authAreaEl.dataset.authWired) {
    authAreaEl.addEventListener("click", (e) => {
      if (authAreaEl.dataset.authState === "out") {
        if (e.target.closest("#authLoginBtn")) openSignin();
        return;
      }
      if (authAreaEl.dataset.authState === "in") {
        if (e.target.closest("#authAccountBtn")) window.location.href = "/account/";
      }
    });
    authAreaEl.dataset.authWired = "1";
  }

  function renderLoggedOut() {
    authAreaEl.dataset.authState = "out";
    authAreaEl.innerHTML = `<button type="button" class="auth-btn" id="authLoginBtn">Login</button>`;
  }

  async function renderLoggedIn(user) {
    authAreaEl.dataset.authState = "in";
    authAreaEl.innerHTML = `
      <button type="button" class="auth-icon-btn" id="authAccountBtn" title="${user.email || ""}">
        <img id="authAvatar" class="auth-icon" alt="Account">
      </button>
    `;

    const img = authAreaEl.querySelector("#authAvatar");
    if (!img) return;

    img.src = ASSETS.user;
    img.onerror = () => (img.src = ASSETS.user);

    img.src = await resolveAvatarUrl(user);
  }

  renderLoggedOut();

  if (!window.__authListenerAttached) {
    window.__authListenerAttached = true;
    onAuthStateChanged(auth, (user) => {
      if (user) renderLoggedIn(user);
      else renderLoggedOut();
    });
  }
}