// ==================== LUME - Firebase Configuration ====================
const firebaseConfig = {
    apiKey: "AIzaSyD436FkIwy_e9tK5aW1DVPfUpeGZHeedUk",
    authDomain: "zorak-e0a51.firebaseapp.com",
    databaseURL: "https://zorak-e0a51-default-rtdb.firebaseio.com/",
    projectId: "zorak-e0a51",
    storageBucket: "zorak-e0a51.firebasestorage.app",
    appId: "1:34407692791:web:bdd5d72c9c840afb6416f2",
    measurementId: "G-NQVTB8RBKW"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

const CLOUD_NAME = 'dnmpmysk6';
const UPLOAD_PRESET = 'do_2gg';
const AGORA_APP_ID = '4017f66ea15f4ce088e8d8993a072a5b';
const ADMIN_EMAIL = 'jasim11v@gmail.com';
const SITE_NAME = 'LUME';

console.log('✅ LUME Ready');
