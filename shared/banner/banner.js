// /shared/banner/banner.js
import { initAuthButton } from "/shared/auth.js";
import {
  createBannerState,
  isMobileView,
  isAuthOverlayOpen,
  isExternalOverlayOpen,
  cleanupStaleModalState,
  clearAllActives,
  setAuthActive,
  setActiveNav,
  applyAccountAsActiveTab,
  clearSavedTargets,
  saveUnderlyingTargets,
  getCurrentDesktopTarget,
  getCurrentMobileTarget,
  getSavedDesktopTarget,
  getSavedMobileTarget,
  getDesktopAuthTarget,
  getMobileAuthTarget,
  getBottomNav,
  getTopNav,
  getMobileTargets,
  getDesktopTargets,
  indexOfTarget,
  isHomePath,
  isAccountPath,
  forceCloseAuthOverlays,
} from "/shared/banner/state.js";

import {
  settleLayout,
  setNavHeight,
  setBottomNavHeight,
} from "/shared/banner/utils.js";

import {
  initDesktopSpotlight,
  syncDesktopSpotlight,
  animateDesktopTo,
  hardSnapDesktopSpotlight,
} from "/shared/banner/desktop.js";

import {
  initMobileSpotlight,
  syncMobileSpotlight,
  animateMobileTo,
} from "/shared/banner/mobile.js";

(async function () {
  const mount = document.getElementById("bannerMount");
  if (!mount) return;

  const res = await fetch("/shared/banner.html", { cache: "no-store" });
  if (!res.ok) {
    console.error("banner.html fetch failed:", res.status);
    return;
  }

  mount.innerHTML = await res.text();

  mount.querySelector(".navbar")?.classList.add("liquid-glass", "glass-no-clip");
  mount.querySelector(".navbar-bottom")?.classList.add("liquid-glass");

  const state = createBannerState(mount);

  cleanupStaleModalState(state);

  let authArea = mount.querySelector("#authArea");
  if (!authArea) {
    authArea = document.createElement("span");
    authArea.id = "authArea";
    authArea.className = "auth-area";
    const nav = mount.querySelector(".navbar nav");
    if (nav) nav.appendChild(authArea);
  }
  await initAuthButton(authArea, { variant: "desktop" });

  const mobileAuthRoot = mount.querySelector("#mobileAuthBtn");
  if (mobileAuthRoot) {
    mobileAuthRoot.textContent = "";
    await initAuthButton(mobileAuthRoot, { variant: "mobile" });
  }

  setActiveNav(state);
  applyAccountAsActiveTab(state);
  setNavHeight(mount);
  setBottomNavHeight();

  initDesktopSpotlight(state);
  initMobileSpotlight(state);

  syncDesktopSpotlight(state, { instant: true });
  syncMobileSpotlight(state, { instant: true });

  window.__bannerApplyActiveNav = () => {
    if (isAuthOverlayOpen(state)) {
      forceAuthActiveUI(state);
      return;
    }

    clearSavedTargets(state);
    setActiveNav(state);
    applyAccountAsActiveTab(state);
    syncMobileSpotlight(state, { instant: true });
    syncDesktopSpotlight(state, { instant: true });
  };

  window.addEventListener("modal:open", async () => {
    cancelPendingClose(state);
    await openAuthState(state);
  });

  window.addEventListener("modal:close", () => {
    scheduleCloseRelease(state);
  });

  window.addEventListener("auth:state", () => {
    if (isAuthOverlayOpen(state)) {
      forceAuthActiveUI(state);
      return;
    }

    clearSavedTargets(state);
    setActiveNav(state);
    applyAccountAsActiveTab(state);
    syncMobileSpotlight(state, { instant: true });
    syncDesktopSpotlight(state, { instant: true });
  });

  window.addEventListener("resize", () => {
    setBottomNavHeight();

    if (isAuthOverlayOpen(state)) {
      forceAuthActiveUI(state);
      return;
    }

    syncMobileSpotlight(state, { instant: true });
    syncDesktopSpotlight(state, { instant: true });
  });

  window.addEventListener("focus", () => {
    if (isAuthOverlayOpen(state)) {
      forceAuthActiveUI(state);
    }
  });
})();

async function openAuthState(state) {
  state.authModalOpen = true;

  if (state.bannerOpenedAuth) {
    state.bannerOpenedAuth = false;
    clearAllActives(state);
    setAuthActive(state, true);
    await settleLayout();
    syncMobileSpotlight(state, { instant: true });
    syncDesktopSpotlight(state, { instant: true });
    return;
  }

  saveUnderlyingTargets(state);

  const prevDesktop = getCurrentDesktopTarget(state);
  const prevMobile = getCurrentMobileTarget(state);

  clearAllActives(state);
  setAuthActive(state, true);
  await settleLayout();

  if (isMobileView()) {
    const bottomNav = getBottomNav(state);
    const authTarget = getMobileAuthTarget(state);

    if (bottomNav && authTarget) {
      bottomNav.__spotIndex = indexOfTarget(getMobileTargets(state), prevMobile || authTarget);
      await animateMobileTo(state, authTarget);
    } else {
      syncMobileSpotlight(state, { instant: true });
    }

    syncDesktopSpotlight(state, { instant: true });
    return;
  }

  if (isHomePath()) {
    hardSnapDesktopSpotlight(state);
    syncMobileSpotlight(state, { instant: true });
    return;
  }

  const topNav = getTopNav(state);
  const authTarget = getDesktopAuthTarget(state);

  if (topNav && authTarget) {
    topNav.__spotIndex = indexOfTarget(getDesktopTargets(state), prevDesktop || authTarget);
    await animateDesktopTo(state, authTarget);
  } else {
    syncDesktopSpotlight(state, { instant: true });
  }

  syncMobileSpotlight(state, { instant: true });
}

function scheduleCloseRelease(state) {
  cancelPendingClose(state);

  state.closeTimer = setTimeout(async () => {
    state.closeTimer = null;

    state.authModalOpen = false;
    window.__authModalOpen = false;

    if (isExternalOverlayOpen()) return;

    state.ignoreMobileUntil = performance.now() + 180;

    clearAllActives(state);
    setActiveNav(state);
    applyAccountAsActiveTab(state);
    await settleLayout();

    if (isMobileView()) {
      const bottomNav = getBottomNav(state);
      const target = isAccountPath() ? getMobileAuthTarget(state) : getSavedMobileTarget(state);

      clearAllActives(state);
      setActiveNav(state);
      applyAccountAsActiveTab(state);
      await settleLayout();

      if (bottomNav && target) {
        bottomNav.__spotIndex = indexOfTarget(
          getMobileTargets(state),
          getMobileAuthTarget(state) || target
        );
        await animateMobileTo(state, target);
      } else {
        syncMobileSpotlight(state, { instant: true });
      }

      clearSavedTargets(state);
      syncDesktopSpotlight(state, { instant: true });
      return;
    }

    const returnTarget = isAccountPath() ? getDesktopAuthTarget(state) : getSavedDesktopTarget(state);

    clearAllActives(state);
    setActiveNav(state);
    applyAccountAsActiveTab(state);
    await settleLayout();

    if (!returnTarget || targetHref(returnTarget) === "/index.html" || isHomePath()) {
      hardSnapDesktopSpotlight(state);
      clearSavedTargets(state);
      syncMobileSpotlight(state, { instant: true });
      return;
    }

    const topNav = getTopNav(state);
    if (topNav) {
      topNav.__spotIndex = indexOfTarget(
        getDesktopTargets(state),
        getDesktopAuthTarget(state) || returnTarget
      );
      await animateDesktopTo(state, returnTarget);
    } else {
      syncDesktopSpotlight(state, { instant: true });
    }

    clearSavedTargets(state);
    syncMobileSpotlight(state, { instant: true });
  }, 70);
}

function cancelPendingClose(state) {
  if (state.closeTimer) {
    clearTimeout(state.closeTimer);
    state.closeTimer = null;
  }
}

function forceAuthActiveUI(state) {
  clearAllActives(state);
  setAuthActive(state, true);
  syncMobileSpotlight(state, { instant: true });
  syncDesktopSpotlight(state, { instant: true });
}

function targetHref(el) {
  if (!el) return "";
  if (el.closest?.(".logo")) return "/index.html";
  if (el.id === "authAccountBtn") return "/account/";
  return el.getAttribute?.("href") || "";
}