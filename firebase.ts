// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-e6u_0BvnIiIm_CNrCC_ElApc9DuSxIA",
  authDomain: "mistryfinder-a4360.firebaseapp.com",
  projectId: "mistryfinder-a4360",
  storageBucket: "mistryfinder-a4360.appspot.com",
  messagingSenderId: "167442453227",
  appId: "1:167442453227:web:a6c6f99aeb8c7545d3a4ae",
  measurementId: "G-8YZSYL4CPV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);