import { initializeApp } from 'firebase/app';
import { getAuth, FacebookAuthProvider, GoogleAuthProvider } from 'firebase/auth';

const hasFirebaseConfig = 
  !!import.meta.env.VITE_FIREBASE_API_KEY && 
  import.meta.env.VITE_FIREBASE_API_KEY !== 'your-api-key' &&
  import.meta.env.VITE_FIREBASE_API_KEY.trim() !== '';

let auth = null;
let facebookProvider = null;
let googleProvider = null;

if (hasFirebaseConfig) {
  try {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);

    facebookProvider = new FacebookAuthProvider();
    facebookProvider.addScope('pages_manage_posts');
    facebookProvider.addScope('pages_read_engagement');
    facebookProvider.addScope('instagram_basic');
    facebookProvider.addScope('instagram_content_publish');
    facebookProvider.addScope('pages_show_list');

    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.error('[Firebase Client] Initialization error:', error.message);
  }
} else {
  console.warn('[Firebase Client] Configuration keys are missing in client/.env. Falling back to local auth.');
}

export { auth, facebookProvider, googleProvider, hasFirebaseConfig };
