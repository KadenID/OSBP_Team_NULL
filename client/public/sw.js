// 서비스 워커: 푸시 알림 수신 및 표시

self.addEventListener('install', function (event) {
    // 새로운 서비스 워커가 설치되면 즉시 활성화 단계로 넘어가도록 함
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    // 활성화 즉시 현재 페이지들을 제어하도록 함
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
    console.log('[Service Worker] Push Received.');
    
    let title = '과제 알림';
    let options = {
        body: '과제 마감 기한을 확인하세요!',
        icon: '/vite.svg',
        badge: '/vite.svg',
        vibrate: [100, 50, 100],
        renotify: true,
        tag: 'assignment-alert',
        data: { url: '/' }
    };

    if (event.data) {
        try {
            const data = event.data.json();
            console.log('[Service Worker] Push Data:', data);

            title = data.title || title;
            options.body = data.body || options.body;
            if (data.icon) options.icon = data.icon;
            if (data.badge) options.badge = data.badge;
            if (data.url) options.data.url = data.url;
        } catch (e) {
            console.error('[Service Worker] Push data parse error (falling back to text):', e);
            // JSON 파싱 실패 시 텍스트로 시도
            try {
                options.body = event.data.text();
            } catch (textErr) {
                console.error('[Service Worker] Push text read error:', textErr);
            }
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
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
