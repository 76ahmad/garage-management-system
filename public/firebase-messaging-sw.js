// Firebase Cloud Messaging Service Worker
// هذا الملف يعمل في الخلفية لاستقبال الإشعارات حتى عند إغلاق التطبيق

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Firebase Configuration
const firebaseConfig = {
            apiKey: "AIzaSyCdSRfJCoU6xwDych3l_3K_hBZBHOi9jVg",
            authDomain: "garage-17263.firebaseapp.com",
            projectId: "garage-17263",
            storageBucket: "garage-17263.firebasestorage.app",
            messagingSenderId: "332265903935",
            appId: "1:332265903935:web:237c0787a161fd36a7a58a",
            measurementId: "G-KLLCPECCDQ"
        };



// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages (عندما يكون التطبيق مغلق أو في الخلفية)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Customize notification here
    const notificationTitle = payload.notification.title || 'DRVN - إشعار جديد';
    const notificationOptions = {
        body: payload.notification.body || 'لديك تحديث جديد',
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        tag: payload.data?.tag || 'default-notification',
        vibrate: [200, 100, 200],
        dir: 'rtl',
        lang: 'he',
        data: {
            url: payload.data?.url || '/',
            ...payload.data
        }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click received.');
    
    event.notification.close();
    
    // Open the app
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Check if app is already open
                for (const client of clientList) {
                    if (client.url.includes(urlToOpen) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If app is not open, open it
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});