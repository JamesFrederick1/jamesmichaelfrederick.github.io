// /about/slideshow.js
(() => {
  const CONFIG = {
    breakpoint: 600,
    autoplayMs: 3200,
    swipeThreshold: 35,
    startIndex: 0,
    rebuildDebounceMs: 120,
    edgePadPxFallback: 18,

    desktopImages: [
      "/shared/slideshow/desktop/img1.jpeg",
      "/shared/slideshow/desktop/img2.jpeg",
      "/shared/slideshow/desktop/img3.jpeg",
      "/shared/slideshow/desktop/img4.jpeg",
    ],

    phoneImages: [
      "/shared/slideshow/phone/img1.jpeg",
      "/shared/slideshow/phone/img2.jpeg",
      "/shared/slideshow/phone/img3.jpeg",
      "/shared/slideshow/phone/img4.jpeg",
    ],
  };

  const mount = document.getElementById("aboutSlideshow");
  const aboutCard = document.getElementById("aboutCard");
  const closeBtn = document.getElementById("aboutCloseBtn");
  const pageBg = document.querySelector(".page-bg");

  if (!mount) return;

  let mode = getMode();
  let images = getImagesForMode(mode);
  let current = normalizeIndex(CONFIG.startIndex, images.length);

  let autoplayEnabled = false;
  let autoplayTimer = null;
  let resizeTimer = null;
  let animating = false;

  let touchStartX = 0;
  let touchStartY = 0;

  let root = null;
  let laneBox = null;

  const currentPair = { full: null, pill: null };
  const nextPair = { full: null, pill: null };

  let dotsWrap = null;
  let dots = [];

  function getMode() {
    return window.innerWidth <= CONFIG.breakpoint ? "mobile" : "desktop";
  }

  function getImagesForMode(nextMode) {
    return (nextMode === "mobile" ? CONFIG.phoneImages : CONFIG.desktopImages).slice();
  }

  function normalizeIndex(index, length) {
    if (!length) return 0;
    return ((index % length) + length) % length;
  }

  function preloadImages(list) {
    list.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  function updatePageBackdrop(src) {
    if (!pageBg || !src) return;
    pageBg.style.setProperty("--about-page-bg-image", `url("${src}")`);
  }

  function setImgSrc(el, src) {
    if (!el || !src) return;
    if (el.getAttribute("src") !== src) {
      el.setAttribute("src", src);
    }
  }

  function getMs(varName, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!value) return fallback;

    if (value.endsWith("ms")) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    if (value.endsWith("s")) {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed * 1000 : fallback;
    }

    return fallback;
  }

  function getNumber(varName, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!value) return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getTiming() {
    return {
      shrinkMs: getMs("--about-shrink-ms", 220),
      travelMs: getMs("--about-travel-ms", 820),
      settleMs: getMs("--about-settle-ms", 220),
      growMs: getMs("--about-pill-grow-ms", 520),
      backdropSwapDelayMs: getMs("--about-backdrop-swap-delay-ms", 0),

      activeFullOpacity: getNumber("--about-active-lane-opacity", 0.96),
      travelFullOpacity: getNumber("--about-outgoing-travel-lane-opacity", 0.26),
      edgePadPx: getNumber("--about-travel-edge-pad", CONFIG.edgePadPxFallback),

      // pill scale controls when container-2 image blur is allowed to show
      blurSwitchScale: getNumber("--about-blur-switch-scale", 0.56),
    };
  }

  function getTravelPercent() {
    if (!laneBox) return 100;

    const rect = laneBox.getBoundingClientRect();
    const { edgePadPx } = getTiming();

    if (!rect.width || rect.width <= edgePadPx * 2) return 100;

    const usable = rect.width - edgePadPx * 2;
    return (usable / rect.width) * 100;
  }

  function clearAutoplay() {
    if (autoplayTimer) {
      window.clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function queueAutoplay() {
    clearAutoplay();
    if (!autoplayEnabled || animating || images.length <= 1) return;

    autoplayTimer = window.setTimeout(() => {
      goTo(current + 1);
    }, CONFIG.autoplayMs);
  }

  function buildDot(index) {
    const btn = document.createElement("button");
    btn.className = "slideshow__dot";
    btn.type = "button";
    btn.setAttribute("aria-label", `Go to slide ${index + 1}`);
    btn.addEventListener("click", () => {
      if (!autoplayEnabled || animating) return;
      goTo(index);
    });
    return btn;
  }

  function build() {
    mode = getMode();
    images = getImagesForMode(mode);
    current = normalizeIndex(current, images.length);
    preloadImages(images);

    mount.innerHTML = `
      <div class="slideshow" aria-label="About slideshow">
        <div class="slideshow__viewport">
          <div class="slideshow__lane" aria-hidden="true">
            <div class="slideshow__lane-track">
              <img class="slideshow__img slideshow__img--lane slideshow__img--current" alt="" draggable="false" />
              <img class="slideshow__img slideshow__img--lane slideshow__img--next" alt="" draggable="false" />
            </div>
          </div>

          <div class="slideshow__chamber" aria-hidden="true">
            <div class="slideshow__chamber-shell"></div>
          </div>

          <div class="slideshow__pill" aria-hidden="true">
            <div class="slideshow__pill-track">
              <img class="slideshow__img slideshow__img--pill slideshow__img--current" alt="" draggable="false" />
              <img class="slideshow__img slideshow__img--pill slideshow__img--next" alt="" draggable="false" />
            </div>
          </div>
        </div>

        <div class="slideshow__dots" aria-label="Slideshow navigation"></div>
      </div>
    `;

    root = mount.querySelector(".slideshow");
    laneBox = mount.querySelector(".slideshow__lane");

    currentPair.full = mount.querySelector('.slideshow__img--lane.slideshow__img--current');
    currentPair.pill = mount.querySelector('.slideshow__img--pill.slideshow__img--current');
    nextPair.full = mount.querySelector('.slideshow__img--lane.slideshow__img--next');
    nextPair.pill = mount.querySelector('.slideshow__img--pill.slideshow__img--next');

    dotsWrap = mount.querySelector(".slideshow__dots");

    dots = [];
    images.forEach((_, index) => {
      const dot = buildDot(index);
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });

    bindEvents();
    renderRestState();
  }

  function updateDots(activeIndex) {
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
    });
  }

  function setPairSrc(pair, src) {
    setImgSrc(pair.full, src);
    setImgSrc(pair.pill, src);
  }

  function clearPairTransition(pair) {
    pair.full.style.transition = "none";
    pair.pill.style.transition = "none";
  }

  function setPairTransform(pair, xPercent, scale) {
    const t = `translate3d(${xPercent}%, 0, 0) scale(${scale})`;
    pair.full.style.transform = t;
    pair.pill.style.transform = t;
  }

  function setPairTransition(pair, transformMs, opacityMs = transformMs) {
    pair.full.style.transition =
      `transform ${transformMs}ms var(--about-ease-main), opacity ${opacityMs}ms var(--about-ease-soft)`;
    pair.pill.style.transition =
      `transform ${transformMs}ms var(--about-ease-main), opacity ${opacityMs}ms var(--about-ease-soft)`;
  }

  function setPairOpacity(pair, fullOpacity, pillOpacity) {
    pair.full.style.opacity = String(fullOpacity);
    pair.pill.style.opacity = String(pillOpacity);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animatePhase(duration, step) {
    return new Promise((resolve) => {
      const start = performance.now();

      function frame(now) {
        const raw = Math.min(1, (now - start) / duration);
        const eased = easeOutCubic(raw);
        step(eased, raw);

        if (raw < 1) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  }

  async function renderRestState() {
    if (!root || !images.length) return;

    const currentSrc = images[current];
    const nextSrc = images[normalizeIndex(current + 1, images.length)];
    const { activeFullOpacity } = getTiming();
    const travelX = getTravelPercent();

    setPairSrc(currentPair, currentSrc);
    setPairSrc(nextPair, nextSrc);

    clearPairTransition(currentPair);
    clearPairTransition(nextPair);

    setPairTransform(currentPair, 0, 1);
    setPairOpacity(currentPair, activeFullOpacity, 1);

    setPairTransform(nextPair, travelX, 0.4);
    setPairOpacity(nextPair, 0, 0);

    updateDots(current);
    updatePageBackdrop(currentSrc);

    await nextFrame();

    currentPair.full.style.transition = "";
    currentPair.pill.style.transition = "";
    nextPair.full.style.transition = "";
    nextPair.pill.style.transition = "";
  }

  function getDirection(targetIndex) {
    const nextIndex = normalizeIndex(targetIndex, images.length);

    if (nextIndex === normalizeIndex(current + 1, images.length)) return 1;
    if (nextIndex === normalizeIndex(current - 1, images.length)) return -1;

    const forward = (nextIndex - current + images.length) % images.length;
    const backward = (current - nextIndex + images.length) % images.length;

    return forward <= backward ? 1 : -1;
  }

  async function goTo(targetIndex) {
    if (!autoplayEnabled || animating || images.length <= 1 || !root) return;

    const nextIndex = normalizeIndex(targetIndex, images.length);
    if (nextIndex === current) return;

    animating = true;
    clearAutoplay();

    const direction = getDirection(nextIndex);
    const {
      shrinkMs,
      travelMs,
      settleMs,
      growMs,
      backdropSwapDelayMs,
      activeFullOpacity,
      travelFullOpacity,
      blurSwitchScale,
    } = getTiming();

    const travelX = getTravelPercent();
    const enterX = direction > 0 ? travelX : -travelX;
    const leaveX = direction > 0 ? -travelX : travelX;

    const currentSrc = images[current];
    const nextSrc = images[nextIndex];

    setPairSrc(currentPair, currentSrc);
    setPairSrc(nextPair, nextSrc);

    clearPairTransition(currentPair);
    clearPairTransition(nextPair);

    // Active current
    setPairTransform(currentPair, 0, 1);
    setPairOpacity(currentPair, activeFullOpacity, 1);

    // Incoming starts offscreen, hidden
    setPairTransform(nextPair, enterX, 0.4);
    setPairOpacity(nextPair, 0, 0);

    updateDots(nextIndex);

    await nextFrame();

    // 1) SHRINK IN PLACE
    // Container 2 image stays on until pill scale crosses the switch threshold.
    await animatePhase(shrinkMs, (eased) => {
      const scale = lerp(1, 0.4, eased);
      setPairTransform(currentPair, 0, scale);

      const fullOpacity = scale > blurSwitchScale ? activeFullOpacity : 0;
      setPairOpacity(currentPair, fullOpacity, 1);
    });

    // 2) TRAVEL
    // Current goes off through container 2; next comes from container 2 as pill-only.
    await animatePhase(travelMs, (eased) => {
      const currentX = lerp(0, leaveX, eased);
      const nextX = lerp(enterX, 0, eased);

      setPairTransform(currentPair, currentX, 0.4);
      setPairTransform(nextPair, nextX, 0.4);

      // current full visible during travel out, next full hidden during travel in
      setPairOpacity(currentPair, travelFullOpacity, 1);
      setPairOpacity(nextPair, 0, 1);
    });

    if (backdropSwapDelayMs > 0) {
      await wait(backdropSwapDelayMs);
    }

    updatePageBackdrop(nextSrc);

    // hide old pair after it has already gone off through container 2
    setPairOpacity(currentPair, 0, 0);

    // 3) GROW AT CENTER
    // Pill grows once. Container 2 image switches on when pill scale crosses threshold.
    await animatePhase(growMs, (eased) => {
      const scale = lerp(0.4, 1, eased);
      setPairTransform(nextPair, 0, scale);

      const fullOpacity = scale > blurSwitchScale ? activeFullOpacity : 0;
      setPairOpacity(nextPair, fullOpacity, 1);
    });

    // small settle so old pair fully gone
    currentPair.full.style.transition = `opacity ${settleMs}ms var(--about-ease-soft)`;
    currentPair.pill.style.transition = `opacity ${settleMs}ms var(--about-ease-soft)`;
    setPairOpacity(currentPair, 0, 0);

    current = nextIndex;
    await renderRestState();
    animating = false;
    queueAutoplay();
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  function bindEvents() {
    if (!root || root.dataset.bound === "true") return;
    root.dataset.bound = "true";

    root.tabIndex = 0;

    root.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      },
      { passive: true }
    );

    root.addEventListener(
      "touchend",
      (e) => {
        if (!autoplayEnabled || animating) return;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(dx) < CONFIG.swipeThreshold) return;
        if (Math.abs(dx) < Math.abs(dy)) return;

        if (dx < 0) next();
        else prev();
      },
      { passive: true }
    );

    root.addEventListener("keydown", (e) => {
      if (!autoplayEnabled || animating) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        prev();
      }
    });
  }

  function enableSlideshow() {
    if (autoplayEnabled) return;
    autoplayEnabled = true;
    mount.classList.add("is-live");
    queueAutoplay();
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);

    resizeTimer = window.setTimeout(() => {
      const nextMode = getMode();
      if (nextMode !== mode) {
        clearAutoplay();
        build();
        if (autoplayEnabled) queueAutoplay();
      } else {
        renderRestState();
      }
    }, CONFIG.rebuildDebounceMs);
  }

  if (closeBtn && aboutCard) {
    closeBtn.addEventListener("click", () => {
      aboutCard.classList.add("about__card--closed");
      enableSlideshow();
    });
  } else {
    enableSlideshow();
  }

  build();
  window.addEventListener("resize", handleResize);
})();