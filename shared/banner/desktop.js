// /shared/banner/desktop.js
import {
  isMobileView,
  isAuthOverlayOpen,
  isHomePath,
  getAuthUser,
  getTopNav,
  getDesktopSpot,
  getDesktopAuthTarget,
  getDesktopTargets,
  getCurrentDesktopTarget,
  getCurrentMobileTarget,
  indexOfTarget,
  clearAllActives,
  setAuthActive,
  lockNav,
  unlockNav,
  forceCloseAuthOverlays,
  targetHref,
} from "/shared/banner/state.js";

import {
  isLocalNavHref,
  toComparable,
  waitFrame,
  settleLayout,
} from "/shared/banner/utils.js";

export function initDesktopSpotlight(state) {
  const topNav = getTopNav(state);
  if (!topNav) return;

  let spot = topNav.querySelector(".nav-spotlight");
  if (!spot) {
    spot = document.createElement("span");
    spot.className = "nav-spotlight";
    topNav.prepend(spot);
  }

  topNav.classList.add("has-spotlight");
  topNav.__spotIndex = null;

  requestAnimationFrame(() => syncDesktopSpotlight(state, { instant: true }));

  topNav.addEventListener("click", async (e) => {
    if (isMobileView()) return;

    const authRoot = e.target.closest("#authArea");
    if (!authRoot) return;

    if (!lockNav(state)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return;
    }

    try {
      if (isAuthOverlayOpen(state)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        return;
      }

      const user = getAuthUser();
      const prev = getCurrentDesktopTarget(state);
      const authTarget = getDesktopAuthTarget(state);
      if (!authTarget) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();

      clearAllActives(state);
      setAuthActive(state, true);
      await settleLayout();

      if (!user) {
        state.savedDesktopHref = targetHref(prev);
        state.savedMobileHref = targetHref(getCurrentMobileTarget(state));
        state.bannerOpenedAuth = true;

        if (isHomePath()) {
          hardSnapDesktopSpotlight(state);
        } else {
          topNav.__spotIndex = indexOfTarget(getDesktopTargets(state), prev || authTarget);
          await animateDesktopTo(state, authTarget);
        }

        if (typeof window.__authOpenSignin === "function") {
          await window.__authOpenSignin();
        }
        return;
      }

      if (isHomePath()) {
        hardSnapDesktopSpotlight(state);
        window.location.href = "/account/";
        return;
      }

      topNav.__spotIndex = indexOfTarget(getDesktopTargets(state), prev || authTarget);
      await animateDesktopTo(state, authTarget);
      window.location.href = "/account/";
    } finally {
      unlockNav(state);
    }
  }, true);

  topNav.addEventListener("click", async (e) => {
    if (isMobileView()) return;

    const logo = e.target.closest(".logo a");
    const link = e.target.closest("a[href]");

    if (!logo && !link) return;
    if (link?.closest("#authArea")) return;

    if (isAuthOverlayOpen(state)) {
      if (!lockNav(state)) {
        e.preventDefault();
        return;
      }

      try {
        const href = logo
          ? (logo.getAttribute("href") || "/")
          : (link?.getAttribute("href") || "");

        if (!logo && !isLocalNavHref(href)) return;

        e.preventDefault();
        e.stopPropagation();

        if (logo || toComparable(href) === "/index.html" || isHomePath()) {
          forceCloseAuthOverlays(state);
          window.location.href = href;
          return;
        }

        const targetEl = link;
        if (!targetEl) return;

        forceCloseAuthOverlays(state);

        clearAllActives(state);
        targetEl.classList.add("active");
        await settleLayout();

        topNav.__spotIndex = indexOfTarget(getDesktopTargets(state), getDesktopAuthTarget(state) || targetEl);
        await animateDesktopTo(state, targetEl);
        window.location.href = href;
      } finally {
        unlockNav(state);
      }
      return;
    }

    if (!lockNav(state)) {
      e.preventDefault();
      return;
    }

    try {
      if (logo) {
        e.preventDefault();
        hardSnapDesktopSpotlight(state);
        window.location.href = logo.getAttribute("href") || "/";
        return;
      }

      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (!isLocalNavHref(href)) return;

      const target = toComparable(href);
      if (target === toComparable(window.location.pathname || "/index.html")) return;

      const prev = getCurrentDesktopTarget(state);

      e.preventDefault();

      if (isHomePath() || target === "/index.html") {
        window.location.href = href;
        return;
      }

      clearAllActives(state);
      link.classList.add("active");
      await settleLayout();

      topNav.__spotIndex = indexOfTarget(getDesktopTargets(state), prev || link);
      await animateDesktopTo(state, link);
      window.location.href = href;
    } finally {
      unlockNav(state);
    }
  });
}

export async function animateDesktopTo(state, targetEl) {
  const topNav = getTopNav(state);
  const spot = getDesktopSpot(state);
  if (!topNav || !spot || !targetEl) return;

  const targets = getDesktopTargets(state);
  if (!targets.length) return;

  let from = topNav.__spotIndex;
  if (from == null || from < 0) {
    from = indexOfTarget(targets, getCurrentDesktopTarget(state) || targetEl);
    if (from < 0) from = 0;
  }

  const to = indexOfTarget(targets, targetEl);
  if (to < 0) return;

  await ensureDesktopSpotReady(state, spot, targets[from]);
  sizeDesktopSpotForTarget(spot, targets[from]);
  await settleLayout();

  const x0 = xForDesktopTarget(topNav, spot, targets[from]);
  spot.style.transition = "none";
  spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
  await waitFrame();

  await ensureDesktopSpotReady(state, spot, targets[to]);
  sizeDesktopSpotForTarget(spot, targets[to]);
  await settleLayout();

  const x1 = xForDesktopTarget(topNav, spot, targets[to]);
  spot.style.transition =
    "transform 240ms cubic-bezier(.22,.9,.18,1), width 220ms cubic-bezier(.22,.9,.18,1), height 220ms cubic-bezier(.22,.9,.18,1)";
  spot.style.transform = `translate3d(${x1}px, -50%, 0)`;

  await new Promise((r) => setTimeout(r, 260));

  await ensureDesktopSpotReady(state, spot, targets[to]);
  sizeDesktopSpotForTarget(spot, targets[to]);
  await settleLayout();

  const x2 = xForDesktopTarget(topNav, spot, targets[to]);
  spot.style.transition = "none";
  spot.style.transform = `translate3d(${x2}px, -50%, 0)`;
  await waitFrame();
  spot.style.transition = "";

  topNav.__spotIndex = to;
}

export function syncDesktopSpotlight(state, { instant = false } = {}) {
  const topNav = getTopNav(state);
  const spot = getDesktopSpot(state);
  if (!topNav || !spot) return;

  const targets = getDesktopTargets(state);
  if (!targets.length) return;

  let active;
  if (isAuthOverlayOpen(state)) active = getDesktopAuthTarget(state);
  else active = getCurrentDesktopTarget(state);

  const idx = Math.max(0, indexOfTarget(targets, active || targets[0]));
  topNav.__spotIndex = idx;

  requestAnimationFrame(async () => {
    await ensureDesktopSpotReady(state, spot, targets[idx]);
    const x = xForDesktopTarget(topNav, spot, targets[idx]);

    if (instant) {
      spot.style.transition = "none";
      spot.style.transform = `translate3d(${x}px, -50%, 0)`;
      requestAnimationFrame(() => {
        spot.style.transition = "";
      });
    } else {
      spot.style.transition =
        "transform 240ms cubic-bezier(.22,.9,.18,1), width 220ms cubic-bezier(.22,.9,.18,1), height 220ms cubic-bezier(.22,.9,.18,1)";
      spot.style.transform = `translate3d(${x}px, -50%, 0)`;
    }
  });
}

export function hardSnapDesktopSpotlight(state) {
  const topNav = getTopNav(state);
  const spot = getDesktopSpot(state);
  if (!topNav || !spot) {
    syncDesktopSpotlight(state, { instant: true });
    return;
  }

  try {
    spot.getAnimations?.().forEach((a) => a.cancel());
  } catch {}

  spot.style.transition = "none";
  syncDesktopSpotlight(state, { instant: true });
}

function sizeDesktopSpotForTarget(spot, targetEl) {
  if (!spot || !targetEl) return;

  const isLogo = !!targetEl.closest?.(".logo");
  const isAuth = targetEl.id === "authLoginBtn" || targetEl.id === "authAccountBtn";
  const r = targetEl.getBoundingClientRect();

  let w;
  let h;

  if (isLogo) {
    w = 30;
    h = 30;
    spot.style.background = "rgba(212, 175, 55, 0.08)";
    spot.style.borderColor = "rgba(212, 175, 55, 0.14)";
  } else {
    spot.style.background = "rgba(212, 175, 55, 0.30)";
    spot.style.borderColor = "rgba(212, 175, 55, 0.40)";
    if (isAuth) {
      w = Math.max(52, Math.min(150, r.width + 18));
      h = 40;
    } else {
      w = Math.max(58, Math.min(170, r.width + 22));
      h = 38;
    }
  }

  spot.style.width = `${w}px`;
  spot.style.height = `${h}px`;
  spot.style.borderRadius = "999px";
}

async function ensureDesktopSpotReady(state, spot, targetEl) {
  await settleLayout();
  sizeDesktopSpotForTarget(spot, targetEl);
  await settleLayout();

  if (spot.offsetWidth === 0) spot.style.width = "80px";
  if (spot.offsetHeight === 0) spot.style.height = "38px";
}

function xForDesktopTarget(topNav, spot, targetEl) {
  const navRect = topNav.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();
  return (tRect.left - navRect.left) + (tRect.width / 2) - (spot.offsetWidth / 2);
}