(() => {
  if (window.__pixelfoxSelectionOverlayLoaded) {
    return;
  }

  window.__pixelfoxSelectionOverlayLoaded = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "PIXELFOX_SELECT_AREA") {
      return false;
    }

    startSelection().then(sendResponse);
    return true;
  });

  function startSelection() {
    return new Promise((resolve) => {
      const existing = document.getElementById("pixelfox-selection-root");
      if (existing) {
        existing.remove();
      }

      const root = document.createElement("div");
      root.id = "pixelfox-selection-root";

      const hint = document.createElement("div");
      hint.className = "pixelfox-selection-hint";
      hint.textContent = "Drag to select an area. Press Esc to cancel.";

      const box = document.createElement("div");
      box.className = "pixelfox-selection-box";

      root.append(hint, box);
      document.documentElement.append(root);

      let startX = 0;
      let startY = 0;
      let active = false;

      const cleanup = () => {
        root.remove();
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("blur", onBlur, true);
      };

      const cancel = () => {
        cleanup();
        resolve({ cancelled: true });
      };

      const updateBox = (event) => {
        const currentX = clamp(event.clientX, 0, window.innerWidth);
        const currentY = clamp(event.clientY, 0, window.innerHeight);
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);

        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        box.classList.toggle("is-visible", width > 0 && height > 0);
      };

      const onPointerDown = (event) => {
        if (event.button !== 0) {
          return;
        }

        event.preventDefault();
        active = true;
        startX = clamp(event.clientX, 0, window.innerWidth);
        startY = clamp(event.clientY, 0, window.innerHeight);
        root.setPointerCapture(event.pointerId);
        updateBox(event);
      };

      const onPointerMove = (event) => {
        if (!active) {
          return;
        }

        event.preventDefault();
        updateBox(event);
      };

      const onPointerUp = (event) => {
        if (!active) {
          return;
        }

        event.preventDefault();
        active = false;
        root.releasePointerCapture(event.pointerId);

        const currentX = clamp(event.clientX, 0, window.innerWidth);
        const currentY = clamp(event.clientY, 0, window.innerHeight);
        const rect = {
          x: Math.min(startX, currentX),
          y: Math.min(startY, currentY),
          width: Math.abs(currentX - startX),
          height: Math.abs(currentY - startY)
        };

        if (rect.width < 4 || rect.height < 4) {
          box.classList.remove("is-visible");
          return;
        }

        cleanup();
        resolve({
          cancelled: false,
          rect,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        });
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      };

      const onBlur = () => {
        cancel();
      };

      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("pointermove", onPointerMove);
      root.addEventListener("pointerup", onPointerUp);
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("blur", onBlur, true);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
