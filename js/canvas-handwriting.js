export function createHandwritingCanvas(canvasEl, wrapEl) {
  const ctx = canvasEl.getContext("2d");
  let drawing = false;
  let last = null;

  function resize() {
    const rect = wrapEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.floor(rect.width * dpr);
    canvasEl.height = Math.floor(rect.height * dpr);
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a1a1a";
  }

  function pointFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    const t = e.touches?.[0] ?? e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    last = pointFromEvent(e);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }

  function end(e) {
    if (!drawing) return;
    e.preventDefault();
    drawing = false;
    last = null;
  }

  function clear() {
    const rect = wrapEl.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  function isBlank() {
    const w = canvasEl.width;
    const h = canvasEl.height;
    if (!w || !h) return true;
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false;
    }
    return true;
  }

  function toDataURL() {
    return canvasEl.toDataURL("image/png");
  }

  canvasEl.addEventListener("mousedown", start);
  canvasEl.addEventListener("mousemove", move);
  canvasEl.addEventListener("mouseup", end);
  canvasEl.addEventListener("mouseleave", end);
  canvasEl.addEventListener("touchstart", start, { passive: false });
  canvasEl.addEventListener("touchmove", move, { passive: false });
  canvasEl.addEventListener("touchend", end, { passive: false });

  window.addEventListener("resize", resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
  }
  resize();

  return { resize, clear, isBlank, toDataURL };
}
