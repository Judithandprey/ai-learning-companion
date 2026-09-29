// Called by ViewController with one of: on, off, unknown, missing, settings-error.
function show(state) {
    document.body.dataset.state = state;
}

document.getElementById("open-settings").addEventListener("click", () => {
    webkit.messageHandlers.controller.postMessage("open-settings");
});
