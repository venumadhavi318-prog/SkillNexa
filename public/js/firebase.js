const firebaseConfig = {
  apiKey: "AIzaSyAiKTPs5eS8_kbsOZsAMOokrcWT80Jugg4",
  authDomain: "skill-nexa-25a33.firebaseapp.com",
  projectId: "skill-nexa-25a33",
  storageBucket: "skill-nexa-25a33.firebasestorage.app",
  messagingSenderId: "725930827337",
  appId: "1:725930827337:web:162ae9c4c7971621cde998",
  measurementId: "G-B5QQ9Q224P"
};
(function setupFirebase() {
  if (!window.firebase || !firebase.apps || typeof firebase.initializeApp !== "function") {
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  if (typeof firebase.analytics === "function") {
    try {
      firebase.analytics();
    } catch (e) {
      console.warn("Firebase analytics could not be initialized:", e);
    }
  }
})();