// /shared/banner/mobile.js
import {
  isMobileView,
  isAuthOverlayOpen,
  getAuthUser,
  getBottomNav,
  getMobileSpot,
  getMobileAuthTarget,
  getMobileTargets,
  getCurrentMobileTarget,
  getCurrentDesktopTarget,
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

export function initMobileSpotlight(state) {
  const bottomNav = getBottomNav(state);
  if (!bottomNav) return;

  let spot = bottomNav.querySelector(".nav-spotlight");
  if (!spot) {
    spot = document.createElement("span");
    spot.className = "nav-spotlight";
    bottomNav.prepend(spot);
  }

  bottomNav.classList.add("has-spotlight");
  bottomNav.__spotIndex = null;

  requestAnimationFrame(() => syncMobileSpotlight(state, { instant: true }));

  bottomNav.addEventListener("click", async (e) => {
    if (!isMobileView()) return;

    if (performance.now() < state.ignoreMobileUntil) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      return;
    }

    const authRoot = e.target.closest("#mobileAuthBtn");
    const link = e.target.closest("a[href]");

    if (isAuthOverlayOpen(state)) {
      if (!link) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        return;
      }

      const href = link.getAttribute("href") || "";
      if (!isLocalNavHref(href)) return;

      if (!lockNav(state)) {
        e.preventDefault();
        return;
      }

      try {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        forceCloseAuthOverlays(state);

        clearAllActives(state);
        link.classList.add("active");
        await settleLayout();

        bottomNav.__spotIndex = indexOfTarget(getMobileTargets(state), getMobileAuthTarget(state) || link);
        await animateMobileTo(state, link);
        window.location.href = href;
      } finally {
        unlockNav(state);
      }
      return;
    }

    if (authRoot) {
      if (!lockNav(state)) {
        e.preventDefault();
        return;
      }

      try {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        const authTarget = getMobileAuthTarget(state);
        if (!authTarget) return;

        const prev = getCurrentMobileTarget(state);

        clearAllActives(state);
        setAuthActive(state, true);
        await settleLayout();

        const user = getAuthUser();

        if (!user) {
          state.savedDesktopHref = targetHref(getCurrentDesktopTarget(state));
          state.savedMobileHref = targetHref(prev);
          state.bannerOpenedAuth = true;
        }

        bottomNav.__spotIndex = indexOfTarget(getMobileTargets(state), prev || authTarget);
        await animateMobileTo(state, authTarget);

        if (user) {
          window.location.href = "/account/";
        } else if (typeof window.__authOpenSignin === "function") {
          await window.__authOpenSignin();
        }
      } finally {
        unlockNav(state);
      }
      return;
    }

    if (!link) return;

    const href = link.getAttribute("href") || "";
    if (!isLocalNavHref(href)) return;

    const target = toComparable(href);
    if (target === toComparable(window.location.pathname || "/index.html")) return;

    if (!lockNav(state)) {
      e.preventDefault();
      return;
    }

    try {
      const prev = getCurrentMobileTarget(state);

      e.preventDefault();

      clearAllActives(state);
      link.classList.add("active");
      await settleLayout();

      bottomNav.__spotIndex = indexOfTarget(getMobileTargets(state), prev || link);
      await animateMobileTo(state, link);
      window.location.href = href;
    } finally {
      unlockNav(state);
    }
  }, true);
}

export async function animateMobileTo(state, targetEl) {
  const bottomNav = getBottomNav(state);
  const spot = getMobileSpot(state);
  if (!bottomNav || !spot || !targetEl) return;

  const targets = getMobileTargets(state);
  if (!targets.length) return;

  await ensureMobileSpotReady(spot);

  let from = bottomNav.__spotIndex;
  if (from == null || from < 0) {
    from = indexOfTarget(targets, getCurrentMobileTarget(state) || targetEl);
    if (from < 0) from = 0;
  }

  const to = indexOfTarget(targets, targetEl);
  if (to < 0) return;

  const x0 = xForMobileTarget(bottomNav, spot, targets[from]);
  spot.style.transition = "none";
  spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
  await waitFrame();

  const dir = to > from ? 1 : -1;
  const path = [from];
  for (let i = from; i !== to; i += dir) path.push(i + dir);

  const frames = path.map((idx) => {
    const x = xForMobileTarget(bottomNav, spot, targets[idx]);
    return { transform: `translate3d(${x}px, -50%, 0)` };
  });

  const hops = Math.max(1, path.length - 1);
  const duration = Math.min(520, 160 + (hops * 80));

  const anim = spot.animate(frames, {
    duration,
    easing: "cubic-bezier(.2,.9,.2,1)",
    fill: "forwards",
  });

  await anim.finished.catch(() => {});

  const x1 = xForMobileTarget(bottomNav, spot, targets[to]);
  spot.style.transition = "none";
  spot.style.transform = `translate3d(${x1}px, -50%, 0)`;

  bottomNav.__spotIndex = to;
}

export function syncMobileSpotlight(state, { instant = false } = {}) {
  const bottomNav = getBottomNav(state);
  const spot = getMobileSpot(state);
  if (!bottomNav || !spot) return;

  const targets = getMobileTargets(state);
  if (!targets.length) return;

  let active;
  if (isAuthOverlayOpen(state)) active = getMobileAuthTarget(state);
  else active = getCurrentMobileTarget(state);

  const idx = Math.max(0, indexOfTarget(targets, active || targets[0]));
  bottomNav.__spotIndex = idx;

  requestAnimationFrame(async () => {
    await ensureMobileSpotReady(spot);
    const x = xForMobileTarget(bottomNav, spot, targets[idx]);

    if (instant) {
      spot.style.transition = "none";
      spot.style.transform = `translate3d(${x}px, -50%, 0)`;
    } else {
      spot.style.transform = `translate3d(${x}px, -50%, 0)`;
    }
  });
}

async function ensureMobileSpotReady(spot) {
  for (let i = 0; i < 3; i++) {
    if (spot && spot.offsetWidth > 0 && spot.offsetHeight > 0) return;
    await waitFrame();
  }
  if (!spot) return;
  if (spot.offsetWidth === 0) spot.style.width = "52px";
  if (spot.offsetHeight === 0) spot.style.height = "52px";
  await waitFrame();
}

function xForMobileTarget(bottomNav, spot, targetEl) {
  const navRect = bottomNav.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();
  return (tRect.left - navRect.left) + (tRect.width / 2) - (spot.offsetWidth / 2);
}