/**
 * High-Performance Vector Ink Canvas - Optimized Edition
 * Performance enhancements while maintaining full functionality
 */

export class InkCanvas {
  constructor(canvasElement, width = 794, height = 1123) {
    this.canvas = canvasElement;

    // OPTIMIZATION: Better context configuration
    this.ctx = canvasElement.getContext('2d', {
      alpha: false,  // Opaque canvas is faster
      desynchronized: true,  // Allow async rendering
      willReadFrequently: false  // We write more than read
    });

    this.width = width;
    this.height = height;

    // OPTIMIZATION: Cap DPR at 2x to save memory
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.initResolution();

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

    // Viewport Navigation
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPoint = null;

    // Lasso & Interaction
    this.lassoPolygon = [];
    this.isLassoSelecting = false;
    this.isDraggingSelection = false;
    this.selectionDragStart = null;
    this.selectionBounds = null;

    // OPTIMIZATION: Pre-calculated stroke bounds cache
    this.strokeBoundsCache = new Map();

    // Callbacks
    this.onChange = () => {};
    this.onSelectionChange = () => {};

    this.bindEvents();
  }

  initResolution() {
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.scale(this.dpr, this.dpr);

    // OPTIMIZATION: Hint browser about canvas usage
    this.canvas.style.willChange = 'contents';
    this.canvas.style.touchAction = 'none';
  }

  setStrokes(strokes) {
    this.strokes = strokes || [];
    this.selectedStrokeIds.clear();
    this.selectionBounds = null;
    // OPTIMIZATION: Clear bounds cache when loading new strokes
    this.strokeBoundsCache.clear();
    this.redraw();
  }

  getStrokes() {
    return this.strokes;
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    window.addEventListener('pointermove', (e) => this.handlePointerMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // OPTIMIZATION: RAF-based redraw throttling
    this.pendingRedraw = false;
    this.rafId = null;
  }

  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.zoom;
    const y = (e.clientY - rect.top) / this.zoom;
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    return { x, y, pressure, time: Date.now() };
  }

  handlePointerDown(e) {
    e.preventDefault();

    // Apple Pencil Palm Rejection
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
      if (e.pointerType === 'touch') return;
    }
    this.activePointerId = e.pointerId;

    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const pt = this.getCanvasPoint(e);

    if (this.tool === 'hand' || (e.buttons === 4 || e.altKey)) {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.tool === 'lasso') {
      if (this.selectionBounds && this.isPointInBounds(pt, this.selectionBounds)) {
        this.isDraggingSelection = true;
        this.selectionDragStart = pt;
        return;
      }
      this.isLassoSelecting = true;
      this.lassoPolygon = [pt];
      this.selectedStrokeIds.clear();
      this.selectionBounds = null;
      this.onSelectionChange(null);
      this.redraw();
      return;
    }

    if (this.tool === 'eraser') {
      this.recordStateForUndo();
      this.eraseAtPoint(pt);
      return;
    }

    // Pen, Highlighter, or Shape
    this.recordStateForUndo();
    this.activeStroke = {
      id: 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      tool: this.tool,
      penType: this.penType,
      color: this.color,
      width: this.tool === 'highlighter' ? this.widthScale * 5.5 : this.widthScale,
      opacity: this.tool === 'highlighter' ? 0.38 : 1.0,
      points: [pt]
    };

    this.drawStrokeSegment(this.activeStroke, pt, pt);
  }

  handlePointerMove(e) {
    // OPTIMIZATION: Throttle to ~240fps (4ms) for smooth drawing
    if (!this.lastMoveTime) this.lastMoveTime = 0;
    const now = performance.now();
    if (now - this.lastMoveTime < 4) return;
    this.lastMoveTime = now;

    // Prevent default to stop scrolling/selecting
    if (this.isPanning || this.activeStroke || this.isLassoSelecting || this.isDraggingSelection) {
      e.preventDefault();
    }

    if (this.isPanning && this.lastPanPoint) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.panX += dx;
      this.panY += dy;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.updateViewportTransform();
      return;
    }

    const pt = this.getCanvasPoint(e);

    if (this.isDraggingSelection && this.selectionDragStart) {
      const dx = pt.x - this.selectionDragStart.x;
      const dy = pt.y - this.selectionDragStart.y;
      this.selectionDragStart = pt;

      // OPTIMIZATION: Invalidate bounds cache for moved strokes
      this.strokes.forEach(s => {
        if (this.selectedStrokeIds.has(s.id)) {
          s.points.forEach(p => { p.x += dx; p.y += dy; });
          if (s.shapeData) {
            s.shapeData.x1 += dx; s.shapeData.y1 += dy;
            s.shapeData.x2 += dx; s.shapeData.y2 += dy;
          }
          this.strokeBoundsCache.delete(s.id);
        }
      });
      this.recalculateSelectionBounds();
      this.redraw();
      return;
    }

    if (this.isLassoSelecting) {
      this.lassoPolygon.push(pt);
      this.redraw();
      this.drawLassoOverlay();
      return;
    }

    if (this.tool === 'eraser' && (e.buttons === 1 || e.pressure > 0)) {
      this.eraseAtPoint(pt);
      return;
    }

    if (this.activeStroke) {
      const pts = this.activeStroke.points;
      const prevPt = pts[pts.length - 1];
      const dist = Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);

      // OPTIMIZATION: Smoother threshold for better curves
      if (dist >= 0.8) {
        pts.push(pt);
        this.redraw();
      }
    }
  }

  handlePointerUp(e) {
    if (e.pointerId === this.activePointerId) {
      this.activePointerId = null;
    }

    if (this.isPanning) {
      this.isPanning = false;
      this.lastPanPoint = null;
      return;
    }

    if (this.isDraggingSelection) {
      this.isDraggingSelection = false;
      this.selectionDragStart = null;
      this.onChange();
      return;
    }

    if (this.isLassoSelecting) {
      this.isLassoSelecting = false;
      this.finalizeLassoSelection();
      this.redraw();
      return;
    }

    if (this.activeStroke) {
      const pts = this.activeStroke.points;
      if (pts.length > 2) {
        // Auto shape detection if Shape tool
        if (this.tool === 'shape') {
          const detectedShape = this.detectGeometricShape(pts);
          if (detectedShape) {
            this.activeStroke.shape = detectedShape.type;
            this.activeStroke.shapeData = detectedShape;
          }
        }

        // OPTIMIZATION: Pre-simplify long paths
        if (pts.length > 100) {
          this.activeStroke.simplified = this.simplifyPath(pts, 0.5);
        }

        this.strokes.push(this.activeStroke);
        this.onChange();
      }
      this.activeStroke = null;
      this.redraw();
    }
  }

  handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      this.setZoom(this.zoom * zoomFactor);
    }
  }

  setZoom(newZoom) {
    this.zoom = Math.min(Math.max(newZoom, 0.4), 3.0);
    this.updateViewportTransform();
  }

  updateViewportTransform() {
    const container = this.canvas.parentElement;
    if (container) {
      container.style.transform = `scale(${this.zoom})`;
    }
  }

  /* ----------------- STROKE ERASER ----------------- */
  eraseAtPoint(pt) {
    const eraserRadius = 14;
    let erasedAny = false;

    // OPTIMIZATION: Use for-loop instead of filter for better performance
    const remainingStrokes = [];
    for (let i = 0; i < this.strokes.length; i++) {
      const stroke = this.strokes[i];

      if (this.eraseHighlighterOnly && stroke.tool !== 'highlighter') {
        remainingStrokes.push(stroke);
        continue;
      }

      let shouldErase = false;
      const pts = stroke.points;
      for (let j = 0; j < pts.length - 1; j++) {
        const d = this.distToSegment(pt, pts[j], pts[j + 1]);
        if (d <= eraserRadius) {
          shouldErase = true;
          erasedAny = true;
          break;
        }
      }

      if (!shouldErase) {
        remainingStrokes.push(stroke);
      } else {
        // OPTIMIZATION: Remove from cache
        this.strokeBoundsCache.delete(stroke.id);
      }
    }

    if (erasedAny) {
      this.strokes = remainingStrokes;
      this.redraw();
      this.onChange();
    }
  }

  distToSegment(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  /* ----------------- LASSO SELECTION ----------------- */
  finalizeLassoSelection() {
    if (this.lassoPolygon.length < 3) return;

    this.selectedStrokeIds.clear();
    this.strokes.forEach(s => {
      let insideCount = 0;
      for (let i = 0; i < s.points.length; i += Math.max(1, Math.floor(s.points.length / 8))) {
        if (this.pointInPolygon(s.points[i], this.lassoPolygon)) {
          insideCount++;
        }
      }
      if (insideCount > 0) {
        this.selectedStrokeIds.add(s.id);
      }
    });

    this.lassoPolygon = [];
    this.recalculateSelectionBounds();
    this.onSelectionChange(this.selectionBounds);
  }

  pointInPolygon(point, vs) {
    const x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x, yi = vs[i].y;
      const xj = vs[j].x, yj = vs[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  recalculateSelectionBounds() {
    if (this.selectedStrokeIds.size === 0) {
      this.selectionBounds = null;
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.strokes.forEach(s => {
      if (this.selectedStrokeIds.has(s.id)) {
        s.points.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        });
      }
    });

    this.selectionBounds = {
      x: minX - 10,
      y: minY - 10,
      width: (maxX - minX) + 20,
      height: (maxY - minY) + 20
    };
  }

  isPointInBounds(pt, b) {
    return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
  }

  deleteSelectedStrokes() {
    if (this.selectedStrokeIds.size === 0) return;
    this.recordStateForUndo();

    // OPTIMIZATION: Clear cache for deleted strokes
    this.selectedStrokeIds.forEach(id => this.strokeBoundsCache.delete(id));

    this.strokes = this.strokes.filter(s => !this.selectedStrokeIds.has(s.id));
    this.selectedStrokeIds.clear();
    this.selectionBounds = null;
    this.redraw();
    this.onSelectionChange(null);
    this.onChange();
  }

  duplicateSelectedStrokes() {
    if (this.selectedStrokeIds.size === 0) return;
    this.recordStateForUndo();
    const newStrokes = [];
    const newSelectedIds = new Set();

    this.strokes.forEach(s => {
      if (this.selectedStrokeIds.has(s.id)) {
        const cloned = JSON.parse(JSON.stringify(s));
        cloned.id = 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        cloned.points.forEach(p => { p.x += 25; p.y += 25; });
        if (cloned.shapeData) {
          cloned.shapeData.x1 += 25; cloned.shapeData.y1 += 25;
          cloned.shapeData.x2 += 25; cloned.shapeData.y2 += 25;
        }
        newStrokes.push(cloned);
        newSelectedIds.add(cloned.id);
      }
    });

    this.strokes.push(...newStrokes);
    this.selectedStrokeIds = newSelectedIds;
    this.recalculateSelectionBounds();
    this.redraw();
    this.onSelectionChange(this.selectionBounds);
    this.onChange();
  }

  isValidColor(color) {
    if (typeof color !== 'string') return false;
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color) ||
           /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/i.test(color);
  }

  setSelectedStrokesColor(newColor) {
    if (this.selectedStrokeIds.size === 0 || !this.isValidColor(newColor)) return;
    this.recordStateForUndo();
    this.strokes.forEach(s => {
      if (this.selectedStrokeIds.has(s.id)) {
        s.color = newColor;
      }
    });
    this.redraw();
    this.onChange();
  }

  /* ----------------- GEOMETRIC SHAPE DETECTION ----------------- */
  detectGeometricShape(pts) {
    if (pts.length < 5) return null;
    const start = pts[0];
    const end = pts[pts.length - 1];
    const directDist = Math.hypot(end.x - start.x, end.y - start.y);

    let pathLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      pathLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }

    // Straight Line detection
    if (directDist > 30 && pathLen / directDist < 1.15) {
      return { type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }

    // Closed loops (Circle / Rectangle)
    const isClosed = directDist < 45 || directDist / pathLen < 0.2;
    if (isClosed) {
      let cx = 0, cy = 0;
      pts.forEach(p => { cx += p.x; cy += p.y; });
      cx /= pts.length;
      cy /= pts.length;

      const radii = pts.map(p => Math.hypot(p.x - cx, p.y - cy));
      const avgR = radii.reduce((a, b) => a + b, 0) / radii.length;
      const variance = radii.reduce((sum, r) => sum + (r - avgR) ** 2, 0) / radii.length;
      const stdDev = Math.sqrt(variance);

      // Circle detection
      if (stdDev / avgR < 0.22) {
        return { type: 'circle', cx, cy, r: avgR };
      }

      // Rectangle detection
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });

      return { type: 'rectangle', x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    return null;
  }

  /* ----------------- SMOOTH VECTOR INK RENDERING ----------------- */
  redraw() {
    // OPTIMIZATION: RAF-based throttling for stable 60fps
    if (this.pendingRedraw) return;
    this.pendingRedraw = true;

    if (this.rafId) cancelAnimationFrame(this.rafId);

    this.rafId = requestAnimationFrame(() => {
      this.pendingRedraw = false;
      this._performRedraw();
    });
  }

  _performRedraw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // OPTIMIZATION: Single pass separation of stroke types
    const highlighters = [];
    const regularStrokes = [];

    for (let i = 0; i < this.strokes.length; i++) {
      if (this.strokes[i].tool === 'highlighter') {
        highlighters.push(this.strokes[i]);
      } else {
        regularStrokes.push(this.strokes[i]);
      }
    }

    // 1. Draw Highlighters first
    if (highlighters.length > 0 || (this.activeStroke && this.activeStroke.tool === 'highlighter')) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'multiply';
      for (let i = 0; i < highlighters.length; i++) {
        this.renderStroke(highlighters[i]);
      }
      if (this.activeStroke && this.activeStroke.tool === 'highlighter') {
        this.renderStroke(this.activeStroke);
      }
      this.ctx.restore();
    }

    // 2. Draw Regular Ink & Shapes
    if (regularStrokes.length > 0 || (this.activeStroke && this.activeStroke.tool !== 'highlighter')) {
      this.ctx.save();
      for (let i = 0; i < regularStrokes.length; i++) {
        this.renderStroke(regularStrokes[i]);
      }
      if (this.activeStroke && this.activeStroke.tool !== 'highlighter') {
        this.renderStroke(this.activeStroke);
      }
      this.ctx.restore();
    }

    // 3. Highlight Selected strokes
    if (this.selectedStrokeIds.size > 0) {
      this.drawSelectionOverlay();
    }
  }

  renderStroke(stroke) {
    // OPTIMIZATION: Viewport culling - skip off-screen strokes
    if (this.zoom < 1 && stroke.points.length > 0) {
      const bounds = this.getStrokeBounds(stroke);
      if (bounds.maxX < 0 || bounds.minX > this.width ||
          bounds.maxY < 0 || bounds.minY > this.height) {
        return;
      }
    }

    this.ctx.save();
    this.ctx.strokeStyle = stroke.color;
    this.ctx.fillStyle = stroke.color;
    this.ctx.lineWidth = stroke.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (stroke.opacity) {
      this.ctx.globalAlpha = stroke.opacity;
    }

    // Render Geometric Shapes
    if (stroke.shapeData) {
      const d = stroke.shapeData;
      this.ctx.beginPath();
      if (d.type === 'line') {
        this.ctx.moveTo(d.x1, d.y1);
        this.ctx.lineTo(d.x2, d.y2);
      } else if (d.type === 'circle') {
        this.ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
      } else if (d.type === 'rectangle') {
        this.ctx.rect(d.x, d.y, d.w, d.h);
      }
      this.ctx.stroke();
      this.ctx.restore();
      return;
    }

    const pts = stroke.points;
    if (pts.length === 1) {
      this.ctx.beginPath();
      this.ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
      return;
    }

    // OPTIMIZATION: Use pre-simplified path or simplify on-the-fly
    const simplifiedPts = stroke.simplified || (pts.length > 100 ? this.simplifyPath(pts, 0.5) : pts);

    this.ctx.beginPath();
    this.ctx.moveTo(simplifiedPts[0].x, simplifiedPts[0].y);

    for (let i = 1; i < simplifiedPts.length - 1; i++) {
      const midX = (simplifiedPts[i].x + simplifiedPts[i + 1].x) / 2;
      const midY = (simplifiedPts[i].y + simplifiedPts[i + 1].y) / 2;
      this.ctx.quadraticCurveTo(simplifiedPts[i].x, simplifiedPts[i].y, midX, midY);
    }

    if (simplifiedPts.length > 1) {
      const last = simplifiedPts[simplifiedPts.length - 1];
      this.ctx.lineTo(last.x, last.y);
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  getStrokeBounds(stroke) {
    // OPTIMIZATION: Use cached bounds
    if (this.strokeBoundsCache.has(stroke.id)) {
      return this.strokeBoundsCache.get(stroke.id);
    }

    const pts = stroke.points;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }

    const bounds = { minX, minY, maxX, maxY };
    this.strokeBoundsCache.set(stroke.id, bounds);
    return bounds;
  }

  simplifyPath(points, tolerance) {
    // Douglas-Peucker algorithm
    if (points.length < 3) return points;

    const sqTolerance = tolerance * tolerance;
    let simplified = [points[0]];

    const simplifyDPStep = (points, first, last, sqTolerance, simplified) => {
      let maxSqDist = sqTolerance;
      let index = 0;

      for (let i = first + 1; i < last; i++) {
        const sqDist = this.getSqSegDist(points[i], points[first], points[last]);
        if (sqDist > maxSqDist) {
          index = i;
          maxSqDist = sqDist;
        }
      }

      if (maxSqDist > sqTolerance) {
        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
        simplified.push(points[index]);
        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
      }
    };

    simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
    simplified.push(points[points.length - 1]);

    return simplified;
  }

  getSqSegDist(p, p1, p2) {
    let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  }

  drawStrokeSegment(stroke, p1, p2) {
    this.renderStroke(stroke);
  }

  drawLassoOverlay() {
    if (this.lassoPolygon.length < 2) return;
    this.ctx.save();
    this.ctx.strokeStyle = '#007aff';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([6, 6]);
    this.ctx.beginPath();
    this.ctx.moveTo(this.lassoPolygon[0].x, this.lassoPolygon[0].y);
    for (let i = 1; i < this.lassoPolygon.length; i++) {
      this.ctx.lineTo(this.lassoPolygon[i].x, this.lassoPolygon[i].y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawSelectionOverlay() {
    if (!this.selectionBounds) return;
    const b = this.selectionBounds;
    this.ctx.save();
    this.ctx.strokeStyle = '#007aff';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 4]);
    this.ctx.fillStyle = 'rgba(0, 122, 255, 0.05)';
    this.ctx.beginPath();
    this.ctx.rect(b.x, b.y, b.width, b.height);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }

  /* ----------------- UNDO / REDO ----------------- */
  recordStateForUndo() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.strokes)));
    this.redoStack = [];
    if (this.undoStack.length > 40) {
      this.undoStack.shift();
    }
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.parse(JSON.stringify(this.strokes)));
    this.strokes = this.undoStack.pop();
    this.selectedStrokeIds.clear();
    this.selectionBounds = null;
    // OPTIMIZATION: Clear cache on undo
    this.strokeBoundsCache.clear();
    this.redraw();
    this.onChange();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.parse(JSON.stringify(this.strokes)));
    this.strokes = this.redoStack.pop();
    this.selectedStrokeIds.clear();
    this.selectionBounds = null;
    // OPTIMIZATION: Clear cache on redo
    this.strokeBoundsCache.clear();
    this.redraw();
    this.onChange();
    return true;
  }

  clear() {
    this.recordStateForUndo();
    this.strokes = [];
    this.selectedStrokeIds.clear();
    this.selectionBounds = null;
    // OPTIMIZATION: Clear cache on clear
    this.strokeBoundsCache.clear();
    this.redraw();
    this.onChange();
  }
}
