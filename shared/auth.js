// /shared/auth.js
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { auth, firestore, FIRESTORE_DB_CANDIDATES } from "/shared/firebase.js";
import { ensureSignupInjected, openSignup } from "/shared/signup.js";

const ASSETS = {
  userMobile: "/files/user.svg",
  userLoggedIn: "/files/user-loggedin.svg",
  eye: "/files/eye.svg",
  eyeOff: "/files/eye-off.svg",
};

// ---------- Global state ----------
let signinInjected = false;
let signinWired = false;
let signinRoot = null;
let signinEl = null;

window.__authUser = null;
window.__authGetUser = () => window.__authUser;
window.__authModalOpen = window.__authModalOpen || false;

// AUTH READY FLAG: prevents initial “logged-out flash”
window.__authReady = window.__authReady || false;

window.__avatarCache = window.__avatarCache || new Map();
const AVATAR_LS_PREFIX = "avatarUrl:";

window.__authMounts = window.__authMounts || [];
window.__authGlobalListenerAttached = window.__authGlobalListenerAttached || false;

// ---------- Helpers ----------
function emitAuthState(user) {
  window.__authUser = user || null;
  window.dispatchEvent(new CustomEvent("auth:state", { detail: { user: window.__authUser } }));
}

function ensureAuthListener() {
  if (window.__authListenerAttached) return;
  window.__authListenerAttached = true;

  onAuthStateChanged(auth, (user) => {
    // first auth callback => auth is “ready”
    if (!window.__authReady) {
      window.__authReady = true;
      window.dispatchEvent(new Event("auth:ready"));
    }
    emitAuthState(user);
  });
}

function setModalOpenState(isOpen) {
  window.__authModalOpen = !!isOpen;
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

window.__authOpenSignin = async function () {
  await ensureSigninInjected();
  openSignin();
};

function withTimeout(promise, ms, label = "timeout") {
  let t;
  const timeout = new Promise((_, rej) => (t = setTimeout(() => rej(new Error(label)), ms)));
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function preloadImage(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    const t = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      finish(true);
    };
    img.onerror = () => {
      clearTimeout(t);
      finish(false);
    };
    img.src = url;
  });
}

function dicebearUrlFromSeed(seed) {
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
}

function isOnAccountPage() {
  const p = (window.location.pathname || "").toLowerCase();
  return p === "/account/" || p === "/account/index.html" || p.startsWith("/account/");
}

function computeAuthShouldBeActive(authState /* "out"|"in" */) {
  if (window.__authModalOpen) return true;
  if (authState === "in" && isOnAccountPage()) return true;
  return false;
}

function clearPageActiveTabs() {
  document.querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active").forEach((a) => {
    a.classList.remove("active");
  });
  const logo = document.querySelector(".navbar .logo a.active");
  if (logo) logo.classList.remove("active");
}

function restorePageActiveTabs() {
  if (typeof window.__bannerApplyActiveNav === "function") window.__bannerApplyActiveNav();
}

// ---------- Avatar cache ----------
function isPlaceholderIconUrl(url) {
  const u = String(url || "");
  return (
    u.includes("/files/user.svg") ||
    u.includes("/files/user-phone.svg") ||
    u.includes("/files/user-loggedin.svg") ||
    u === "" ||
    u === "null" ||
    u === "undefined"
  );
}

function getStoredAvatar(uid) {
  try {
    const v = localStorage.getItem(AVATAR_LS_PREFIX + uid) || "";
    if (isPlaceholderIconUrl(v)) {
      localStorage.removeItem(AVATAR_LS_PREFIX + uid);
      return "";
    }
    return v;
  } catch {
    return "";
  }
}

function setStoredAvatar(uid, url) {
  if (!uid) return;
  if (!url || isPlaceholderIconUrl(url)) return;
  try {
    localStorage.setItem(AVATAR_LS_PREFIX + uid, url);
  } catch {}
}

async function resolveAvatarUrl(user) {
  const mem = window.__avatarCache.get(user.uid);
  if (mem && !isPlaceholderIconUrl(mem)) return mem;

  const stored = getStoredAvatar(user.uid);
  if (stored) {
    window.__avatarCache.set(user.uid, stored);
    return stored;
  }

  for (const dbId of FIRESTORE_DB_CANDIDATES) {
    try {
      const db = firestore(dbId);
      const snap = await withTimeout(getDoc(doc(db, "users", user.uid)), 2500, "avatar-timeout");

      if (snap.exists()) {
        const d = snap.data() || {};

        if (d.avatarUrl) {
          const url = String(d.avatarUrl);
          if (!isPlaceholderIconUrl(url)) {
            window.__avatarCache.set(user.uid, url);
            setStoredAvatar(user.uid, url);
            return url;
          }
        }

        if (d.avatarSeed) {
          const url = dicebearUrlFromSeed(String(d.avatarSeed));
          window.__avatarCache.set(user.uid, url);
          setStoredAvatar(user.uid, url);
          return url;
        }
      }
      break;
    } catch (e) {
      const msg = String(e?.message || "");
      if (/does not exist/i.test(msg) || e?.code === "not-found" || e?.code === "failed-precondition") continue;
      break;
    }
  }

  return ASSETS.userLoggedIn;
}

// ---------- Sign-in modal wiring ----------
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

  if (openSignupLink) {
    openSignupLink.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSignin({ clear: true });
      await ensureSignupInjected();
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
      await setPersistence(auth, rememberMe.checked ? browserLocalPersistence : browserSessionPersistence);

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

// ---------- Stable DOM per mount ----------
function buildMount(authAreaEl) {
  if (authAreaEl.__authBuilt) return authAreaEl.__authBuilt;

  authAreaEl.textContent = "";

  const btn = document.createElement("button");
  btn.type = "button";

  const img = document.createElement("img");
  img.className = "nav-icon";

  const text = document.createElement("span");
  text.textContent = "Login";

  btn.appendChild(text);
  authAreaEl.appendChild(btn);

  authAreaEl.__authBuilt = { btn, img, text };
  return authAreaEl.__authBuilt;
}

export async function initAuthButton(authAreaEl, { variant = "desktop" } = {}) {
  ensureAuthListener();
  if (!authAreaEl) return;
  await ensureSigninInjected();

  const ui = buildMount(authAreaEl);

  // IMPORTANT: hide until auth is ready (prevents the wrong icon from showing)
  ui.btn.style.visibility = window.__authReady ? "visible" : "hidden";

  // click routing
  if (!authAreaEl.dataset.authWired) {
    authAreaEl.addEventListener("click", (e) => {
      const state = authAreaEl.dataset.authState || "out";

      if (state === "out") {
        if (variant === "mobile" || e.target.closest("#authLoginBtn")) openSignin();
        return;
      }

      if (state === "in") {
        if (variant === "mobile" || e.target.closest("#authAccountBtn")) window.location.href = "/account/";
      }
    });
    authAreaEl.dataset.authWired = "1";
  }

  function showLoginDesktop() {
    ui.btn.className = "auth-btn";
    ui.btn.id = "authLoginBtn";
    ui.btn.title = "Login";
    if (ui.img.parentNode === ui.btn) ui.btn.removeChild(ui.img);
    if (ui.text.parentNode !== ui.btn) ui.btn.appendChild(ui.text);
  }

  function showLoginMobile() {
    ui.btn.className = "auth-icon-btn";
    ui.btn.id = "authLoginBtn";
    ui.btn.title = "Login";
    ui.img.alt = "Login";
    ui.img.src = ASSETS.userMobile;
    if (ui.text.parentNode === ui.btn) ui.btn.removeChild(ui.text);
    if (ui.img.parentNode !== ui.btn) ui.btn.appendChild(ui.img);
  }

  function applyActiveClass() {
    const st = authAreaEl.dataset.authState || "out";
    ui.btn.classList.toggle("active", computeAuthShouldBeActive(st));
  }

  async function renderLoggedOut() {
    authAreaEl.dataset.authState = "out";
    if (variant === "mobile") showLoginMobile();
    else showLoginDesktop();
    applyActiveClass();
    ui.btn.style.visibility = "visible";
  }

  async function renderLoggedIn(user) {
    authAreaEl.dataset.authState = "in";

    ui.btn.className = "auth-icon-btn";
    ui.btn.id = "authAccountBtn";
    ui.btn.title = user.email || "";

    if (ui.text.parentNode === ui.btn) ui.btn.removeChild(ui.text);
    if (ui.img.parentNode !== ui.btn) ui.btn.appendChild(ui.img);

    ui.img.id = "authAvatar";
    ui.img.alt = "Account";

    const mem = window.__avatarCache.get(user.uid);
    const stored = getStoredAvatar(user.uid);
    const immediate =
      (!isPlaceholderIconUrl(mem) && mem) ||
      stored ||
      (!isPlaceholderIconUrl(ui.img.src) && ui.img.src) ||
      ASSETS.userLoggedIn;

    ui.img.src = immediate;
    ui.img.onerror = () => (ui.img.src = ASSETS.userLoggedIn);

    applyActiveClass();
    ui.btn.style.visibility = "visible";

    if (window.__signupInProgress) return;

    const url = await resolveAvatarUrl(user);
    if (url && url !== ui.img.src) {
      const ok = await preloadImage(url, 2000);
      if (ok) ui.img.src = url;
    }
  }

  // register mount
  window.__authMounts.push({ renderLoggedIn, renderLoggedOut, __btn: ui.btn });

  // If auth already ready, render immediately from current state
  if (window.__authReady) {
    const userNow = auth.currentUser || window.__authGetUser?.() || null;
    if (userNow && !window.__signupInProgress) renderLoggedIn(userNow);
    else renderLoggedOut();
  } else {
    // wait until first auth callback, then render
    const onReady = () => {
      window.removeEventListener("auth:ready", onReady);
      const userNow = auth.currentUser || window.__authGetUser?.() || null;
      if (userNow && !window.__signupInProgress) renderLoggedIn(userNow);
      else renderLoggedOut();
    };
    window.addEventListener("auth:ready", onReady);
  }

  // global listeners once
  if (!window.__authGlobalListenerAttached) {
    window.__authGlobalListenerAttached = true;

    window.addEventListener("auth:state", (e) => {
      const user = e.detail?.user || null;
      for (const m of window.__authMounts) {
        if (window.__signupInProgress) m.renderLoggedOut();
        else if (user) m.renderLoggedIn(user);
        else m.renderLoggedOut();
      }
    });

    window.addEventListener("modal:open", () => {
      clearPageActiveTabs();
      for (const m of window.__authMounts) m.__btn?.classList.add("active");
    });

    window.addEventListener("modal:close", () => {
      restorePageActiveTabs();
      for (const m of window.__authMounts) {
        const container = m.__btn?.parentElement;
        const st = container?.dataset?.authState || "out";
        m.__btn?.classList.toggle("active", computeAuthShouldBeActive(st));
      }
    });

    window.addEventListener("popstate", () => {
      for (const m of window.__authMounts) {
        const container = m.__btn?.parentElement;
        const st = container?.dataset?.authState || "out";
        m.__btn?.classList.toggle("active", computeAuthShouldBeActive(st));
      }
    });
  }
}