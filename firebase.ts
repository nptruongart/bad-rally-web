import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBm1sKpmekK-5f4FLefwugE7soSIMkVDOI",
  authDomain: "bad-rally.firebaseapp.com",
  projectId: "bad-rally",
  storageBucket: "bad-rally.firebasestorage.app",
  messagingSenderId: "546256421950",
  appId: "1:546256421950:web:0a40414d3e74196c86bd6f"
};

// Khởi tạo Firebase (tránh bị lỗi khởi tạo nhiều lần trên Next.js)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };