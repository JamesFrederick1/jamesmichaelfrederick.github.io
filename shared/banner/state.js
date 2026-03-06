// /shared/banner/state.js
import { normalizePath, toComparable } from "/shared/banner/utils.js";

export function createBannerState(mount) {
  return {
    mount,
    authModalOpen: false,
    navBusy: false,
    closeTimer: null,
    savedDesktopHref: "",
    savedMobileHref: "",
    ignoreMobileUntil: 0,
    bannerOpenedAuth: false,
  };
}

export function isMobileView() {
  return window.innerWidth <= 600;
}

export function getAuthUser() {
  return (typeof window.__authGetUser === "function" ? window.__authGetUser() : null) || window.__authUser || null;
}

export function isAuthOverlayOpen(state) {
  return !!window.__authOverlayOpen || !!state.authModalOpen || document.body.classList.contains("modal-open");
}

export function isExternalOverlayOpen() {
  return !!window.__authOverlayOpen || document.body.classList.contains("modal-open");
}

export function isHomePath() {
  const p = (window.location.pathname || "").toLowerCase();
  return p === "/" || p === "/index.html";
}

export function isAccountPath() {
  const p = (window.location.pathname || "").toLowerCase();
  return p === "/account/" || p === "/account/index.html" || p.startsWith("/account/");
}

export function cleanupStaleModalState(state) {
  state.authModalOpen = false;
  window.__authModalOpen = false;
  window.__authOverlayOpen = null;

  const signin = document.getElementById("id01");
  if (signin) signin.style.display = "none";

  const signup = document.getElementById("signupModal");
  if (signup) signup.style.display = "none";

  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}

export function getTopNav(state) {
  return state.mount.querySelector(".navbar nav");
}

export function getBottomNav(state) {
  return state.mount.querySelector(".navbar-bottom nav");
}

export function getDesktopSpot(state) {
  return getTopNav(state)?.querySelector(".nav-spotlight") || null;
}

export function getMobileSpot(state) {
  return getBottomNav(state)?.querySelector(".nav-spotlight") || null;
}

export function clearAllActives(state) {
  state.mount
    .querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active")
    .forEach((el) => el.classList.remove("active"));

  state.mount.querySelector("#authArea #authLoginBtn")?.classList.remove("active");
  state.mount.querySelector("#authArea #authAccountBtn")?.classList.remove("active");
  state.mount.querySelector("#mobileAuthBtn")?.classList.remove("active");
  state.mount.querySelector("#mobileAuthBtn button")?.classList.remove("active");
}

export function setAuthActive(state, active) {
  state.mount.querySelector("#authArea #authLoginBtn")?.classList.toggle("active", !!active);
  state.mount.querySelector("#authArea #authAccountBtn")?.classList.toggle("active", !!active);
  getMobileAuthTarget(state)?.classList.toggle("active", !!active);
}

export function setActiveNav(state) {
  const current = toComparable(window.location.pathname || "/index.html");

  state.mount
    .querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active")
    .forEach((el) => el.classList.remove("active"));

  state.mount.querySelectorAll(".navbar nav a, .navbar-bottom nav a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const comp = toComparable(href);
    const raw = normalizePath(href);

    const active =
      current === comp ||
      (raw.endsWith("/") && normalizePath(window.location.pathname).startsWith(raw));

    a.classList.toggle("active", active);
  });

  state.mount.querySelector(".logo a")?.classList.toggle("active", isHomePath());
  state.mount.querySelector("#authArea #authLoginBtn")?.classList.remove("active");
  state.mount.querySelector("#authArea #authAccountBtn")?.classList.remove("active");
  getMobileAuthTarget(state)?.classList.remove("active");
}

export function applyAccountAsActiveTab(state) {
  if (!isAccountPath()) return;

  state.mount.querySelector(".navbar nav")?.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
  state.mount.querySelector(".navbar .logo a")?.classList.remove("active");
  state.mount.querySelector(".navbar-bottom nav")?.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));

  state.mount.querySelector("#authArea #authAccountBtn")?.classList.add("active");
  getMobileAuthTarget(state)?.classList.add("active");
}

export function clearSavedTargets(state) {
  state.savedDesktopHref = "";
  state.savedMobileHref = "";
}

export function saveUnderlyingTargets(state) {
  state.savedDesktopHref = targetHref(getCurrentDesktopTarget(state));
  state.savedMobileHref = targetHref(getCurrentMobileTarget(state));
}

export function targetHref(el) {
  if (!el) return "";
  if (el.closest?.(".logo")) return "/index.html";
  if (el.id === "authAccountBtn") return "/account/";
  return el.getAttribute?.("href") || "";
}

export function getDesktopAuthTarget(state) {
  return state.mount.querySelector("#authArea #authAccountBtn") ||
    state.mount.querySelector("#authArea #authLoginBtn") ||
    null;
}

export function getMobileAuthTarget(state) {
  const root = state.mount.querySelector("#mobileAuthBtn");
  if (!root) return null;
  return root.querySelector("button") || root;
}

export function getDesktopTargets(state) {
  const topNav = getTopNav(state);
  const logo = state.mount.querySelector(".navbar .logo a");
  const links = Array.from(topNav?.querySelectorAll("a") || []).filter((a) => !a.closest("#authArea"));
  const auth = getDesktopAuthTarget(state);

  const out = [];
  if (logo) out.push(logo);
  out.push(...links);
  if (auth) out.push(auth);
  return out;
}

export function getMobileTargets(state) {
  const bottomNav = getBottomNav(state);
  const links = Array.from(bottomNav?.querySelectorAll(":scope > a") || []);
  const auth = getMobileAuthTarget(state);
  return auth ? [...links, auth] : links;
}

export function getCurrentDesktopTarget(state) {
  const authActive =
    state.mount.querySelector("#authArea #authAccountBtn.active") ||
    state.mount.querySelector("#authArea #authLoginBtn.active");
  if (authActive) return authActive;

  const logo = state.mount.querySelector(".navbar .logo a");
  if (isAccountPath()) return getDesktopAuthTarget(state);
  if (logo?.classList.contains("active")) return logo;

  const topNav = getTopNav(state);
  const pageActive = Array.from(topNav?.querySelectorAll("a.active") || []).find((a) => !a.closest("#authArea"));
  if (pageActive) return pageActive;

  if (isHomePath()) return logo;
  return pageActive || getDesktopAuthTarget(state) || logo || null;
}

export function getCurrentMobileTarget(state) {
  const auth = getMobileAuthTarget(state);
  const bottomNav = getBottomNav(state);

  if (auth?.classList.contains("active")) return auth;
  if (isAccountPath()) return auth;

  const pageActive = Array.from(bottomNav?.querySelectorAll(":scope > a.active") || [])[0];
  if (pageActive) return pageActive;

  return Array.from(bottomNav?.querySelectorAll(":scope > a") || [])[0] || auth || null;
}

export function getSavedDesktopTarget(state) {
  const saved = state.savedDesktopHref || "";
  const topNav = getTopNav(state);
  const logo = state.mount.querySelector(".navbar .logo a");

  if (!saved) return getCurrentDesktopTarget(state);

  if (toComparable(saved) === "/index.html") return logo;
  if (toComparable(saved) === "/account/index.html") return getDesktopAuthTarget(state);

  const exact = Array.from(topNav?.querySelectorAll("a[href]") || []).find(
    (a) => !a.closest("#authArea") && toComparable(a.getAttribute("href") || "") === toComparable(saved)
  );
  return exact || getCurrentDesktopTarget(state);
}

export function getSavedMobileTarget(state) {
  const saved = state.savedMobileHref || "";
  const bottomNav = getBottomNav(state);

  if (!saved) return getCurrentMobileTarget(state);

  const exact = Array.from(bottomNav?.querySelectorAll(":scope > a[href]") || []).find(
    (a) => toComparable(a.getAttribute("href") || "") === toComparable(saved)
  );
  return exact || getCurrentMobileTarget(state);
}

export function indexOfTarget(targets, el) {
  return targets.findIndex((t) => t === el);
}

export function lockNav(state) {
  if (state.navBusy) return false;
  state.navBusy = true;
  return true;
}

export function unlockNav(state) {
  state.navBusy = false;
}

export function forceCloseAuthOverlays(state) {
  const signin = document.getElementById("id01");
  if (signin) signin.style.display = "none";

  const signup = document.getElementById("signupModal");
  if (signup) signup.style.display = "none";

  window.__authOverlayOpen = null;
  window.__authModalOpen = false;
  state.authModalOpen = false;

  document.body.classList.remove("modal-open");
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
}