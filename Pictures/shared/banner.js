// /shared/banner.js
import { initAuthButton } from "/shared/auth.js";

(async function () {
  const mount = document.getElementById("bannerMount");
  if (!mount) return;
  

  // 1) Inject banner HTML
  const res = await fetch("/shared/banner.html", { cache: "no-store" });
  if (!res.ok) {
    console.error("banner.html fetch failed:", res.status);
    return;
  }
  mount.innerHTML = await res.text();

  // 2) Active nav (keep your existing)
  setActiveNav(mount);

  // 3) Nav height (keep your existing)
  setNavHeight(mount);

  // 4) Auth button (NEW) — must happen AFTER mount.innerHTML
  const authArea = mount.querySelector("#authArea");
  await initAuthButton(authArea);

  // ----- your existing helpers below -----
  function normalizePath(p) {
    if (!p) return "/index.html";
    let x = p.toLowerCase();
    if (x === "/") return "/index.html";
    if (!x.includes(".") && !x.endsWith("/")) x += "/";
    return x;
  }

  function setActiveNav(mountEl) {
    const current = normalizePath(window.location.pathname);

    mountEl.querySelectorAll(".navbar nav a").forEach((a) => {
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
      const isHome = (p === "/" || p === "/index.html"); // root only
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
})();