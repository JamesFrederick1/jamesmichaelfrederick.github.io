// /contact/contact.js

const gate = document.getElementById("contactGate");
const form = document.getElementById("contactFormWrap");
const signinBtn = document.getElementById("contactSigninBtn");

function applyGate(user) {
  if (!gate || !form) return;

  if (user) {
    gate.style.display = "none";
    form.style.display = "block";
  } else {
    gate.style.display = "block";
    form.style.display = "none";
  }
}

// Default (avoid flash)
applyGate(null);

// 1) Apply current state if auth.js already ran
if (typeof window.__authGetUser === "function") {
  applyGate(window.__authGetUser());
}

// 2) Listen for changes (auth.js will emit this)
window.addEventListener("auth:state", (e) => {
  applyGate(e.detail?.user || null);
});

// 3) Open signin modal
signinBtn?.addEventListener("click", () => {
  if (typeof window.__authOpenSignin === "function") {
    window.__authOpenSignin();
  }
});