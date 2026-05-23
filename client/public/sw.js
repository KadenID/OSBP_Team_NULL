// 서비스 워커: 푸시 알림 수신 및 표시
self.addEventListener('push', function (event) {
    console.log('[Service Worker] Push Received.');
    
    if (event.data) {
        try {
            const data = event.data.json();
            console.log('[Service Worker] Push Data:', data);

            const title = data.title || '과제 알림';
            const options = {
                body: data.body || '과제 마감 기한을 확인하세요!',
                icon: '/icon.png',
                badge: '/badge.png',
                data: {
                    url: data.url || '/'
                },
                vibrate: [100, 50, 100],
            };

            event.waitUntil(
                self.registration.showNotification(title, options)
            );
        } catch (e) {
            console.error('[Service Worker] Push data parse error:', e);
        }
    } else {
        console.warn('[Service Worker] Push event but no data.');
    }
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
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
