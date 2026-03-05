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

  // 2) Set active nav (for both top and bottom navs)
  setActiveNav(mount);

  // 3) Set nav height (for the top navbar)
  setNavHeight(mount);

  // 4) Initialize auth button (desktop and mobile)
  const authArea = mount.querySelector("#authArea");
  await initAuthButton(authArea);

  const mobileAuthBtn = mount.querySelector("#mobileAuthBtn");
  if (mobileAuthBtn) {
    // Update mobile auth button to have an image (not text)
    const loginIcon = document.createElement('img');
    loginIcon.src = '/files/user.svg';  // Replace with the appropriate path for your login icon
    loginIcon.alt = 'Login';
    loginIcon.classList.add('nav-icon'); // Add your desired class to match styling
    mobileAuthBtn.appendChild(loginIcon);
    await initAuthButton(mobileAuthBtn);
  }

  // 5) Set bottom navbar height so content is not clipped
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

    // Loop through navbar links and set active class for both top and bottom nav
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

    // Handle logo active state (for Home)
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

  function setBottomNavHeight() {
    const bottomNav = document.querySelector(".navbar-bottom");
    if (!bottomNav) return;

    const h = Math.ceil(bottomNav.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--nav-h-bottom", `${h}px`);

    // Push body content up so it doesn't get clipped on mobile
    if (window.innerWidth <= 600) {
      document.body.style.paddingBottom = `${h}px`;
    } else {
      document.body.style.paddingBottom = "0px";
    }
  }
})();