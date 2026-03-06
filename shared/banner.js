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

  // Liquid glass
  mount.querySelector(".navbar")?.classList.add("liquid-glass", "glass-no-clip");
  mount.querySelector(".navbar-bottom")?.classList.add("liquid-glass");

  // -------------------- STATE --------------------
  mount.__authModalOpen = false;
  let __inSetAuth = false;

  window.__bannerApplyActiveNav = () => {
    if (mount.__authModalOpen || document.body.classList.contains("modal-open")) return;
    setActiveNav(mount);
    applyAccountAsActiveTab(mount);
    syncMobileSpotlight(mount, { instant: true });
    syncDesktopSpotlight(mount, { instant: true });
  };

  window.__bannerSetAuthModalActive = async (isOpen) => {
    if (__inSetAuth) return;
    __inSetAuth = true;

    try {
      mount.__authModalOpen = !!isOpen;

      const bottomNav = mount.querySelector(".navbar-bottom nav");
      const topNav = mount.querySelector(".navbar nav");

      if (bottomNav && !bottomNav.querySelector(".nav-spotlight")) initMobileSpotlight(mount);
      if (topNav && !topNav.querySelector(".nav-spotlight")) initDesktopSpotlight(mount);

      const clearAllActives = () => {
        mount
          .querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active")
          .forEach((el) => el.classList.remove("active"));
        mount.querySelector("#authArea #authLoginBtn")?.classList.remove("active");
        mount.querySelector("#authArea #authAccountBtn")?.classList.remove("active");
        mount.querySelector("#mobileAuthBtn button")?.classList.remove("active");
        mount.querySelector("#mobileAuthBtn")?.classList.remove("active");
      };

      const setAuthActive = (active) => {
        const desktopLoginBtn = mount.querySelector("#authArea #authLoginBtn");
        const desktopAccountBtn = mount.querySelector("#authArea #authAccountBtn");
        desktopLoginBtn?.classList.toggle("active", !!active && !!desktopLoginBtn);
        desktopAccountBtn?.classList.toggle("active", !!active && !!desktopAccountBtn);

        const mobileAuthBtn =
          mount.querySelector("#mobileAuthBtn button") || mount.querySelector("#mobileAuthBtn");
        mobileAuthBtn?.classList.toggle("active", !!active);
      };

      if (isOpen) {
        const activeBottom = mount.querySelector(".navbar-bottom nav a.active");
        const activeTop = mount.querySelector(".navbar nav a.active");
        mount.__savedActiveHrefBottom = activeBottom?.getAttribute("href") || "";
        mount.__savedActiveHrefTop = activeTop?.getAttribute("href") || "";
        mount.__savedLogoActive = mount.querySelector(".logo a")?.classList.contains("active") || false;

        clearAllActives();
        setAuthActive(true);

        // MOBILE: animate to auth slot
        if (bottomNav) {
          const s = bottomNav.querySelector(".nav-spotlight");
          const authTarget =
            bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
          if (s && authTarget) await animateSpotlightTo(bottomNav, s, authTarget);
          else syncMobileSpotlight(mount, { instant: true });
        }

        // DESKTOP: animate to auth (login/account)
        if (topNav) {
          const s = topNav.querySelector(".nav-spotlight");
          const authTarget =
            topNav.querySelector("#authArea #authLoginBtn") || topNav.querySelector("#authArea #authAccountBtn");
          if (s && authTarget) await animateDesktopSpotlightTo(topNav, s, authTarget);
          else syncDesktopSpotlight(mount, { instant: true });
        }

        return;
      }

      clearAllActives();
      setActiveNav(mount);
      applyAccountAsActiveTab(mount);

      if (bottomNav) {
        const s = bottomNav.querySelector(".nav-spotlight");
        const authTarget =
          bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
        const onAccount = isAccountPath();
        const targetEl = onAccount ? authTarget : getActiveMobileTarget(bottomNav);
        if (s && targetEl) await animateSpotlightTo(bottomNav, s, targetEl);
        else syncMobileSpotlight(mount, { instant: true });
      }

      if (topNav) {
        const s = topNav.querySelector(".nav-spotlight");
        const authBtn =
          topNav.querySelector("#authArea #authAccountBtn") || topNav.querySelector("#authArea #authLoginBtn");
        const onAccount = isAccountPath();
        const targetEl = onAccount ? authBtn : getActiveDesktopTarget(topNav, mount);
        if (s && targetEl) await animateDesktopSpotlightTo(topNav, s, targetEl);
        else syncDesktopSpotlight(mount, { instant: true });
      }
    } finally {
      __inSetAuth = false;
    }
  };

  // initial actives
  setActiveNav(mount);
  setNavHeight(mount);

  // auth mounts
  let authArea = mount.querySelector("#authArea");
  if (!authArea) {
    authArea = document.createElement("span");
    authArea.id = "authArea";
    authArea.classList.add("auth-area");
    const nav = mount.querySelector(".navbar nav");
    if (nav) nav.appendChild(authArea);
    else mount.appendChild(authArea);
  }
  await initAuthButton(authArea, { variant: "desktop" });

  const mobileAuthBtn = mount.querySelector("#mobileAuthBtn");
  if (mobileAuthBtn) {
    mobileAuthBtn.textContent = "";
    await initAuthButton(mobileAuthBtn, { variant: "mobile" });
  }

  initMobileSpotlight(mount);
  initDesktopSpotlight(mount);
  applyAccountAsActiveTab(mount);

  window.addEventListener("auth:state", () => {
    if (mount.__authModalOpen || document.body.classList.contains("modal-open")) return;
    setActiveNav(mount);
    applyAccountAsActiveTab(mount);
    syncMobileSpotlight(mount, { instant: true });
    syncDesktopSpotlight(mount, { instant: true });
  });

  window.addEventListener("modal:open", () => window.__bannerSetAuthModalActive?.(true));
  window.addEventListener("modal:close", () => window.__bannerSetAuthModalActive?.(false));

  setBottomNavHeight();
  window.addEventListener("resize", () => {
    setBottomNavHeight();
    if (!(mount.__authModalOpen || document.body.classList.contains("modal-open"))) {
      syncMobileSpotlight(mount, { instant: true });
      syncDesktopSpotlight(mount, { instant: true });
    }
  });

  // -------------------- HELPERS --------------------

  function normalizePath(p) {
    if (!p) return "/index.html";
    let x = p.toLowerCase();
    if (x === "/") return "/index.html";
    if (!x.includes(".") && !x.endsWith("/")) x += "/";
    return x;
  }

  function isAccountPath() {
    const p = (window.location.pathname || "").toLowerCase();
    return p === "/account/" || p === "/account/index.html" || p.startsWith("/account/");
  }

  function isHomePath() {
    const p = (window.location.pathname || "").toLowerCase();
    return p === "/" || p === "/index.html";
  }

  function setActiveNav(mountEl) {
    const current = normalizePath(window.location.pathname);

    mountEl
      .querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active")
      .forEach((el) => el.classList.remove("active"));

    mountEl.querySelectorAll(".navbar nav a, .navbar-bottom nav a").forEach((a) => {
      const hrefRaw = a.getAttribute("href") || "";
      const href = normalizePath(hrefRaw);
      const hrefIndex = href.endsWith("/") ? href + "index.html" : href;

      const isActive =
        current === href ||
        current === hrefIndex ||
        (href.endsWith("/") && current.startsWith(href));

      a.classList.toggle("active", isActive);
    });

    const logoLink = mountEl.querySelector(".logo a");
    if (logoLink) logoLink.classList.toggle("active", isHomePath());
  }

  function applyAccountAsActiveTab(mountEl) {
    const onAccount = isAccountPath();

    const topNav = mountEl.querySelector(".navbar nav");
    if (onAccount && topNav) {
      topNav.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
      mountEl.querySelector(".logo a")?.classList.remove("active");
    }

    const desktopBtn =
      mountEl.querySelector("#authArea #authAccountBtn") ||
      mountEl.querySelector("#authArea #authLoginBtn");
    if (desktopBtn) desktopBtn.classList.toggle("active", onAccount);

    const bottomNav = mountEl.querySelector(".navbar-bottom nav");
    if (!bottomNav) return;

    const mobileBtn =
      bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
    if (mobileBtn) mobileBtn.classList.toggle("active", onAccount);

    if (onAccount) bottomNav.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
  }

  function setNavHeight(mountEl) {
    const nav = mountEl.querySelector(".navbar");
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

  // -------------------- MOBILE SPOTLIGHT --------------------

  function initMobileSpotlight(mountEl) {
    const bottomNav = mountEl.querySelector(".navbar-bottom nav");
    if (!bottomNav) return;

    let spot = bottomNav.querySelector(".nav-spotlight");
    if (!spot) {
      spot = document.createElement("span");
      spot.className = "nav-spotlight";
      bottomNav.prepend(spot);
    }
    bottomNav.classList.add("has-spotlight");
    bottomNav.__spotIndex = null;

    requestAnimationFrame(() => syncMobileSpotlight(mountEl, { instant: true }));

    bottomNav.addEventListener("click", async (e) => {
      if (window.innerWidth > 600) return;

      const isModalOpen = mountEl.__authModalOpen || document.body.classList.contains("modal-open");

      if (isModalOpen) {
        const link = e.target.closest("a[href]");
        if (!link) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const href = link.getAttribute("href") || "";
        if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) return;

        e.preventDefault();
        e.stopPropagation();

        forceCloseSigninModal();
        await window.__bannerSetAuthModalActive?.(false);

        bottomNav.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
        link.classList.add("active");

        await animateSpotlightTo(bottomNav, bottomNav.querySelector(".nav-spotlight"), link);
        window.location.href = href;
        return;
      }

      if (e.target.closest("#mobileAuthBtn")) return;

      const link = e.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) return;

      const current = normalizePath(window.location.pathname);
      const targetPath = normalizePath(href);
      const targetIndex = targetPath.endsWith("/") ? targetPath + "index.html" : targetPath;

      const isSame =
        current === targetPath ||
        current === targetIndex ||
        (targetPath.endsWith("/") && current.startsWith(targetPath));

      if (isSame) return;

      e.preventDefault();

      bottomNav.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
      link.classList.add("active");

      await animateSpotlightTo(bottomNav, bottomNav.querySelector(".nav-spotlight"), link);
      window.location.href = href;
    });
  }

  function getMobileTargets(bottomNav) {
    const links = Array.from(bottomNav.querySelectorAll("a"));
    const authSlot = bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
    return authSlot ? [...links, authSlot] : links;
  }

  function findIndex(targets, el) {
    return targets.findIndex((t) => t === el || t.contains(el));
  }

  function getActiveMobileTarget(bottomNav) {
    return (
      bottomNav.querySelector("a.active") ||
      bottomNav.querySelector("#mobileAuthBtn button.active") ||
      bottomNav.querySelector("#mobileAuthBtn.active") ||
      bottomNav.querySelector("a")
    );
  }

  async function ensureSpotHasSize(spot) {
    for (let i = 0; i < 3; i++) {
      if (spot && spot.offsetWidth > 0 && spot.offsetHeight > 0) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (!spot) return;
    if (spot.offsetWidth === 0) spot.style.width = "52px";
    if (spot.offsetHeight === 0) spot.style.height = "52px";
    await new Promise((r) => requestAnimationFrame(r));
  }

  function xForTarget(navEl, spot, targetEl) {
    const navRect = navEl.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const centerX = (tRect.left - navRect.left) + tRect.width / 2;
    return centerX - spot.offsetWidth / 2;
  }

  async function animateSpotlightTo(navEl, spot, targetEl) {
    if (!navEl || !spot || !targetEl) return;

    const targets = getMobileTargets(navEl);
    if (!targets.length) return;

    await ensureSpotHasSize(spot);

    let from = navEl.__spotIndex;
    if (from == null || from < 0) {
      from = findIndex(targets, getActiveMobileTarget(navEl));
      if (from < 0) from = 0;
    }

    const to = findIndex(targets, targetEl);
    if (to < 0) return;

    const x0 = xForTarget(navEl, spot, targets[from]);
    spot.style.transition = "none";
    spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
    await new Promise((r) => requestAnimationFrame(r));

    const dir = to > from ? 1 : -1;
    const path = [from];
    for (let i = from; i !== to; i += dir) path.push(i + dir);

    const frames = path.map((idx) => {
      const x = xForTarget(navEl, spot, targets[idx]);
      return { transform: `translate3d(${x}px, -50%, 0)` };
    });

    const hops = Math.max(1, path.length - 1);
    const duration = Math.min(520, 160 + hops * 80);

    const anim = spot.animate(frames, {
      duration,
      easing: "cubic-bezier(.2,.9,.2,1)",
      fill: "forwards",
    });

    await anim.finished.catch(() => {});
    navEl.__spotIndex = to;
  }

  function syncMobileSpotlight(mountEl, { instant = false } = {}) {
    const bottomNav = mountEl.querySelector(".navbar-bottom nav");
    const spot = bottomNav?.querySelector(".nav-spotlight");
    if (!bottomNav || !spot) return;

    const targets = getMobileTargets(bottomNav);
    if (!targets.length) return;

    const active = getActiveMobileTarget(bottomNav);
    const idx = Math.max(0, findIndex(targets, active));
    bottomNav.__spotIndex = idx;

    requestAnimationFrame(async () => {
      await ensureSpotHasSize(spot);
      const x = xForTarget(bottomNav, spot, targets[idx]);

      if (instant) {
        spot.style.transition = "none";
        spot.style.transform = `translate3d(${x}px, -50%, 0)`;
        requestAnimationFrame(() => (spot.style.transition = ""));
      } else {
        spot.style.transform = `translate3d(${x}px, -50%, 0)`;
      }
    });
  }

  // -------------------- DESKTOP SPOTLIGHT --------------------

  function initDesktopSpotlight(mountEl) {
    const topNav = mountEl.querySelector(".navbar nav");
    if (!topNav) return;

    let spot = topNav.querySelector(".nav-spotlight");
    if (!spot) {
      spot = document.createElement("span");
      spot.className = "nav-spotlight";
      topNav.prepend(spot);
    }
    topNav.classList.add("has-spotlight");
    topNav.__spotIndex = null;

    // CAPTURE interceptor for auth button (account anims)
    topNav.addEventListener(
      "click",
      async (e) => {
        if (window.innerWidth <= 600) return;
        const isModalOpen = mountEl.__authModalOpen || document.body.classList.contains("modal-open");
        if (isModalOpen) return;

        const inAuth = e.target.closest("#authArea");
        if (!inAuth) return;

        const loginBtn = topNav.querySelector("#authArea #authLoginBtn");
        const accountBtn = topNav.querySelector("#authArea #authAccountBtn");

        // logged out -> let auth.js open modal
        if (loginBtn && !accountBtn) return;

        // logged in -> we own the navigation
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        mountEl.querySelectorAll(".navbar nav a.active, .logo a.active").forEach((x) => x.classList.remove("active"));
        accountBtn?.classList.add("active");

        // do NOT animate from home
        if (isHomePath()) {
          window.location.href = "/account/";
          return;
        }

        await animateDesktopSpotlightTo(topNav, topNav.querySelector(".nav-spotlight"), accountBtn);
        window.location.href = "/account/";
      },
      true
    );

    requestAnimationFrame(() => syncDesktopSpotlight(mountEl, { instant: true }));

    topNav.addEventListener("click", async (e) => {
      if (window.innerWidth <= 600) return;

      const isModalOpen = mountEl.__authModalOpen || document.body.classList.contains("modal-open");
      if (isModalOpen) return; // modal logic handled elsewhere

      // logo click -> always instant
      const logoA = e.target.closest(".logo a");
      if (logoA) {
        const href = logoA.getAttribute("href") || "/";
        e.preventDefault();
        window.location.href = href;
        return;
      }

      const link = e.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) return;

      const current = normalizePath(window.location.pathname);
      const targetPath = normalizePath(href);
      const targetIndex = targetPath.endsWith("/") ? targetPath + "index.html" : targetPath;

      const isSame =
        current === targetPath ||
        current === targetIndex ||
        (targetPath.endsWith("/") && current.startsWith(targetPath));

      if (isSame) return;

      // ✅ NO spotlight updates AT ALL when leaving HOME
      if (isHomePath() && targetPath !== "/index.html") {
        e.preventDefault();
        window.location.href = href;
        return;
      }

      // ✅ also no animation TO HOME (instant)
      if (targetPath === "/index.html") {
        e.preventDefault();
        window.location.href = href;
        return;
      }

      e.preventDefault();

      mountEl.querySelectorAll(".navbar nav a.active, .logo a.active").forEach((x) => x.classList.remove("active"));
      link.classList.add("active");

      await animateDesktopSpotlightTo(topNav, topNav.querySelector(".nav-spotlight"), link);
      window.location.href = href;
    });
  }

  function getDesktopTargets(topNav, mountEl) {
    const logoA = mountEl.querySelector(".navbar .logo a");
    const links = Array.from(topNav.querySelectorAll("a"));
    const authBtn =
      topNav.querySelector("#authArea #authAccountBtn") || topNav.querySelector("#authArea #authLoginBtn");

    const out = [];
    if (logoA) out.push(logoA);
    out.push(...links);
    if (authBtn) out.push(authBtn);
    return out;
  }

  function getActiveDesktopTarget(topNav, mountEl) {
    if (isAccountPath()) {
      return (
        topNav.querySelector("#authArea #authAccountBtn") ||
        topNav.querySelector("#authArea #authLoginBtn") ||
        topNav.querySelector("a") ||
        mountEl.querySelector(".navbar .logo a")
      );
    }

    const logoA = mountEl.querySelector(".navbar .logo a");
    if (logoA && logoA.classList.contains("active")) return logoA;

    const aActive = topNav.querySelector("a.active");
    if (aActive) return aActive;

    const authActive =
      topNav.querySelector("#authArea #authLoginBtn.active") || topNav.querySelector("#authArea #authAccountBtn.active");
    if (authActive) return authActive;

    if (logoA && isHomePath()) return logoA;

    return topNav.querySelector("a") || logoA || null;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function sizeDesktopSpotForTarget(spot, targetEl, mountEl) {
    if (!spot || !targetEl) return;

    const isLogo = !!targetEl.closest?.(".logo");
    const isAuth = targetEl.id === "authLoginBtn" || targetEl.id === "authAccountBtn";
    const r = targetEl.getBoundingClientRect();

    let w, h;

    // ✅ HOME spotlight: extremely subtle (prevents “white wash”)
    if (isLogo) {
      w = 30;
      h = 30;
      spot.style.background = "rgba(212,175,55,0.08)";
      spot.style.borderColor = "rgba(212,175,55,0.14)";
    } else {
      spot.style.background = "rgba(212,175,55,0.34)";
      spot.style.borderColor = "rgba(212,175,55,0.45)";

      if (isAuth) {
        w = clamp(r.width + 18, 52, 140);
        h = 40;
      } else {
        w = clamp(r.width + 22, 58, 170);
        h = 38;
      }
    }

    spot.style.width = `${w}px`;
    spot.style.height = `${h}px`;
    spot.style.borderRadius = "999px";
  }

  async function ensureDesktopSpotReady(spot, targetEl, mountEl) {
    await new Promise((r) => requestAnimationFrame(r));
    sizeDesktopSpotForTarget(spot, targetEl, mountEl);
    await new Promise((r) => requestAnimationFrame(r));
    if (spot.offsetWidth === 0) spot.style.width = "80px";
    if (spot.offsetHeight === 0) spot.style.height = "38px";
  }

  function xForDesktopTarget(topNav, spot, targetEl) {
    const navRect = topNav.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const centerX = (tRect.left - navRect.left) + tRect.width / 2;
    return centerX - spot.offsetWidth / 2;
  }

  async function animateDesktopSpotlightTo(topNav, spot, targetEl) {
    if (!topNav || !spot || !targetEl) return;

    await ensureDesktopSpotReady(spot, targetEl, mount);

    const targets = getDesktopTargets(topNav, mount);
    if (!targets.length) return;

    let from = topNav.__spotIndex;
    if (from == null || from < 0) {
      from = findIndex(targets, getActiveDesktopTarget(topNav, mount));
      if (from < 0) from = 0;
    }

    const to = findIndex(targets, targetEl);
    if (to < 0) return;

    sizeDesktopSpotForTarget(spot, targets[from], mount);
    const x0 = xForDesktopTarget(topNav, spot, targets[from]);

    spot.style.transition = "none";
    spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
    await new Promise((r) => requestAnimationFrame(r));

    sizeDesktopSpotForTarget(spot, targets[to], mount);
    const x1 = xForDesktopTarget(topNav, spot, targets[to]);

    spot.style.transition =
      "transform 240ms cubic-bezier(.22,.9,.18,1), width 220ms cubic-bezier(.22,.9,.18,1), height 220ms cubic-bezier(.22,.9,.18,1)";
    spot.style.transform = `translate3d(${x1}px, -50%, 0)`;

    await new Promise((r) => setTimeout(r, 260));
    topNav.__spotIndex = to;
  }

  function syncDesktopSpotlight(mountEl, { instant = false } = {}) {
    const topNav = mountEl.querySelector(".navbar nav");
    const spot = topNav?.querySelector(".nav-spotlight");
    if (!topNav || !spot) return;

    const targets = getDesktopTargets(topNav, mountEl);
    if (!targets.length) return;

    const active = getActiveDesktopTarget(topNav, mountEl);
    const idx = Math.max(0, findIndex(targets, active));
    topNav.__spotIndex = idx;

    requestAnimationFrame(async () => {
      await ensureDesktopSpotReady(spot, targets[idx], mountEl);
      const x = xForDesktopTarget(topNav, spot, targets[idx]);

      if (instant) {
        // IMPORTANT: do NOT "restore" transition on next frame (prevents stretch/glitch)
        spot.style.transition = "none";
        spot.style.transform = `translate3d(${x}px, -50%, 0)`;
      } else {
        spot.style.transition =
          "transform 240ms cubic-bezier(.22,.9,.18,1), width 220ms cubic-bezier(.22,.9,.18,1), height 220ms cubic-bezier(.22,.9,.18,1)";
        spot.style.transform = `translate3d(${x}px, -50%, 0)`;
      }
    });
  }

  function forceCloseSigninModal() {
    const el = document.getElementById("id01");
    if (el) el.style.display = "none";
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    mount.__authModalOpen = false;
    window.__authModalOpen = false;
    window.dispatchEvent(new Event("modal:close"));
  }
})();