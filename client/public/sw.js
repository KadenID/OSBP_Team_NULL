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
    
    if (event.data) {
        try {
            const data = event.data.json();
            console.log('[Service Worker] Push Data:', data);

            const title = data.title || '과제 알림';
            const options = {
                body: data.body || '과제 마감 기한을 확인하세요!',
                // 아이콘 파일이 없을 경우를 대비하여 기본값 설정 유지
                icon: data.icon || '/vite.svg', 
                badge: data.badge || '/vite.svg',
                data: {
                    url: data.url || '/'
                },
                vibrate: [100, 50, 100],
                // 알림이 왔을 때 화면을 깨우거나 알림 소리를 내도록 설정
                renotify: true,
                tag: 'assignment-alert' // 동일 태그는 최신 알림으로 교체
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
