// CheckAM Background Service Worker
// Handles communications with the live Node.js backend to bypass potential CSP (Content Security Policy) restrictions on host pages.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'verify_text') {
    console.log('[CheckAM Background] Received verification request for:', message.text);
    
    fetch('https://verinote-production.up.railway.app/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: message.text })
    })
      .then(response => response.json())
      .then(data => {
        console.log('[CheckAM Background] Verification response:', data);
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error('[CheckAM Background] Verification error:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep the message channel open for async response
  }
});
