/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker for background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyMockKeyForDevPrerender1234567890",
  authDomain: "excerpt-d0ab8.firebaseapp.com",
  projectId: "excerpt-d0ab8",
  storageBucket: "excerpt-d0ab8.appspot.com",
  messagingSenderId: "114171383658",
  appId: "1:114171383658:web:abcdef123456"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'Excerpt Clips Ready!';
  const notificationOptions = {
    body: payload.notification?.body || 'Your video clips have finished rendering.',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: {
      url: payload.data?.url || '/dashboard'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
