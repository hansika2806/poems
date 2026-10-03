if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    window.dispatchEvent(new CustomEvent("roshni:pwa-unavailable"));
  });
}
