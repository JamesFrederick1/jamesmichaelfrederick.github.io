// /about/slideshow.js
(() => {
  const CONFIG = {
    breakpoint: 600,
    autoplayMs: 2400,
    swipeThreshold: 35,
    startIndex: 0,
    transitionMs: 380,
    blurFill: true,

    // mobile-only inline blur fixes
    mobileBgBleedPx: 42,
    mobileBgBlur: "26px",
    mobileBgScale: "1.10",
    mobileBgOpacity: "0.98",

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

  let currentMode = getMode();
  let current = CONFIG.startIndex;
  let intervalId = null;
  let touchStartX = 0;
  let animating = false;
  let paused = false;
  let resizeTimer = null;

  let slideshow = null;
  let slidesWrap = null;
  let dotsWrap = null;
  let slides = [];
  let dots = [];
  let images = [];

  function getMode() {
    return window.innerWidth <= CONFIG.breakpoint ? "mobile" : "desktop";
  }

  function getImagesForMode(mode) {
    return mode === "mobile" ? CONFIG.phoneImages : CONFIG.desktopImages;
  }

  function normalizeIndex(index, length) {
    return ((index % length) + length) % length;
  }

  function updatePageBackground(src) {
    if (!pageBg) return;

    if (currentMode === "desktop") {
      pageBg.style.setProperty("--about-page-bg-image", `url("${src}")`);
    } else {
      pageBg.style.removeProperty("--about-page-bg-image");
    }
  }

  function applyMobileInlineBlur(slide) {
    if (currentMode !== "mobile") return;

    const bg = slide.querySelector(".slideshow__bg");
    const img = slide.querySelector(".slideshow__img");
    if (!bg || !img) return;

    const bleed = `${CONFIG.mobileBgBleedPx}px`;

    // force blur layer on and make it big enough so blur doesn't clip ugly
    bg.style.display = "block";
    bg.style.position = "absolute";
    bg.style.top = `-${bleed}`;
    bg.style.right = `-${bleed}`;
    bg.style.bottom = `-${bleed}`;
    bg.style.left = `-${bleed}`;
    bg.style.filter = `blur(${CONFIG.mobileBgBlur})`;
    bg.style.transform = `scale(${CONFIG.mobileBgScale})`;
    bg.style.opacity = CONFIG.mobileBgOpacity;
    bg.style.zIndex = "0";
    bg.style.pointerEvents = "none";
    bg.style.backgroundPosition = "center";
    bg.style.backgroundRepeat = "no-repeat";
    bg.style.backgroundSize = "cover";

    // keep clean image above blur
    img.style.position = "relative";
    img.style.zIndex = "1";
  }

  function clearDesktopInlineBlur(slide) {
    if (currentMode !== "desktop") return;

    const bg = slide.querySelector(".slideshow__bg");
    const img = slide.querySelector(".slideshow__img");
    if (!bg || !img) return;

    bg.style.display = "";
    bg.style.position = "";
    bg.style.top = "";
    bg.style.right = "";
    bg.style.bottom = "";
    bg.style.left = "";
    bg.style.filter = "";
    bg.style.transform = "";
    bg.style.opacity = "";
    bg.style.zIndex = "";
    bg.style.pointerEvents = "";
    bg.style.backgroundPosition = "";
    bg.style.backgroundRepeat = "";
    bg.style.backgroundSize = "";

    img.style.position = "";
    img.style.zIndex = "";
  }

  function buildSlide(src, index) {
    const slide = document.createElement("div");
    slide.className = "slideshow__slide";

    const bg = document.createElement("div");
    bg.className = "slideshow__bg";
    bg.style.backgroundImage = `url("${src}")`;

    const img = document.createElement("img");
    img.className = "slideshow__img";
    img.src = src;
    img.alt = `Slideshow image ${index + 1}`;
    img.loading = index === 0 ? "eager" : "lazy";
    img.decoding = "async";
    img.draggable = false;

    slide.appendChild(bg);
    slide.appendChild(img);

    if (currentMode === "mobile") {
      applyMobileInlineBlur(slide);
    } else {
      clearDesktopInlineBlur(slide);
    }

    return slide;
  }

  function buildDot(index) {
    const dot = document.createElement("button");
    dot.className = "slideshow__dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `Go to slide ${index + 1}`);
    dot.addEventListener("click", () => {
      goTo(index);
    });
    return dot;
  }

  function clearSlideClasses() {
    slides.forEach((slide) => {
      slide.classList.remove("is-active", "is-prev", "is-next", "is-animating");
    });
  }

  function renderStatic() {
    if (!slides.length) return;

    clearSlideClasses();

    const prev = normalizeIndex(current - 1, slides.length);
    const next = normalizeIndex(current + 1, slides.length);

    slides[current].classList.add("is-active");
    slides[prev].classList.add("is-prev");
    slides[next].classList.add("is-next");

    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === current);
    });

    updatePageBackground(images[current]);
  }

  function goTo(targetIndex) {
    if (animating || !slides.length) return;

    const nextIndex = normalizeIndex(targetIndex, slides.length);
    if (nextIndex === current) return;

    const oldIndex = current;
    const forward = nextIndex === normalizeIndex(oldIndex + 1, slides.length);

    animating = true;

    clearSlideClasses();

    slides.forEach((slide) => {
      slide.classList.add("is-animating");
    });

    slides[oldIndex].classList.add("is-active");
    slides[nextIndex].classList.add(forward ? "is-next" : "is-prev");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slides[oldIndex].classList.remove("is-active");
        slides[oldIndex].classList.add(forward ? "is-prev" : "is-next");

        slides[nextIndex].classList.remove(forward ? "is-next" : "is-prev");
        slides[nextIndex].classList.add("is-active");
      });
    });

    window.setTimeout(() => {
      current = nextIndex;
      animating = false;
      renderStatic();
      restartAutoplay();
    }, CONFIG.transitionMs);
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  function stopAutoplay() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();

    if (images.length <= 1) return;

    intervalId = window.setInterval(() => {
      if (!paused && !animating) next();
    }, CONFIG.autoplayMs);
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  function bindEvents() {
    if (!slideshow) return;

    slideshow.addEventListener("mouseenter", () => {
      paused = true;
    });

    slideshow.addEventListener("mouseleave", () => {
      paused = false;
    });

    slideshow.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );

    slideshow.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) < CONFIG.swipeThreshold || animating) return;

        if (dx < 0) next();
        else prev();
      },
      { passive: true }
    );
  }

  function build() {
    currentMode = getMode();
    images = getImagesForMode(currentMode).slice();
    current = normalizeIndex(current, images.length);

    mount.innerHTML = `
      <div class="slideshow${CONFIG.blurFill ? " slideshow--blur-fill" : ""}" aria-label="About slideshow">
        <div class="slideshow__slides"></div>
        <div class="slideshow__dots" aria-label="Slideshow navigation"></div>
      </div>
    `;

    slideshow = mount.querySelector(".slideshow");
    slidesWrap = mount.querySelector(".slideshow__slides");
    dotsWrap = mount.querySelector(".slideshow__dots");

    slides = [];
    dots = [];

    images.forEach((src, index) => {
      const slide = buildSlide(src, index);
      slidesWrap.appendChild(slide);
      slides.push(slide);

      const dot = buildDot(index);
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });

    bindEvents();
    renderStatic();
    startAutoplay();
  }

  function handleResize() {
    clearTimeout(resizeTimer);

    resizeTimer = window.setTimeout(() => {
      const newMode = getMode();
      if (newMode !== currentMode) {
        stopAutoplay();
        animating = false;
        paused = false;
        build();
      }
    }, 120);
  }

  if (closeBtn && aboutCard) {
    closeBtn.addEventListener("click", () => {
      aboutCard.classList.add("about__card--closed");
    });
  }

  window.addEventListener("resize", handleResize);

  build();
})();