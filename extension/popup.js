// VeriNote Popup Logic
// Saves and loads extension settings using chrome.storage.

document.addEventListener('DOMContentLoaded', () => {
  const scannerToggle = document.getElementById('scanner-toggle');

  // Load the current toggle state (defaults to true if unset)
  chrome.storage.local.get({ scannerEnabled: true }, (result) => {
    scannerToggle.checked = result.scannerEnabled;
  });

  // Save changes when user toggles the switch
  scannerToggle.addEventListener('change', () => {
    const isEnabled = scannerToggle.checked;
    chrome.storage.local.set({ scannerEnabled: isEnabled }, () => {
      console.log('[VeriNote] Scanner toggle saved state:', isEnabled);
      
      // Optionally notify active tab to disable highlights instantly
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'toggle_scanner', enabled: isEnabled });
        }
      });
    });
  });
});
