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

import { ensureSignupInjected, openSignup /* closeSignup optional */ } from "/shared/signup.js";

import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * Fix for: Cannot access 'app' before initialization
 * => init firebase app FIRST, then db.
 */

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
const db = getFirestore(app); // default db

const ASSETS = {
  user: "/files/user.svg",
  eye: "/files/eye.svg",
  eyeOff: "/files/eye-off.svg",
  login: "/files/login.png",
};

let signinInjected = false;
let signinWired = false;

// injected signin modal refs (avoid ID collisions)
let signinRoot = null; // wrapper appended to body
let signinEl = null;   // #id01 inside wrapper

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

  if (!signinEl) {
    console.error("Injected signin modal not found (missing #id01 inside /shared/signin-modal.html).");
    return;
  }

  signinInjected = true;

  // ensure signup modal exists too (your signup.js should inject it)
  await ensureSignupInjected();

  wireSigninHandlers();
}

// query only inside injected signin modal
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

  // reset pw type + eye
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
  if (!signinEl) return;

  const closeX = q(".close");
  const emailInput = q("#email");
  const pwInput = q("#password");
  const rememberMe = q("#rememberMe");
  const signinBtn = q("#signinBtn");
  const forgotLink = q("#forgotPwLink");
  const eye = q("#pwEye");

  if (!closeX || !emailInput || !pwInput || !rememberMe || !signinBtn) {
    console.error("Signin modal missing expected elements. Check ids in /shared/signin-modal.html");
    return;
  }

  // IMPORTANT: in signin-modal.html set this:
  // <a href="#" id="openSignupLink">account?</a>  (or whatever text)
  const openSignupLink = q("#openSignupLink");
  if (openSignupLink) {
    openSignupLink.addEventListener("click", (e) => {
      e.preventDefault();
      closeSignin({ clear: true });
      openSignup();
    });
  }

  // close button
  closeX.addEventListener("click", () => closeSignin({ clear: true }));

  // click outside closes
  signinEl.addEventListener("click", (e) => {
    if (e.target === signinEl) closeSignin({ clear: true });
  });

  // eye toggle
  if (eye) {
    eye.src = ASSETS.eye;
    eye.addEventListener("mousedown", (e) => e.preventDefault());
    eye.addEventListener("click", () => {
      const start = pwInput.selectionStart;
      const end = pwInput.selectionEnd;
      const scrollPos = pwInput.scrollLeft;

      const isHidden = pwInput.type === "password";
      pwInput.type = isHidden ? "text" : "password";
      eye.src = isHidden ? ASSETS.eyeOff : ASSETS.eye;

      requestAnimationFrame(() => {
        pwInput.focus({ preventScroll: true });
        pwInput.setSelectionRange(start, end);
        pwInput.scrollLeft = scrollPos;
      });
    });
  }

  // forgot password
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

  // sign in
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

// PUBLIC: called by banner.js after banner.html mounted
export async function initAuthButton(authAreaEl) {
  if (!authAreaEl) return;

  await ensureSigninInjected();

  // stable click handler
  if (!authAreaEl.dataset.authWired) {
    authAreaEl.addEventListener("click", (e) => {
      if (authAreaEl.dataset.authState === "out") {
        if (e.target.closest("#authLoginBtn")) openSignin();
        return;
      }

      if (authAreaEl.dataset.authState === "in") {
        if (e.target.closest("#authAccountBtn")) {
          window.location.href = "/account/";
        }
      }
    });

    authAreaEl.dataset.authWired = "1";
  }

  function renderLoggedOut() {
    authAreaEl.dataset.authState = "out";
    authAreaEl.innerHTML = `
      <button type="button" class="auth-btn" id="authLoginBtn">Login</button>
    `;
  }

  async function renderLoggedIn(user) {
    const p = (window.location.pathname || "").toLowerCase();
    const onAccount = p === "/account/" || p.startsWith("/account/");

    authAreaEl.dataset.authState = "in";
    authAreaEl.innerHTML = `
      <button
        type="button"
        class="auth-icon-btn ${onAccount ? "active" : ""}"
        id="authAccountBtn"
        title="${user.email}"
      >
        <img id="authAvatar" class="auth-icon" alt="Account">
      </button>
    `;

    // Default fallback icon immediately (so no “blank” while firestore loads)
    const img = authAreaEl.querySelector("#authAvatar");
    if (img) img.src = ASSETS.user;

    // Pull avatar from Firestore (users/{uid})
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const data = snap.data() || {};
        const seed = data.avatarSeed;
        const gender = data.avatarGender; // optional

        if (seed) {
          const qs = new URLSearchParams({
            seed: String(seed),
            size: "64",
          });

          // OPTIONAL “one line change” support:
          // if you store avatarGender as "male"/"female", keep this:
          if (gender) qs.set("gender", String(gender));

          const url = `https://api.dicebear.com/9.x/adventurer/png?${qs.toString()}`;
          if (img) img.src = url;
        }
      }
    } catch (err) {
      console.warn("[auth.js] Could not load avatar from Firestore:", err);
    }
  }

  // always render something immediately
  renderLoggedOut();

  // let other pages open signin without importing auth.js
  window.__authOpenSignin = () => openSignin();
  window.__authCloseSignin = () => closeSignin({ clear: true });
  window.__authOpenSignup = () => openSignup();

  onAuthStateChanged(auth, (user) => {
    if (user) renderLoggedIn(user);
    else renderLoggedOut();
  });
}