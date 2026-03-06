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

  // Liquid glass (no banner.html edits)
  mount.querySelector(".navbar")?.classList.add("liquid-glass", "glass-no-clip");
  mount.querySelector(".navbar-bottom")?.classList.add("liquid-glass");

  // -------------------- STATE --------------------
  mount.__authModalOpen = false;
  let __inSetAuth = false; // guard against re-entry

  // helpers exposed for auth.js
  window.__bannerApplyActiveNav = () => {
    setActiveNav(mount);
    syncMobileSpotlight(mount, { instant: true });
  };

  // ✅ Single source of truth for modal-open highlighting + spotlight
  window.__bannerSetAuthModalActive = async (isOpen) => {
    if (__inSetAuth) return;
    __inSetAuth = true;

    try {
      mount.__authModalOpen = !!isOpen;

      const bottomNav = mount.querySelector(".navbar-bottom nav");
      const spot = bottomNav?.querySelector(".nav-spotlight");

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

      const getAuthTarget = () => {
        if (!bottomNav) return null;
        return bottomNav.querySelector("#mobileAuthBtn button") || bottomNav.querySelector("#mobileAuthBtn");
      };

      const getSavedTarget = () => {
        if (!bottomNav) return null;
        // prefer saved href, else fall back to URL-based active
        const savedHref = mount.__savedActiveHrefBottom || "";
        if (savedHref) return bottomNav.querySelector(`a[href="${savedHref}"]`);
        return (
          bottomNav.querySelector("a.active") ||
          bottomNav.querySelector("a") ||
          null
        );
      };

      // Ensure spotlight exists before animating
      if (bottomNav && !spot) {
        initMobileSpotlight(mount);
      }

      // Opening modal: save current actives, then set Login active, animate spotlight to auth
      if (isOpen) {
        const activeBottom = mount.querySelector(".navbar-bottom nav a.active");
        const activeTop = mount.querySelector(".navbar nav a.active");
        mount.__savedActiveHrefBottom = activeBottom?.getAttribute("href") || "";
        mount.__savedActiveHrefTop = activeTop?.getAttribute("href") || "";
        mount.__savedLogoActive = mount.querySelector(".logo a")?.classList.contains("active") || false;

        clearAllActives();
        setAuthActive(true);

        // ✅ Animate spotlight TO login/auth slot
        if (bottomNav) {
          const s = bottomNav.querySelector(".nav-spotlight");
          const authTarget = getAuthTarget();
          if (s && authTarget) {
            await animateSpotlightTo(bottomNav, s, authTarget);
          } else {
            syncMobileSpotlight(mount, { instant: true });
          }
        }

        return;
      }

      // Closing modal: restore based on REAL URL (and account tab), animate spotlight to restored target
      clearAllActives();
      setActiveNav(mount);
      applyAccountAsActiveTab(mount);

      if (bottomNav) {
        const s = bottomNav.querySelector(".nav-spotlight");
        const authTarget = getAuthTarget();

        // If we're on /account/, auth stays active; otherwise move back to page active
        const onAccount = isAccountPath();
        const targetEl = onAccount ? authTarget : getActiveTarget(bottomNav);

        if (s && targetEl) {
          await animateSpotlightTo(bottomNav, s, targetEl);
        } else {
          syncMobileSpotlight(mount, { instant: true });
        }
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

  // Spotlight setup
  initMobileSpotlight(mount);

  // account tab
  applyAccountAsActiveTab(mount);

  // keep consistent on auth changes
  window.addEventListener("auth:state", () => {
    setActiveNav(mount);
    applyAccountAsActiveTab(mount);
    syncMobileSpotlight(mount, { instant: true });
  });

  // Modal events (safety)
  window.addEventListener("modal:open", () => window.__bannerSetAuthModalActive?.(true));
  window.addEventListener("modal:close", () => window.__bannerSetAuthModalActive?.(false));

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
    if (logoLink) {
      const p = (window.location.pathname || "").toLowerCase();
      const isHome = p === "/" || p === "/index.html";
      logoLink.classList.toggle("active", isHome);
    }
  }

  function applyAccountAsActiveTab(mountEl) {
    const onAccount = isAccountPath();

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

      // If modal open and tap a nav link: close modal, animate, navigate
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

      // auth slot click -> auth.js opens modal, banner handles animation on modal:open
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

  function forceCloseSigninModal() {
    const el = document.getElementById("id01");
    if (el) el.style.display = "none";
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    mount.__authModalOpen = false;
    window.__authModalOpen = false;
    window.dispatchEvent(new Event("modal:close"));
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
      if (spot && spot.offsetWidth > 0 && spot.offsetHeight > 0) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (!spot) return;
    if (spot.offsetWidth === 0) spot.style.width = "52px";
    if (spot.offsetHeight === 0) spot.style.height = "52px";
    await new Promise((r) => requestAnimationFrame(r));
  }

  function xForTarget(bottomNav, spot, targetEl) {
    const navRect = bottomNav.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();
    const centerX = (tRect.left - navRect.left) + tRect.width / 2;
    return centerX - spot.offsetWidth / 2;
  }

  async function animateSpotlightTo(bottomNav, spot, targetEl) {
    if (!bottomNav || !spot || !targetEl) return;

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
})();