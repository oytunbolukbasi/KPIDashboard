import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBnbXgG9QvmIa0qTyxOawvTVC3kWdvk-Q0',
  authDomain: 'kpidashboard-app.firebaseapp.com',
  projectId: 'kpidashboard-app',
  storageBucket: 'kpidashboard-app.firebasestorage.app',
  messagingSenderId: '376680322914',
  appId: '1:376680322914:web:73e3dd64f22324b2533e3b',
};

// Avoid re-initializing on hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Named database 'kpidashboard' (Enterprise edition requires a named DB)
export const db = getFirestore(app, 'kpidashboard');
export default app;
