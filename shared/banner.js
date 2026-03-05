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

  // expose a global so auth.js can restore active tabs after modal closes
  window.__bannerApplyActiveNav = () => setActiveNav(mount);

  // initial page active
  setActiveNav(mount);

  setNavHeight(mount);

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

  setBottomNavHeight();
  window.addEventListener("resize", setBottomNavHeight);

  // -------------------- HELPERS --------------------

  function normalizePath(p) {
    if (!p) return "/index.html";
    let x = p.toLowerCase();
    if (x === "/") return "/index.html";
    if (!x.includes(".") && !x.endsWith("/")) x += "/";
    return x;
  }

  function setActiveNav(mountEl) {
    const current = normalizePath(window.location.pathname);

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
      const p = window.location.pathname.toLowerCase();
      const isHome = p === "/" || p === "/index.html";
      logoLink.classList.toggle("active", isHome);
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
})();