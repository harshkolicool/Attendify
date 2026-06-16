function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

window.PushManagerHelper = {
    init: async function(role) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push messaging is not supported');
            return { supported: false };
        }

        const baseUrl = role === 'teacher' ? '/teacher' : '/student';
        
        try {
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            
            if (subscription) {
                return { supported: true, subscribed: true, subscription };
            }
            return { supported: true, subscribed: false };
        } catch (err) {
            console.error('Error checking push subscription:', err);
            return { supported: true, subscribed: false, error: err };
        }
    },

    subscribe: async function(role) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            throw new Error('Push messaging is not supported');
        }

        const baseUrl = role === 'teacher' ? '/teacher' : '/student';
        
        try {
            // Get public key from server
            const keyResponse = await fetch(`${baseUrl}/push/public-key`);
            if (!keyResponse.ok) throw new Error('Failed to fetch VAPID public key');
            const { publicKey } = await keyResponse.json();

            const registration = await navigator.serviceWorker.ready;
            
            // Subscribe
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            // Send to backend
            const saveResponse = await fetch(`${baseUrl}/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ subscription })
            });

            if (!saveResponse.ok) {
                throw new Error('Failed to save subscription on server');
            }

            return subscription;
        } catch (err) {
            console.error('Failed to subscribe the user: ', err);
            throw err;
        }
    }
};
