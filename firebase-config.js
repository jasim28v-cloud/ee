// ==================== LUME 2.0 - Firebase Configuration ====================
const firebaseConfig = {
    apiKey: "AIzaSyD436FkIwy_e9tK5aW1DVPfUpeGZHeedUk",
    authDomain: "zorak-e0a51.firebaseapp.com",
    databaseURL: "https://zorak-e0a51-default-rtdb.firebaseio.com/",
    projectId: "zorak-e0a51",
    storageBucket: "zorak-e0a51.firebasestorage.app",
    appId: "1:34407692791:web:bdd5d72c9c840afb6416f2",
    measurementId: "G-NQVTB8RBKW"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Services
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// Cloudinary
const CLOUD_NAME = 'dnmpmysk6';
const UPLOAD_PRESET = 'do_2gg';

// Agora
const AGORA_APP_ID = '4017f66ea15f4ce088e8d8993a072a5b';

// Admin Account
const ADMIN_EMAIL = 'jasim11v@gmail.com';
const ADMIN_PASSWORD = 'nn2314nn';

// Site Name
const SITE_NAME = 'LUME';

console.log('✅ LUME 2.0 - Firebase, Cloudinary & Agora Ready');
