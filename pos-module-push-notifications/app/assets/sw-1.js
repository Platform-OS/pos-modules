self.addEventListener('push', function(event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: event.data.text() };
    }
  }

  var title = data.title || 'Notification';
  var options = {
    body: data.body || '',
    icon: data.icon,
    badge: data.badge,
    data: { url: data.url || '/' },
    tag: data.tag || 'push-notification'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

function pushswParam(name) {
  return new URLSearchParams(self.location.search).get(name);
}

function pushswUrlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = atob(base64);
  var output = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

self.addEventListener('pushsubscriptionchange', function(event) {
  var oldSub = event.oldSubscription || null;
  var oldKeys = oldSub ? oldSub.toJSON().keys || {} : {};
  var rotateUrl = pushswParam('rotate_url') || '/push_notifications/subscriptions/rotate';
  var vapidPublicKey = pushswParam('vapid');

  var resubscribed = event.newSubscription
    ? Promise.resolve(event.newSubscription)
    : self.registration.pushManager.subscribe(
        (oldSub && oldSub.options && oldSub.options.applicationServerKey)
          ? oldSub.options
          : { userVisibleOnly: true, applicationServerKey: pushswUrlBase64ToUint8Array(vapidPublicKey) }
      );

  event.waitUntil(
    resubscribed.then(function(newSub) {
      var newKeys = newSub.toJSON().keys;
      var body = new URLSearchParams({
        old_endpoint: oldSub ? oldSub.endpoint : '',
        old_p256dh: oldKeys.p256dh || '',
        old_auth: oldKeys.auth || '',
        endpoint: newSub.endpoint,
        p256dh: newKeys.p256dh,
        auth: newKeys.auth
      });
      return fetch(rotateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });
    })
  );
});
