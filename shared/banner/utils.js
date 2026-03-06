// /shared/banner/utils.js
export function normalizePath(p) {
  if (!p) return "/index.html";
  let x = p.toLowerCase();
  if (x === "/") return "/index.html";
  if (!x.includes(".") && !x.endsWith("/")) x += "/";
  return x;
}

export function toComparable(href) {
  const p = normalizePath(href || "");
  return p.endsWith("/") ? `${p}index.html` : p;
}

export function isLocalNavHref(href) {
  if (!href) return false;
  if (href.startsWith("http")) return false;
  if (href.startsWith("mailto:")) return false;
  if (href.startsWith("#")) return false;
  return true;
}

export function waitFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export async function settleLayout() {
  await waitFrame();
  await waitFrame();
}

export function setNavHeight(mount) {
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

export function setBottomNavHeight() {
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