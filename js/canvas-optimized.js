/**
 * Performance-Optimized Canvas with Layer Separation & OffscreenCanvas
 */

export class InkCanvasOptimized {
  constructor(canvasElement, width = 794, height = 1123) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', {
      alpha: true,
      desynchronized: true, // Optimize for canvas animations
      willReadFrequently: false
    });

    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for performance

    this.initResolution();
    this.initOffscreenCanvas();

    // Data Models
    this.strokes = [];
    this.selectedStrokeIds = new Set();
    this.activeStroke = null;
    this.undoStack = [];
    this.redoStack = [];

    // Current Tool Settings
    this.tool = 'pen';
    this.penType = 'ballpoint';
    this.color = '#007aff';
    this.widthScale = 2.5;
    this.eraseHighlighterOnly = false;

    // Viewport
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;

    // Lasso & Selection
    this.lassoPolygon = [];
    this.isLassoSelecting = false;
    this.isDraggingSelection = false;
    this.selectionDragStart = null;
    this.selectionBounds = null;

    // Performance optimizations
    this.rafId = null;
    this.needsRedraw = false;
    this.lastMoveTime = 0;
    this.moveThrottle = 4; // ms
    this.dirtyRegion = null; // Partial redraw support

    // Callbacks
    this.onChange = () => {};
    this.onSelectionChange = () => {};

    this.bindEvents();
    this.startRenderLoop();
  }

  initResolution() {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);

    // Optimization: Set canvas CSS properties
    this.canvas.style.willChange = 'contents';
    this.canvas.style.touchAction = 'none';
  }

  initOffscreenCanvas() {
    // Use OffscreenCanvas for background rendering when available
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreenCanvas = new OffscreenCanvas(
        this.width * this.dpr,
        this.height * this.dpr
      );
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
        alpha: true,
        willReadFrequently: false
      });
      this.offscreenCtx.scale(this.dpr, this.dpr);
      this.useOffscreen = true;
    } else {
      this.useOffscreen = false;
    }
  }

  // RAF-based render loop for smooth 60fps
  startRenderLoop() {
    const render = () => {
      if (this.needsRedraw) {
        this.performRedraw();
        this.needsRedraw = false;
      }
      this.rafId = requestAnimationFrame(render);
    };
    render();
  }

  scheduleRedraw(dirtyRegion = null) {
    this.needsRedraw = true;
    this.dirtyRegion = dirtyRegion;
  }

  performRedraw() {
    const ctx = this.useOffscreen ? this.offscreenCtx : this.ctx;

    // Clear canvas
    if (this.dirtyRegion) {
      const { x, y, w, h } = this.dirtyRegion;
      ctx.clearRect(x, y, w, h);
    } else {
      ctx.clearRect(0, 0, this.width, this.height);
    }

    // Apply transformations
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Render all strokes with viewport culling
    const viewportBounds = this.getViewportBounds();
    for (const stroke of this.strokes) {
      if (this.isStrokeInViewport(stroke, viewportBounds)) {
        this.renderStroke(ctx, stroke);
      }
    }

    // Render active stroke
    if (this.activeStroke) {
      this.renderStroke(ctx, this.activeStroke);
    }

    // Render lasso polygon
    if (this.isLassoSelecting && this.lassoPolygon.length > 1) {
      this.renderLassoPolygon(ctx);
    }

    // Render selection highlights
    if (this.selectedStrokeIds.size > 0) {
      this.renderSelectionHighlights(ctx);
    }

    ctx.restore();

    // Copy offscreen to main canvas if using OffscreenCanvas
    if (this.useOffscreen) {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(this.offscreenCanvas, 0, 0);
    }

    this.dirtyRegion = null;
  }

  getViewportBounds() {
    const padding = 100; // pixels
    return {
      minX: (-this.panX / this.zoom) - padding,
      minY: (-this.panY / this.zoom) - padding,
      maxX: (this.width - this.panX) / this.zoom + padding,
      maxY: (this.height - this.panY) / this.zoom + padding
    };
  }

  isStrokeInViewport(stroke, bounds) {
    // Quick AABB check
    if (!stroke.bounds) {
      stroke.bounds = this.calculateStrokeBounds(stroke);
    }
    return !(
      stroke.bounds.maxX < bounds.minX ||
      stroke.bounds.minX > bounds.maxX ||
      stroke.bounds.maxY < bounds.minY ||
      stroke.bounds.minY > bounds.maxY
    );
  }

  calculateStrokeBounds(stroke) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const pt of stroke.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }

    const padding = stroke.width * 2;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    };
  }

  renderStroke(ctx, stroke) {
    if (stroke.points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'multiply';
    }

    // Use simplified path for long strokes
    const points = stroke.simplified || stroke.points;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    // Quadratic curve smoothing
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    if (points.length > 1) {
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  renderLassoPolygon(ctx) {
    if (this.lassoPolygon.length < 2) return;

    ctx.save();
    ctx.strokeStyle = '#007aff';
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([8 / this.zoom, 4 / this.zoom]);

    ctx.beginPath();
    ctx.moveTo(this.lassoPolygon[0].x, this.lassoPolygon[0].y);
    for (let i = 1; i < this.lassoPolygon.length; i++) {
      ctx.lineTo(this.lassoPolygon[i].x, this.lassoPolygon[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  renderSelectionHighlights(ctx) {
    ctx.save();
    ctx.strokeStyle = '#007aff';
    ctx.lineWidth = 3 / this.zoom;
    ctx.setLineDash([6 / this.zoom, 3 / this.zoom]);

    for (const strokeId of this.selectedStrokeIds) {
      const stroke = this.strokes.find(s => s.id === strokeId);
      if (stroke && stroke.bounds) {
        const { minX, minY, maxX, maxY } = stroke.bounds;
        ctx.strokeRect(minX - 5, minY - 5, maxX - minX + 10, maxY - minY + 10);
      }
    }

    ctx.restore();
  }

  // Optimized path simplification (Douglas-Peucker)
  simplifyPath(points, tolerance = 0.5) {
    if (points.length <= 100) return points;

    const simplified = [];
    const douglasPeucker = (pts, start, end, tol, result) => {
      let maxDist = 0;
      let maxIndex = 0;

      for (let i = start + 1; i < end; i++) {
        const dist = this.perpendicularDistance(pts[i], pts[start], pts[end]);
        if (dist > maxDist) {
          maxDist = dist;
          maxIndex = i;
        }
      }

      if (maxDist > tol) {
        douglasPeucker(pts, start, maxIndex, tol, result);
        result.push(pts[maxIndex]);
        douglasPeucker(pts, maxIndex, end, tol, result);
      }
    };

    simplified.push(points[0]);
    douglasPeucker(points, 0, points.length - 1, tolerance, simplified);
    simplified.push(points[points.length - 1]);

    return simplified;
  }

  perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);

    const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
    const ix = lineStart.x + u * dx;
    const iy = lineStart.y + u * dy;

    return Math.hypot(point.x - ix, point.y - iy);
  }

  bindEvents() {
    // Pointer events with passive: false for preventDefault
    this.canvas.addEventListener('pointerdown', this.handlePointerDown.bind(this));
    window.addEventListener('pointermove', this.handlePointerMove.bind(this), { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp.bind(this));
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Touch optimization
    this.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  }

  handlePointerDown(e) {
    e.preventDefault();
    const pt = this.getCanvasPoint(e);

    // Tool-specific behavior...
    // (Rest of the implementation similar to original canvas.js)
  }

  handlePointerMove(e) {
    const now = performance.now();
    if (now - this.lastMoveTime < this.moveThrottle) return;
    this.lastMoveTime = now;

    if (this.activeStroke || this.isPanning || this.isLassoSelecting) {
      e.preventDefault();
    }

    // Tool-specific behavior...
  }

  handlePointerUp(e) {
    if (this.activeStroke) {
      // Simplify completed stroke
      if (this.activeStroke.points.length > 100) {
        this.activeStroke.simplified = this.simplifyPath(this.activeStroke.points);
      }
      this.activeStroke.bounds = this.calculateStrokeBounds(this.activeStroke);
      this.strokes.push(this.activeStroke);
      this.undoStack.push({ type: 'add', stroke: this.activeStroke });
      this.redoStack = [];
      this.activeStroke = null;
      this.onChange();
    }

    this.scheduleRedraw();
  }

  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.panX) / this.zoom,
      y: (e.clientY - rect.top - this.panY) / this.zoom
    };
  }

  setStrokes(strokes) {
    this.strokes = strokes || [];
    // Pre-calculate bounds for all strokes
    for (const stroke of this.strokes) {
      if (!stroke.bounds) {
        stroke.bounds = this.calculateStrokeBounds(stroke);
      }
    }
    this.selectedStrokeIds.clear();
    this.scheduleRedraw();
  }

  getStrokes() {
    return this.strokes;
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }
}
