import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDoXwHKUgWeBv7rmnLZACzlVoEcXKyZEnI",
  authDomain: "sign-up-e2a6c.firebaseapp.com",
  projectId: "sign-up-e2a6c",
  storageBucket: "sign-up-e2a6c.firebasestorage.app",
  messagingSenderId: "1014249305987",
  appId: "1:1014249305987:web:42bb551d2b879ed39ba8b6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const gate = document.getElementById("contactGate");
const form = document.getElementById("contactFormWrap");
const signinBtn = document.getElementById("contactSigninBtn");

onAuthStateChanged(auth, (user) => {

  if (user) {
      gate.style.display = "none";
      form.style.display = "block";
  } 
  else {
      gate.style.display = "block";
      form.style.display = "none";
  }

});

signinBtn?.addEventListener("click", () => {
  window.__authOpenSignin?.();
});
