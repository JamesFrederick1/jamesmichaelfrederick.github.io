function setRippleOrigin(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--ios-ripple-x", `${clientX - rect.left}px`);
  el.style.setProperty("--ios-ripple-y", `${clientY - rect.top}px`);
}

function mountIOSBubble(el) {
  if (!el || el.__iosBubbleMounted) return;

  let pressed = false;
  let popTimer = null;

  function pop() {
    el.classList.remove("is-pressed");
    el.classList.remove("is-pop");
    void el.offsetWidth;
    el.classList.add("is-pop");

    if (popTimer) clearTimeout(popTimer);
    popTimer = setTimeout(() => {
      el.classList.remove("is-pop");
    }, 320);
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    pressed = true;
    setRippleOrigin(el, e.clientX, e.clientY);
    el.classList.add("is-pressed");
  });

  el.addEventListener("pointerup", () => {
    if (!pressed) return;
    pressed = false;
    pop();
  });

  el.addEventListener("pointercancel", () => {
    pressed = false;
    el.classList.remove("is-pressed");
  });

  el.__iosBubbleMounted = true;
}

function mountIOSBubbles(root = document) {
  root.querySelectorAll(".ios-bubble").forEach(mountIOSBubble);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountIOSBubbles(), { once: true });
} else {
  mountIOSBubbles();
}