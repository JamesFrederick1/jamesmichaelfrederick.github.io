// /shared/banner.js
import { initAuthButton } from "/shared/auth.js";

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

  mount.__authModalOpen = false;
  mount.__navBusy = false;
  mount.__closeTimer = null;
  mount.__savedDesktopHref = "";
  mount.__savedMobileHref = "";
  mount.__ignoreMobileUntil = 0;
  mount.__bannerOpenedAuth = false;

  cleanupStaleModalState();

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

  setActiveNav();
  applyAccountAsActiveTab();
  setNavHeight();
  setBottomNavHeight();

  initMobileSpotlight();
  initDesktopSpotlight();

  syncMobileSpotlight({ instant: true });
  syncDesktopSpotlight({ instant: true });

  window.__bannerApplyActiveNav = () => {
    if (isAuthOverlayOpen()) {
      forceAuthActiveUI();
      return;
    }
    clearSavedTargets();
    setActiveNav();
    applyAccountAsActiveTab();
    syncMobileSpotlight({ instant: true });
    syncDesktopSpotlight({ instant: true });
  };

  window.addEventListener("modal:open", async () => {
    cancelPendingClose();
    await openAuthState();
  });

  window.addEventListener("modal:close", () => {
    scheduleCloseRelease();
  });

  window.addEventListener("auth:state", () => {
    if (isAuthOverlayOpen()) {
      forceAuthActiveUI();
      return;
    }
    clearSavedTargets();
    setActiveNav();
    applyAccountAsActiveTab();
    syncMobileSpotlight({ instant: true });
    syncDesktopSpotlight({ instant: true });
  });

  window.addEventListener("resize", () => {
    setBottomNavHeight();
    if (isAuthOverlayOpen()) {
      forceAuthActiveUI();
      return;
    }
    syncMobileSpotlight({ instant: true });
    syncDesktopSpotlight({ instant: true });
  });

  window.addEventListener("focus", () => {
    if (isAuthOverlayOpen()) forceAuthActiveUI();
  });

  async function openAuthState() {
    mount.__authModalOpen = true;

    if (mount.__bannerOpenedAuth) {
      mount.__bannerOpenedAuth = false;
      clearAllActives();
      setAuthActive(true);
      await settleLayout();
      syncMobileSpotlight({ instant: true });
      syncDesktopSpotlight({ instant: true });
      return;
    }

    saveUnderlyingTargets();

    const prevDesktop = getCurrentDesktopTarget();
    const prevMobile = getCurrentMobileTarget();

    clearAllActives();
    setAuthActive(true);
    await settleLayout();

    if (isMobileView()) {
      const bottomNav = getBottomNav();
      const authTarget = getMobileAuthTarget();

      if (bottomNav && authTarget) {
        bottomNav.__spotIndex = indexOfTarget(getMobileTargets(), prevMobile || authTarget);
        await animateMobileTo(authTarget);
      } else {
        syncMobileSpotlight({ instant: true });
      }

      syncDesktopSpotlight({ instant: true });
      return;
    }

    if (isHomePath()) {
      hardSnapDesktopSpotlight();
      syncMobileSpotlight({ instant: true });
      return;
    }

    const topNav = getTopNav();
    const authTarget = getDesktopAuthTarget();
    if (topNav && authTarget) {
      topNav.__spotIndex = indexOfTarget(getDesktopTargets(), prevDesktop || authTarget);
      await animateDesktopTo(authTarget);
    } else {
      syncDesktopSpotlight({ instant: true });
    }

    syncMobileSpotlight({ instant: true });
  }

  function scheduleCloseRelease() {
    cancelPendingClose();

    mount.__closeTimer = setTimeout(async () => {
      mount.__closeTimer = null;

      // Critical: mark banner-auth closed first so close logic can actually run
      mount.__authModalOpen = false;
      window.__authModalOpen = false;

      // If another overlay immediately reopened (signin -> signup handoff), stop here
      if (isExternalOverlayOpen()) return;

      mount.__ignoreMobileUntil = performance.now() + 180;

      clearAllActives();
      setActiveNav();
      applyAccountAsActiveTab();
      await settleLayout();

      if (isMobileView()) {
        const bottomNav = getBottomNav();
        const target = isAccountPath() ? getMobileAuthTarget() : getSavedMobileTarget();

        clearAllActives();
        setActiveNav();
        applyAccountAsActiveTab();
        await settleLayout();

        if (bottomNav && target) {
          bottomNav.__spotIndex = indexOfTarget(getMobileTargets(), getMobileAuthTarget() || target);
          await animateMobileTo(target);
        } else {
          syncMobileSpotlight({ instant: true });
        }

        clearSavedTargets();
        syncDesktopSpotlight({ instant: true });
        return;
      }

      const returnTarget = isAccountPath() ? getDesktopAuthTarget() : getSavedDesktopTarget();

      clearAllActives();
      setActiveNav();
      applyAccountAsActiveTab();
      await settleLayout();

      if (!returnTarget || targetHref(returnTarget) === "/index.html" || isHomePath()) {
        hardSnapDesktopSpotlight();
        clearSavedTargets();
        syncMobileSpotlight({ instant: true });
        return;
      }

      const topNav = getTopNav();
      if (topNav) {
        topNav.__spotIndex = indexOfTarget(getDesktopTargets(), getDesktopAuthTarget() || returnTarget);
        await animateDesktopTo(returnTarget);
      } else {
        syncDesktopSpotlight({ instant: true });
      }

      clearSavedTargets();
      syncMobileSpotlight({ instant: true });
    }, 70);
  }

  function cancelPendingClose() {
    if (mount.__closeTimer) {
      clearTimeout(mount.__closeTimer);
      mount.__closeTimer = null;
    }
  }

  function isMobileView() {
    return window.innerWidth <= 600;
  }

  function getAuthUser() {
    return (typeof window.__authGetUser === "function" ? window.__authGetUser() : null) || window.__authUser || null;
  }

  function isAuthOverlayOpen() {
    return !!window.__authOverlayOpen || !!mount.__authModalOpen || document.body.classList.contains("modal-open");
  }

  function isExternalOverlayOpen() {
    return !!window.__authOverlayOpen || document.body.classList.contains("modal-open");
  }

  function cleanupStaleModalState() {
    mount.__authModalOpen = false;
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

  function normalizePath(p) {
    if (!p) return "/index.html";
    let x = p.toLowerCase();
    if (x === "/") return "/index.html";
    if (!x.includes(".") && !x.endsWith("/")) x += "/";
    return x;
  }

  function toComparable(href) {
    const p = normalizePath(href || "");
    return p.endsWith("/") ? `${p}index.html` : p;
  }

  function currentComparablePath() {
    return toComparable(window.location.pathname || "/index.html");
  }

  function isHomePath() {
    const p = (window.location.pathname || "").toLowerCase();
    return p === "/" || p === "/index.html";
  }

  function isAccountPath() {
    const p = (window.location.pathname || "").toLowerCase();
    return p === "/account/" || p === "/account/index.html" || p.startsWith("/account/");
  }

  function isLocalNavHref(href) {
    if (!href) return false;
    if (href.startsWith("http")) return false;
    if (href.startsWith("mailto:")) return false;
    if (href.startsWith("#")) return false;
    return true;
  }

  function lockNav() {
    if (mount.__navBusy) return false;
    mount.__navBusy = true;
    return true;
  }

  function unlockNav() {
    mount.__navBusy = false;
  }

  function waitFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  async function settleLayout() {
    await waitFrame();
    await waitFrame();
  }

  function getTopNav() {
    return mount.querySelector(".navbar nav");
  }

  function getBottomNav() {
    return mount.querySelector(".navbar-bottom nav");
  }

  function getDesktopSpot() {
    return getTopNav()?.querySelector(".nav-spotlight") || null;
  }

  function getMobileSpot() {
    return getBottomNav()?.querySelector(".nav-spotlight") || null;
  }

  function clearAllActives() {
    mount.querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active").forEach((el) => {
      el.classList.remove("active");
    });
    mount.querySelector("#authArea #authLoginBtn")?.classList.remove("active");
    mount.querySelector("#authArea #authAccountBtn")?.classList.remove("active");
    mount.querySelector("#mobileAuthBtn")?.classList.remove("active");
    mount.querySelector("#mobileAuthBtn button")?.classList.remove("active");
  }

  function setAuthActive(active) {
    mount.querySelector("#authArea #authLoginBtn")?.classList.toggle("active", !!active);
    mount.querySelector("#authArea #authAccountBtn")?.classList.toggle("active", !!active);
    getMobileAuthTarget()?.classList.toggle("active", !!active);
  }

  function setActiveNav() {
    const current = currentComparablePath();

    mount.querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active").forEach((el) => {
      el.classList.remove("active");
    });

    mount.querySelectorAll(".navbar nav a, .navbar-bottom nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const comp = toComparable(href);
      const raw = normalizePath(href);

      const active =
        current === comp ||
        (raw.endsWith("/") && normalizePath(window.location.pathname).startsWith(raw));

      a.classList.toggle("active", active);
    });

    mount.querySelector(".logo a")?.classList.toggle("active", isHomePath());
    mount.querySelector("#authArea #authLoginBtn")?.classList.remove("active");
    mount.querySelector("#authArea #authAccountBtn")?.classList.remove("active");
    getMobileAuthTarget()?.classList.remove("active");
  }

  function applyAccountAsActiveTab() {
    if (!isAccountPath()) return;

    mount.querySelector(".navbar nav")?.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
    mount.querySelector(".navbar .logo a")?.classList.remove("active");
    mount.querySelector(".navbar-bottom nav")?.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));

    mount.querySelector("#authArea #authAccountBtn")?.classList.add("active");
    getMobileAuthTarget()?.classList.add("active");
  }

  function clearSavedTargets() {
    mount.__savedDesktopHref = "";
    mount.__savedMobileHref = "";
  }

  function saveUnderlyingTargets() {
    mount.__savedDesktopHref = targetHref(getCurrentDesktopTarget());
    mount.__savedMobileHref = targetHref(getCurrentMobileTarget());
  }

  function targetHref(el) {
    if (!el) return "";
    if (el.closest?.(".logo")) return "/index.html";
    if (el.id === "authAccountBtn") return "/account/";
    return el.getAttribute?.("href") || "";
  }

  function getDesktopAuthTarget() {
    return mount.querySelector("#authArea #authAccountBtn") || mount.querySelector("#authArea #authLoginBtn") || null;
  }

  function getMobileAuthTarget() {
    const root = mount.querySelector("#mobileAuthBtn");
    if (!root) return null;
    return root.querySelector("button") || root;
  }

  function getDesktopTargets() {
    const topNav = getTopNav();
    const logo = mount.querySelector(".navbar .logo a");
    const links = Array.from(topNav?.querySelectorAll("a") || []).filter((a) => !a.closest("#authArea"));
    const auth = getDesktopAuthTarget();
    const out = [];
    if (logo) out.push(logo);
    out.push(...links);
    if (auth) out.push(auth);
    return out;
  }

  function getMobileTargets() {
    const bottomNav = getBottomNav();
    const links = Array.from(bottomNav?.querySelectorAll(":scope > a") || []);
    const auth = getMobileAuthTarget();
    return auth ? [...links, auth] : links;
  }

  function getCurrentDesktopTarget() {
    const authActive =
      mount.querySelector("#authArea #authAccountBtn.active") ||
      mount.querySelector("#authArea #authLoginBtn.active");
    if (authActive) return authActive;

    const logo = mount.querySelector(".navbar .logo a");
    if (isAccountPath()) return getDesktopAuthTarget();
    if (logo?.classList.contains("active")) return logo;

    const topNav = getTopNav();
    const pageActive = Array.from(topNav?.querySelectorAll("a.active") || []).find((a) => !a.closest("#authArea"));
    if (pageActive) return pageActive;

    if (isHomePath()) return logo;
    return pageActive || getDesktopAuthTarget() || logo || null;
  }

  function getCurrentMobileTarget() {
    const auth = getMobileAuthTarget();
    const bottomNav = getBottomNav();

    if (auth?.classList.contains("active")) return auth;
    if (isAccountPath()) return auth;

    const pageActive = Array.from(bottomNav?.querySelectorAll(":scope > a.active") || [])[0];
    if (pageActive) return pageActive;

    return Array.from(bottomNav?.querySelectorAll(":scope > a") || [])[0] || auth || null;
  }

  function getSavedDesktopTarget() {
    const saved = mount.__savedDesktopHref || "";
    const topNav = getTopNav();
    const logo = mount.querySelector(".navbar .logo a");

    if (!saved) return getCurrentDesktopTarget();

    if (toComparable(saved) === "/index.html") return logo;
    if (toComparable(saved) === "/account/index.html") return getDesktopAuthTarget();

    const exact = Array.from(topNav?.querySelectorAll("a[href]") || []).find(
      (a) => !a.closest("#authArea") && toComparable(a.getAttribute("href") || "") === toComparable(saved)
    );
    return exact || getCurrentDesktopTarget();
  }

  function getSavedMobileTarget() {
    const saved = mount.__savedMobileHref || "";
    const bottomNav = getBottomNav();

    if (!saved) return getCurrentMobileTarget();

    const exact = Array.from(bottomNav?.querySelectorAll(":scope > a[href]") || []).find(
      (a) => toComparable(a.getAttribute("href") || "") === toComparable(saved)
    );
    return exact || getCurrentMobileTarget();
  }

  function indexOfTarget(targets, el) {
    return targets.findIndex((t) => t === el);
  }

  function setNavHeight() {
    const nav = mount.querySelector(".navbar");
    if (!nav) return;

    const apply = () => {
      const h = Math.ceil(nav.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--nav-h", `${h}px`);
    };

    apply();
    window.addEventListener("resize", apply);
    new ResizeObserver(apply).observe(nav);
  }

  function setBottomNavHeight() {
    const bottomNav = document.querySelector(".navbar-bottom");
    if (!bottomNav) return;

    const h = Math.ceil(bottomNav.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--nav-h-bottom", `${h}px`);

    if (window.innerWidth <= 600) document.body.style.paddingBottom = `${h + 12}px`;
    else document.body.style.paddingBottom = "0px";
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

  async function ensureDesktopSpotReady(spot, targetEl) {
    await settleLayout();
    sizeDesktopSpotForTarget(spot, targetEl);
    await settleLayout();
    if (spot.offsetWidth === 0) spot.style.width = "80px";
    if (spot.offsetHeight === 0) spot.style.height = "38px";
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

  function xForDesktopTarget(topNav, spot, targetEl) {
    const navRect = topNav.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    return (tRect.left - navRect.left) + (tRect.width / 2) - (spot.offsetWidth / 2);
  }

  function xForMobileTarget(bottomNav, spot, targetEl) {
    const navRect = bottomNav.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    return (tRect.left - navRect.left) + (tRect.width / 2) - (spot.offsetWidth / 2);
  }

  function initDesktopSpotlight() {
    const topNav = getTopNav();
    if (!topNav) return;

    let spot = topNav.querySelector(".nav-spotlight");
    if (!spot) {
      spot = document.createElement("span");
      spot.className = "nav-spotlight";
      topNav.prepend(spot);
    }

    topNav.classList.add("has-spotlight");
    topNav.__spotIndex = null;

    requestAnimationFrame(() => syncDesktopSpotlight({ instant: true }));

    topNav.addEventListener("click", async (e) => {
      if (isMobileView()) return;

      const authRoot = e.target.closest("#authArea");
      if (!authRoot) return;

      if (!lockNav()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        return;
      }

      try {
        if (isAuthOverlayOpen()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          return;
        }

        const user = getAuthUser();
        const prev = getCurrentDesktopTarget();
        const authTarget = getDesktopAuthTarget();
        if (!authTarget) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        clearAllActives();
        setAuthActive(true);
        await settleLayout();

        if (!user) {
          mount.__savedDesktopHref = targetHref(prev);
          mount.__savedMobileHref = targetHref(getCurrentMobileTarget());
          mount.__bannerOpenedAuth = true;

          if (isHomePath()) {
            hardSnapDesktopSpotlight();
          } else {
            topNav.__spotIndex = indexOfTarget(getDesktopTargets(), prev || authTarget);
            await animateDesktopTo(authTarget);
          }

          if (typeof window.__authOpenSignin === "function") {
            await window.__authOpenSignin();
          }
          return;
        }

        if (isHomePath()) {
          hardSnapDesktopSpotlight();
          window.location.href = "/account/";
          return;
        }

        topNav.__spotIndex = indexOfTarget(getDesktopTargets(), prev || authTarget);
        await animateDesktopTo(authTarget);
        window.location.href = "/account/";
      } finally {
        unlockNav();
      }
    }, true);

    topNav.addEventListener("click", async (e) => {
      if (isMobileView()) return;

      const logo = e.target.closest(".logo a");
      const link = e.target.closest("a[href]");

      if (!logo && !link) return;
      if (link?.closest("#authArea")) return;

      // Allow leaving auth overlay by clicking a real page link
      if (isAuthOverlayOpen()) {
        if (!lockNav()) {
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
            forceCloseAuthOverlays();
            window.location.href = href;
            return;
          }

          const targetEl = link;
          if (!targetEl) return;

          forceCloseAuthOverlays();

          clearAllActives();
          targetEl.classList.add("active");
          await settleLayout();

          topNav.__spotIndex = indexOfTarget(getDesktopTargets(), getDesktopAuthTarget() || targetEl);
          await animateDesktopTo(targetEl);
          window.location.href = href;
        } finally {
          unlockNav();
        }
        return;
      }

      if (!lockNav()) {
        e.preventDefault();
        return;
      }

      try {
        if (logo) {
          e.preventDefault();
          hardSnapDesktopSpotlight();
          window.location.href = logo.getAttribute("href") || "/";
          return;
        }

        if (!link) return;

        const href = link.getAttribute("href") || "";
        if (!isLocalNavHref(href)) return;
        const target = toComparable(href);
        if (target === currentComparablePath()) return;

        const prev = getCurrentDesktopTarget();

        e.preventDefault();

        if (isHomePath() || target === "/index.html") {
          window.location.href = href;
          return;
        }

        clearAllActives();
        link.classList.add("active");
        await settleLayout();

        topNav.__spotIndex = indexOfTarget(getDesktopTargets(), prev || link);
        await animateDesktopTo(link);
        window.location.href = href;
      } finally {
        unlockNav();
      }
    });
  }

  async function animateDesktopTo(targetEl) {
    const topNav = getTopNav();
    const spot = getDesktopSpot();
    if (!topNav || !spot || !targetEl) return;

    const targets = getDesktopTargets();
    if (!targets.length) return;

    let from = topNav.__spotIndex;
    if (from == null || from < 0) {
      from = indexOfTarget(targets, getCurrentDesktopTarget() || targetEl);
      if (from < 0) from = 0;
    }

    const to = indexOfTarget(targets, targetEl);
    if (to < 0) return;

    await ensureDesktopSpotReady(spot, targets[from]);
    sizeDesktopSpotForTarget(spot, targets[from]);
    await settleLayout();

    const x0 = xForDesktopTarget(topNav, spot, targets[from]);
    spot.style.transition = "none";
    spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
    await waitFrame();

    await ensureDesktopSpotReady(spot, targets[to]);
    sizeDesktopSpotForTarget(spot, targets[to]);
    await settleLayout();

    const x1 = xForDesktopTarget(topNav, spot, targets[to]);
    spot.style.transition =
      "transform 240ms cubic-bezier(.22,.9,.18,1), width 220ms cubic-bezier(.22,.9,.18,1), height 220ms cubic-bezier(.22,.9,.18,1)";
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

  function syncDesktopSpotlight({ instant = false } = {}) {
    const topNav = getTopNav();
    const spot = getDesktopSpot();
    if (!topNav || !spot) return;

    const targets = getDesktopTargets();
    if (!targets.length) return;

    let active;
    if (isAuthOverlayOpen()) active = getDesktopAuthTarget();
    else active = getCurrentDesktopTarget();

    const idx = Math.max(0, indexOfTarget(targets, active || targets[0]));
    topNav.__spotIndex = idx;

    requestAnimationFrame(async () => {
      await ensureDesktopSpotReady(spot, targets[idx]);
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

  function hardSnapDesktopSpotlight() {
    const topNav = getTopNav();
    const spot = getDesktopSpot();
    if (!topNav || !spot) {
      syncDesktopSpotlight({ instant: true });
      return;
    }

    try {
      spot.getAnimations?.().forEach((a) => a.cancel());
    } catch {}

    spot.style.transition = "none";
    syncDesktopSpotlight({ instant: true });
  }

  function initMobileSpotlight() {
    const bottomNav = getBottomNav();
    if (!bottomNav) return;

    let spot = bottomNav.querySelector(".nav-spotlight");
    if (!spot) {
      spot = document.createElement("span");
      spot.className = "nav-spotlight";
      bottomNav.prepend(spot);
    }

    bottomNav.classList.add("has-spotlight");
    bottomNav.__spotIndex = null;

    requestAnimationFrame(() => syncMobileSpotlight({ instant: true }));

    bottomNav.addEventListener("click", async (e) => {
      if (!isMobileView()) return;

      if (performance.now() < mount.__ignoreMobileUntil) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        return;
      }

      const authRoot = e.target.closest("#mobileAuthBtn");
      const link = e.target.closest("a[href]");

      if (isAuthOverlayOpen()) {
        // Allow leaving auth overlay by tapping a real page link
        if (!link) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          return;
        }

        const href = link.getAttribute("href") || "";
        if (!isLocalNavHref(href)) return;

        if (!lockNav()) {
          e.preventDefault();
          return;
        }

        try {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();

          forceCloseAuthOverlays();

          clearAllActives();
          link.classList.add("active");
          await settleLayout();

          bottomNav.__spotIndex = indexOfTarget(getMobileTargets(), getMobileAuthTarget() || link);
          await animateMobileTo(link);
          window.location.href = href;
        } finally {
          unlockNav();
        }
        return;
      }

      if (authRoot) {
        if (!lockNav()) {
          e.preventDefault();
          return;
        }

        try {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();

          const authTarget = getMobileAuthTarget();
          if (!authTarget) return;

          const prev = getCurrentMobileTarget();

          clearAllActives();
          setAuthActive(true);
          await settleLayout();

          const user = getAuthUser();

          if (!user) {
            mount.__savedDesktopHref = targetHref(getCurrentDesktopTarget());
            mount.__savedMobileHref = targetHref(prev);
            mount.__bannerOpenedAuth = true;
          }

          bottomNav.__spotIndex = indexOfTarget(getMobileTargets(), prev || authTarget);
          await animateMobileTo(authTarget);

          if (user) {
            window.location.href = "/account/";
          } else if (typeof window.__authOpenSignin === "function") {
            await window.__authOpenSignin();
          }
        } finally {
          unlockNav();
        }
        return;
      }

      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (!isLocalNavHref(href)) return;

      const target = toComparable(href);
      if (target === currentComparablePath()) return;

      if (!lockNav()) {
        e.preventDefault();
        return;
      }

      try {
        const prev = getCurrentMobileTarget();

        e.preventDefault();

        clearAllActives();
        link.classList.add("active");
        await settleLayout();

        bottomNav.__spotIndex = indexOfTarget(getMobileTargets(), prev || link);
        await animateMobileTo(link);
        window.location.href = href;
      } finally {
        unlockNav();
      }
    }, true);
  }

  async function animateMobileTo(targetEl) {
    const bottomNav = getBottomNav();
    const spot = getMobileSpot();
    if (!bottomNav || !spot || !targetEl) return;

    const targets = getMobileTargets();
    if (!targets.length) return;

    await ensureMobileSpotReady(spot);

    let from = bottomNav.__spotIndex;
    if (from == null || from < 0) {
      from = indexOfTarget(targets, getCurrentMobileTarget() || targetEl);
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

  function syncMobileSpotlight({ instant = false } = {}) {
    const bottomNav = getBottomNav();
    const spot = getMobileSpot();
    if (!bottomNav || !spot) return;

    const targets = getMobileTargets();
    if (!targets.length) return;

    let active;
    if (isAuthOverlayOpen()) active = getMobileAuthTarget();
    else active = getCurrentMobileTarget();

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

  function forceAuthActiveUI() {
    clearAllActives();
    setAuthActive(true);
    syncMobileSpotlight({ instant: true });
    syncDesktopSpotlight({ instant: true });
  }

  function forceCloseAuthOverlays() {
    const signin = document.getElementById("id01");
    if (signin) signin.style.display = "none";

    const signup = document.getElementById("signupModal");
    if (signup) signup.style.display = "none";

    window.__authOverlayOpen = null;
    window.__authModalOpen = false;
    mount.__authModalOpen = false;

    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
})();