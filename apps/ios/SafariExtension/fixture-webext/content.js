// Packaging fixture only: on example.com, shows a small label so a Simulator run can see
// that Safari loaded the packaged content script. The product extension is Web's
// apps/safari-extension/webextension.
const label = document.createElement("div");
label.textContent = "Packaging fixture content script loaded (not the product)";
label.style.cssText = "position:fixed;top:0;left:0;right:0;padding:8px;background:#ffd;color:#000;font:14px -apple-system;z-index:2147483647";
document.documentElement.append(label);
document.documentElement.dataset.learningCompanionPackagingFixture = "loaded";
