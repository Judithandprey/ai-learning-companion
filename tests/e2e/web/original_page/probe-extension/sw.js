// Test-only capability probe. On an action invocation, capture the visible tab and record what
// was received (size, PNG signature, dimensions, SHA-256, tab URL, time). Nothing is sent anywhere.
chrome.action.onClicked.addListener(async (tab) => {
  const record = { invokedAt: new Date().toISOString(), tabUrl: tab.url ?? null, tabTitle: tab.title ?? null };
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const view = new DataView(bytes.buffer);
    record.capture = {
      byteLength: bytes.length,
      pngSignature: Array.from(bytes.slice(0, 8)).join(','),
      width: view.getUint32(16), height: view.getUint32(20),
      sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
    };
  } catch (error) {
    record.error = String(error?.message ?? error);
  }
  await chrome.storage.session.set({ probe: record });
});
