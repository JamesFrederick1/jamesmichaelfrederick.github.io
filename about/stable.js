// /about/slideshow.js
(() => {
  const CONFIG = {
    breakpoint: 600,
    autoplayMs: 2400,
    swipeThreshold: 35,
    startIndex: 0,
    transitionMs: 380,
    pauseOnHover: false,
    blurFill: true,

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

  function getMode() {
    return window.innerWidth <= CONFIG.breakpoint ? "mobile" : "desktop";
  }

  function getImagesForMode(currentMode) {
    return (currentMode === "mobile" ? CONFIG.phoneImages : CONFIG.desktopImages).slice();
  }

  function normalizeIndex(index, length) {
    if (!length) return 0;
    return ((index % length) + length) % length;
  }

  function updateDesktopPageBlur(src) {
    if (!pageBg) return;

    if (mode === "desktop") {
      pageBg.style.setProperty("--about-page-bg-image", `url("${src}")`);
    } else {
      pageBg.style.removeProperty("--about-page-bg-image");
    }
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

    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === current);
    });

    updateDesktopPageBlur(images[current]);
  }

  function finishTransition(nextIndex) {
    current = nextIndex;
    animating = false;
    renderStatic();
    restartAutoplay();
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
      finishTransition(nextIndex);
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
      window.clearInterval(intervalId);
      intervalId = null;
    }
  }

  function startAutoplay() {
    stopAutoplay();

    if (images.length <= 1) return;

    intervalId = window.setInterval(() => {
      if (!paused && !animating) {
        next();
      }
    }, CONFIG.autoplayMs);
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  function preloadImages(list) {
    list.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
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

  function bindEvents() {
    if (!slideshow) return;

    if (CONFIG.pauseOnHover) {
      slideshow.addEventListener("mouseenter", () => {
        paused = true;
      });

      slideshow.addEventListener("mouseleave", () => {
        paused = false;
      });
    }

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

    slideshow.tabIndex = 0;
    slideshow.addEventListener("keydown", (e) => {
      if (animating) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    });
  }

  function build() {
    mode = getMode();
    images = getImagesForMode(mode);
    current = normalizeIndex(current, images.length);
    paused = false;
    animating = false;

    preloadImages(images);

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
    window.clearTimeout(resizeTimer);

    resizeTimer = window.setTimeout(() => {
      const nextMode = getMode();
      if (nextMode !== mode) {
        stopAutoplay();
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