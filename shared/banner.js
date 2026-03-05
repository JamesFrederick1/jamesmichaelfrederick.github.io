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

  // helpers exposed for auth.js
  window.__bannerApplyActiveNav = () => {
    setActiveNav(mount);
    syncMobileSpotlight(mount, { instant: true });
  };

  window.__bannerSetAuthModalActive = (isOpen) => {
    const bottomNav = mount.querySelector(".navbar-bottom nav");
    const topNav = mount.querySelector(".navbar nav");
    if (!bottomNav && !topNav) return;

    // Helper: clear all active states in both navs (prevents Home staying active)
    const clearAllActives = () => {
      mount.querySelectorAll(".navbar nav a.active, .navbar-bottom nav a.active, .logo a.active")
        .forEach((el) => el.classList.remove("active"));
    };

    const setAuthActive = (active) => {
      // Desktop auth
      const desktopLoginBtn = mount.querySelector("#authArea #authLoginBtn");
      const desktopAccountBtn = mount.querySelector("#authArea #authAccountBtn");
      desktopLoginBtn?.classList.toggle("active", active && !!desktopLoginBtn);
      desktopAccountBtn?.classList.toggle("active", active && !!desktopAccountBtn);

      // Mobile auth slot
      const mobileAuthBtn = mount.querySelector("#mobileAuthBtn button") || mount.querySelector("#mobileAuthBtn");
      mobileAuthBtn?.classList.toggle("active", active);
    };

    if (isOpen) {
      // Save what was active so we can restore it later
      const activeBottom = mount.querySelector(".navbar-bottom nav a.active");
      const activeTop = mount.querySelector(".navbar nav a.active");
      mount.__savedActiveHrefBottom = activeBottom?.getAttribute("href") || "";
      mount.__savedActiveHrefTop = activeTop?.getAttribute("href") || "";
      mount.__savedLogoActive = mount.querySelector(".logo a")?.classList.contains("active") || false;

      // Force: only Login is active while modal open
      clearAllActives();
      setAuthActive(true);

      // Re-sync spotlight to auth
      syncMobileSpotlight(mount, { instant: true });
      return;
    }

    // Modal closed: remove auth active and restore the page highlight
    setAuthActive(false);
    clearAllActives();

    // Restore top nav
    if (mount.__savedLogoActive) {
      mount.querySelector(".logo a")?.classList.add("active");
    } else if (mount.__savedActiveHrefTop) {
      mount.querySelector(`.navbar nav a[href="${mount.__savedActiveHrefTop}"]`)?.classList.add("active");
    } else {
      setActiveNav(mount);
    }

    // Restore bottom nav
    if (mount.__savedActiveHrefBottom) {
      mount.querySelector(`.navbar-bottom nav a[href="${mount.__savedActiveHrefBottom}"]`)?.classList.add("active");
    } else {
      setActiveNav(mount);
    }

    syncMobileSpotlight(mount, { instant: true });
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

  // Spotlight setup
  initMobileSpotlight(mount);

  // if we're on /account/, mark auth as active tab (desktop + mobile)
  applyAccountAsActiveTab(mount);

  // keep things consistent on auth changes
  window.addEventListener("auth:state", () => {
    setActiveNav(mount);
    applyAccountAsActiveTab(mount);
    syncMobileSpotlight(mount, { instant: true });
  });

  setBottomNavHeight();
  window.addEventListener("resize", () => {
    setBottomNavHeight();
    syncMobileSpotlight(mount, { instant: true });
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

  function setActiveNav(mountEl) {
    const current = normalizePath(window.location.pathname);

    // HARD clear (prevents Home + something else)
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

    // logo active only on home
    const logoLink = mountEl.querySelector(".logo a");
    if (logoLink) {
      const p = (window.location.pathname || "").toLowerCase();
      const isHome = p === "/" || p === "/index.html";
      logoLink.classList.toggle("active", isHome);
    }
  }

  function applyAccountAsActiveTab(mountEl) {
    const onAccount = isAccountPath();

    // Desktop: underline the auth button / avatar as active when on /account
    const desktopBtn =
      mountEl.querySelector("#authArea #authAccountBtn") || mountEl.querySelector("#authArea #authLoginBtn");
    if (desktopBtn) desktopBtn.classList.toggle("active", onAccount);

    // Mobile: spotlight should sit on auth slot on /account
    const bottomNav = mountEl.querySelector(".navbar-bottom nav");
    if (!bottomNav) return;
    const mobileBtn =
      bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
    if (mobileBtn) mobileBtn.classList.toggle("active", onAccount);

    if (onAccount) {
      // clear any active link so Home isn't also active
      bottomNav.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
    }
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

    if (window.innerWidth <= 600) {
      document.body.style.paddingBottom = `${h + 12}px`;
    } else {
      document.body.style.paddingBottom = "0px";
    }
  }

  // =============== MOBILE SPOTLIGHT ===============

  function initMobileSpotlight(mountEl) {
    const bottomNav = mountEl.querySelector(".navbar-bottom nav");
    if (!bottomNav) return;

    // create spotlight once
    let spot = bottomNav.querySelector(".nav-spotlight");
    if (!spot) {
      spot = document.createElement("span");
      spot.className = "nav-spotlight";
      bottomNav.prepend(spot);
    }

    // IMPORTANT: disable fallback bubbles via CSS selector nav.has-spotlight ...
    bottomNav.classList.add("has-spotlight");

    bottomNav.__spotIndex = null;

    // place spotlight on current active
    requestAnimationFrame(() => syncMobileSpotlight(mountEl, { instant: true }));

    bottomNav.addEventListener("click", async (e) => {
      if (window.innerWidth > 600) return;

      // auth slot click -> let auth.js handle
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

      // IMPORTANT: prevent navigation so we can animate
      e.preventDefault();

      // Only ONE “active” should exist while moving (prevents 2 circles)
      bottomNav.querySelectorAll("a.active").forEach((a) => a.classList.remove("active"));
      link.classList.add("active");

      await animateSpotlightTo(bottomNav, spot, link);

      window.location.href = href;
    });
  }

  function getTargets(bottomNav) {
    const links = Array.from(bottomNav.querySelectorAll("a"));
    const authSlot = bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
    return authSlot ? [...links, authSlot] : links;
  }

  function findIndex(targets, el) {
    return targets.findIndex((t) => t === el || t.contains(el));
  }

  function getActiveTarget(bottomNav) {
    return (
      bottomNav.querySelector("a.active") ||
      bottomNav.querySelector("#mobileAuthBtn button.active") ||
      bottomNav.querySelector("#mobileAuthBtn.active") ||
      bottomNav.querySelector("a")
    );
  }

  async function ensureSpotHasSize(spot) {
    for (let i = 0; i < 3; i++) {
      if (spot.offsetWidth > 0 && spot.offsetHeight > 0) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (spot.offsetWidth === 0) spot.style.width = "62px";
    if (spot.offsetHeight === 0) spot.style.height = "62px";
    await new Promise((r) => requestAnimationFrame(r));
  }

  function xForTarget(bottomNav, spot, targetEl) {
    const navRect = bottomNav.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const centerX = (tRect.left - navRect.left) + tRect.width / 2;
    return centerX - spot.offsetWidth / 2;
  }

  async function animateSpotlightTo(bottomNav, spot, targetEl) {
    const targets = getTargets(bottomNav);
    if (!targets.length) return;

    await ensureSpotHasSize(spot);

    let from = bottomNav.__spotIndex;
    if (from == null || from < 0) {
      from = findIndex(targets, getActiveTarget(bottomNav));
      if (from < 0) from = 0;
    }

    const to = findIndex(targets, targetEl);
    if (to < 0) return;

    // snap to FROM first to avoid “jump between slots”
    const x0 = xForTarget(bottomNav, spot, targets[from]);
    spot.style.transition = "none";
    spot.style.transform = `translate3d(${x0}px, -50%, 0)`;
    await new Promise((r) => requestAnimationFrame(r));

    const dir = to > from ? 1 : -1;
    const path = [from];
    for (let i = from; i !== to; i += dir) path.push(i + dir);

    const frames = path.map((idx) => {
      const x = xForTarget(bottomNav, spot, targets[idx]);
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
    bottomNav.__spotIndex = to;
  }

  function syncMobileSpotlight(mountEl, { instant = false } = {}) {
    const bottomNav = mountEl.querySelector(".navbar-bottom nav");
    const spot = bottomNav?.querySelector(".nav-spotlight");
    if (!bottomNav || !spot) return;

    const targets = getTargets(bottomNav);
    if (!targets.length) return;

    const active = getActiveTarget(bottomNav);
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

  function cssEscape(s) {
    // tiny safe escape for href selector usage
    return String(s).replace(/"/g, '\\"');
  }
})();