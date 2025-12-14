import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4TXORcOqylbMKnn0ZF1nF6rjw6uo8dX4",
  authDomain: "trivium-26048.firebaseapp.com",
  databaseURL: "https://trivium-26048-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "trivium-26048",
  storageBucket: "trivium-26048.firebasestorage.app",
  messagingSenderId: "882582165118",
  appId: "1:882582165118:web:1dba969eda431772feea2f",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
