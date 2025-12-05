// Firebase Messaging Service Worker
// هذا الملف يعمل في الخلفية لاستقبال الإشعارات

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Firebase Configuration
firebase.initializeApp({
    apiKey: "AIzaSyCdSRfJCoU6xwDych3l_3K_hBZBHOi9jVg",
            authDomain: "garage-17263.firebaseapp.com",
            projectId: "garage-17263",
            storageBucket: "garage-17263.firebasestorage.app",
            messagingSenderId: "332265903935",
            appId: "1:332265903935:web:237c0787a161fd36a7a58a",
            measurementId: "G-KLLCPECCDQ"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('📩 Received background message:', payload);
    
    const notificationTitle = payload.notification?.title || 'DRVN - מערכת ניהול מוסך';
    const notificationOptions = {
        body: payload.notification?.body || 'יש לך הודעה חדשה',
        icon: payload.notification?.icon || '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [100, 50, 100],
        tag: payload.data?.tag || 'drvn-notification',
        requireInteraction: true,
        actions: [
            {
                action: 'open',
                title: 'פתח'
            },
            {
                action: 'close',
                title: 'סגור'
            }
        ],
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('🖱️ Notification clicked:', event);
    
    event.notification.close();
    
    if (event.action === 'close') {
        return;
    }
    
    // Open the app or focus if already open
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If app is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes('garageapp-test') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open new window
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// Handle push event directly
self.addEventListener('push', (event) => {
    console.log('📬 Push event received:', event);
    
    if (event.data) {
        try {
            const data = event.data.json();
            console.log('Push data:', data);
        } catch (e) {
            console.log('Push data (text):', event.data.text());
        }
    }
});

console.log('🔔 Firebase Messaging Service Worker loaded successfully!');