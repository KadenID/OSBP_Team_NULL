// 서비스 워커: 푸시 알림 수신 및 표시
self.addEventListener('push', function (event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/icon.png', // 아이콘 경로 (필요시 추가)
            badge: '/badge.png', // 상태표시줄 아이콘
            data: {
                url: data.url || '/'
            },
            vibrate: [100, 50, 100],
            actions: [
                { action: 'open', title: '확인하기' },
                { action: 'close', title: '닫기' }
            ]
        };

        event.waitUntil(
            self.registration.showNotification(data.title || '과제 알림', options)
        );
    }
});

// 알림 클릭 이벤트 처리
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    if (event.action === 'close') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            if (clientList.length > 0) {
                let client = clientList[0];
                for (let i = 0; i < clientList.length; i++) {
                    if (clientList[i].focused) {
                        client = clientList[i];
                    }
                }
                if (client.url === event.notification.data.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url);
            }
        })
    );
});
