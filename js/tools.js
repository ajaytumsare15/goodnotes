/**
 * Goodnotes Toolset Controller & Text/Image Annotation Layer
 */

export class ToolManager {
  constructor(inkCanvas, deskContainer) {
    this.ink = inkCanvas;
    this.desk = deskContainer;

    // Presets
    this.colorPresets = ['#007aff', '#ff3b30', '#34c759']; // Blue, Red, Green
    this.thicknessPresets = [2.0, 4.0, 7.0]; // Fine, Medium, Bold

    // Active Settings
    this.activeColor = this.colorPresets[0];
    this.activeThickness = this.thicknessPresets[0];

    // Highlighters have distinct presets
    this.highlighterColorPresets = ['#ffcc00', '#34c759', '#ff2d55'];
    this.highlighterActiveColor = this.highlighterColorPresets[0];

    this.textNotes = []; // Text boxes for active page
    this.images = []; // Image attachments for active page
  }

  setTool(toolName) {
    this.ink.tool = toolName;

    // Apply appropriate color & width
    if (toolName === 'highlighter') {
      this.ink.color = this.highlighterActiveColor;
      this.ink.widthScale = 6.0;
    } else {
      this.ink.color = this.activeColor;
      this.ink.widthScale = this.activeThickness;
    }

    // Update cursor styling on the drawing canvas
    const c = this.ink.canvas;
    c.className = '';
    if (toolName === 'eraser') c.classList.add('cursor-eraser');
    else if (toolName === 'lasso') c.classList.add('cursor-lasso');
    else if (toolName === 'hand') c.classList.add('cursor-pan');
  }

  setColor(color) {
    if (this.ink.tool === 'highlighter') {
      this.highlighterActiveColor = color;
      this.ink.color = color;
    } else {
      this.activeColor = color;
      this.ink.color = color;
    }
  }

  setThickness(val) {
    this.activeThickness = parseFloat(val);
    if (this.ink.tool !== 'highlighter') {
      this.ink.widthScale = this.activeThickness;
    }
  }

  /* ----------------- TEXT NOTES ----------------- */
  addTextBox(x, y, content = 'Type notes here...') {
    const box = {
      id: 'tb_' + Date.now(),
      x,
      y,
      content,
      fontSize: 16,
      color: this.activeColor
    };
    this.textNotes.push(box);
    this.renderTextBoxDOM(box);
    return box;
  }

  renderTextBoxDOM(box) {
    const paperContainer = this.ink.canvas.parentElement;
    let el = document.getElementById(box.id);
    if (!el) {
      el = document.createElement('div');
      el.id = box.id;
      el.className = 'text-box-element';
      el.contentEditable = 'true';
      el.spellcheck = false;
      paperContainer.appendChild(el);

      el.addEventListener('blur', () => {
        box.content = el.textContent || '';
        if (!box.content.trim()) {
          el.remove();
          this.textNotes = this.textNotes.filter(t => t.id !== box.id);
        }
      });

      // Prevent rich HTML / script injection via paste
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        selection.deleteFromDocument();
        selection.getRangeAt(0).insertNode(document.createTextNode(text));
        selection.collapseToEnd();
      });
    }

    el.textContent = box.content || '';
    el.style.left = `${box.x}px`;
    el.style.top = `${box.y}px`;
    el.style.color = box.color;
    el.style.fontSize = `${box.fontSize}px`;
  }

  loadTextNotes(notes = []) {
    // Clear existing DOM text boxes
    const existing = document.querySelectorAll('.text-box-element');
    existing.forEach(e => e.remove());

    this.textNotes = notes || [];
    this.textNotes.forEach(b => this.renderTextBoxDOM(b));
  }

  getTextNotes() {
    return this.textNotes;
  }
}
