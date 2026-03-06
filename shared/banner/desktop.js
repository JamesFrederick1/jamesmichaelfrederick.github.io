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

/* =========================
   Quick desktop spotlight config
========================= */
const DESKTOP_SPOT = {
  HIDE_ON_HOME: true,
  TRANSITION:
    "transform 240ms cubic-bezier(.22,.9,.18,1), width 220ms cubic-bezier(.22,.9,.18,1), height 220ms cubic-bezier(.22,.9,.18,1)",
  AUTH_WIDTH_PAD: 18,
  LINK_WIDTH_PAD: 22,
  AUTH_MIN_W: 52,
  AUTH_MAX_W: 150,
  LINK_MIN_W: 58,
  LINK_MAX_W: 170,
  AUTH_H: 40,
  LINK_H: 38,
};

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

  // auth click
  topNav.addEventListener(
    "click",
    async (e) => {
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

        // signed out -> open signin
        if (!user) {
          state.savedDesktopHref = targetHref(prev);
          state.savedMobileHref = targetHref(getCurrentMobileTarget(state));
          state.bannerOpenedAuth = true;

          if (isHomePath() && DESKTOP_SPOT.HIDE_ON_HOME) {
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

        // signed in -> account
        if (isHomePath() && DESKTOP_SPOT.HIDE_ON_HOME) {
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
    },
    true
  );

  // page/logo clicks
  topNav.addEventListener("click", async (e) => {
    if (isMobileView()) return;

    const logo = e.target.closest(".logo a");
    const link = e.target.closest("a[href]");

    if (!logo && !link) return;
    if (link?.closest("#authArea")) return;

    // allow leaving auth overlay by clicking a real target
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

        // any transition involving home/logo stays snap-only
        if (logo || toComparable(href) === "/index.html" || isHomePath()) {
          forceCloseAuthOverlays(state);
          hardSnapDesktopSpotlight(state);
          window.location.href = href;
          return;
        }

        const targetEl = link;
        if (!targetEl) return;

        forceCloseAuthOverlays(state);

        clearAllActives(state);
        targetEl.classList.add("active");
        await settleLayout();

        topNav.__spotIndex = indexOfTarget(
          getDesktopTargets(state),
          getDesktopAuthTarget(state) || targetEl
        );
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
      // logo/home never uses spotlight
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

      // any transition involving home is snap-only
      if (isHomePath() || target === "/index.html") {
        hardSnapDesktopSpotlight(state);
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

  await ensureDesktopSpotReady(spot, targets[from]);
  sizeDesktopSpotForTarget(spot, targets[from]);
  await settleLayout();

  const x0 = xForDesktopTarget(topNav, spot, targets[from]);
  spot.style.opacity = "1";
  spot.style.transition = "none";
  spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
  await waitFrame();

  await ensureDesktopSpotReady(spot, targets[to]);
  sizeDesktopSpotForTarget(spot, targets[to]);
  await settleLayout();

  const x1 = xForDesktopTarget(topNav, spot, targets[to]);
  spot.style.transition = DESKTOP_SPOT.TRANSITION;
  spot.style.transform = `translate3d(${x1}px, -50%, 0)`;

  await new Promise((r) => setTimeout(r, 260));

  await ensureDesktopSpotReady(spot, targets[to]);
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

  // home: hide spotlight instead of nuking it
  if (DESKTOP_SPOT.HIDE_ON_HOME && isHomePath() && !isAuthOverlayOpen(state)) {
    topNav.__spotIndex = null;
    spot.style.transition = "none";
    spot.style.opacity = "0";
    return;
  }

  const targets = getDesktopTargets(state);
  if (!targets.length) {
    spot.style.transition = "none";
    spot.style.opacity = "0";
    topNav.__spotIndex = null;
    return;
  }

  let active;
  if (isAuthOverlayOpen(state)) active = getDesktopAuthTarget(state);
  else active = getCurrentDesktopTarget(state);

  const idx = Math.max(0, indexOfTarget(targets, active || targets[0]));
  topNav.__spotIndex = idx;

  requestAnimationFrame(async () => {
    await ensureDesktopSpotReady(spot, targets[idx]);
    const x = xForDesktopTarget(topNav, spot, targets[idx]);

    spot.style.opacity = "1";

    if (instant) {
      spot.style.transition = "none";
      spot.style.transform = `translate3d(${x}px, -50%, 0)`;
      requestAnimationFrame(() => {
        spot.style.transition = "";
      });
    } else {
      spot.style.transition = DESKTOP_SPOT.TRANSITION;
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

  // home isolated = spotlight hidden
  if (DESKTOP_SPOT.HIDE_ON_HOME) {
    spot.style.transition = "none";
    spot.style.opacity = "0";
    topNav.__spotIndex = null;
    return;
  }

  spot.style.transition = "none";
  syncDesktopSpotlight(state, { instant: true });
}

function sizeDesktopSpotForTarget(spot, targetEl) {
  if (!spot || !targetEl) return;

  const isAuth = targetEl.id === "authLoginBtn" || targetEl.id === "authAccountBtn";
  const r = targetEl.getBoundingClientRect();

  let w;
  let h;

  spot.style.background = "rgba(212, 175, 55, 0.30)";
  spot.style.borderColor = "rgba(212, 175, 55, 0.40)";

  if (isAuth) {
    w = Math.max(
      DESKTOP_SPOT.AUTH_MIN_W,
      Math.min(DESKTOP_SPOT.AUTH_MAX_W, r.width + DESKTOP_SPOT.AUTH_WIDTH_PAD)
    );
    h = DESKTOP_SPOT.AUTH_H;
  } else {
    w = Math.max(
      DESKTOP_SPOT.LINK_MIN_W,
      Math.min(DESKTOP_SPOT.LINK_MAX_W, r.width + DESKTOP_SPOT.LINK_WIDTH_PAD)
    );
    h = DESKTOP_SPOT.LINK_H;
  }

  spot.style.width = `${w}px`;
  spot.style.height = `${h}px`;
  spot.style.borderRadius = "999px";
}

async function ensureDesktopSpotReady(spot, targetEl) {
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