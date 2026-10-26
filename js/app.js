/**
 * Main Goodnotes Application Controller
 */
import { storage } from './storage.js';
import { PaperRenderer } from './paper.js';
import { InkCanvas } from './canvas.js';
import { ToolManager } from './tools.js';
import { NotebookExporter } from './export.js';

class GoodnotesApp {
  constructor() {
    this.currentNotebook = null;
    this.currentPageIndex = 0;
    this.pagesData = [];

    // DOM Elements
    this.paperCanvas = document.getElementById('paper-background-canvas');
    this.inkCanvasEl = document.getElementById('active-drawing-canvas');
    this.paperContainer = document.getElementById('paper-container');
    this.deskViewport = document.getElementById('desk-viewport');

    // Engines
    this.ink = new InkCanvas(this.inkCanvasEl);
    this.tools = new ToolManager(this.ink, this.paperContainer);

    this.init();
  }

  async init() {
    await storage.ready;

    // Load or create initial notebook
    const allNotebooks = await storage.getAllNotebooks();
    if (allNotebooks.length === 0) {
      await this.createDefaultWelcomeNotebook();
    } else {
      await this.loadNotebook(allNotebooks[0].id);
    }

    this.bindUIEvents();
    this.bindKeyboardShortcuts();
    this.renderTemplatePickerOptions();
    this.updateZoomLabel();
  }

  /* ----------------- NOTEBOOK & PAGE MANAGEMENT ----------------- */
  async createDefaultWelcomeNotebook() {
    const notebookId = 'nb_' + Date.now();
    const pageId1 = 'page_' + Date.now() + '_1';

    const defaultNotebook = {
      id: notebookId,
      title: 'Quick Notes',
      coverColor: '#007aff',
      paperType: 'ruled',
      pageIds: [pageId1],
      createdAt: new Date().toISOString()
    };

    const initialPage = {
      id: pageId1,
      notebookId: notebookId,
      paperType: 'ruled',
      strokes: this.generateSampleWelcomeStrokes(),
      textNotes: [
        {
          id: 'tb_welcome',
          x: 100,
          y: 75,
          content: '✨ Welcome to Goodnotes Web! Try writing with pen, highlighting, or using the lasso tool.',
          fontSize: 16,
          color: '#007aff'
        }
      ]
    };

    await storage.saveNotebook(defaultNotebook);
    await storage.savePage(initialPage);
    await this.loadNotebook(notebookId);
  }

  generateSampleWelcomeStrokes() {
    // A nice sample handwritten checkmark & star to welcome the user
    return [
      {
        id: 's_sample_star',
        tool: 'highlighter',
        color: '#ffcc00',
        width: 28,
        opacity: 0.38,
        points: [
          { x: 90, y: 85 }, { x: 700, y: 85 }
        ]
      },
      {
        id: 's_sample_box',
        tool: 'shape',
        color: '#34c759',
        width: 2.5,
        points: [],
        shapeData: {
          type: 'rectangle',
          x: 100,
          y: 160,
          w: 590,
          h: 110
        }
      }
    ];
  }

  async loadNotebook(id) {
    this.currentNotebook = await storage.getNotebook(id);
    document.getElementById('notebook-title-input').value = this.currentNotebook.title;

    // Load pages
    this.pagesData = [];
    for (const pId of this.currentNotebook.pageIds) {
      let page = await storage.getPage(pId);
      if (!page) {
        page = { id: pId, notebookId: id, paperType: this.currentNotebook.paperType, strokes: [], textNotes: [] };
        await storage.savePage(page);
      }
      this.pagesData.push(page);
    }

    this.currentPageIndex = 0;
    this.loadCurrentPage();
    this.updateThumbnailsSidebar();
  }

  loadCurrentPage() {
    const page = this.pagesData[this.currentPageIndex];
    if (!page) return;

    // Render paper background
    const paperType = page.paperType || this.currentNotebook.paperType || 'ruled';
    PaperRenderer.render(this.paperCanvas, paperType, 794, 1123);
    this.paperContainer.setAttribute('data-paper-dark', paperType.startsWith('dark'));

    // Load strokes into ink engine
    this.ink.setStrokes(page.strokes || []);

    // Load text annotations
    this.tools.loadTextNotes(page.textNotes || []);

    // Update page indicator HUD
    document.getElementById('page-indicator').innerText = `Page ${this.currentPageIndex + 1} of ${this.pagesData.length}`;

    // Update sidebar active thumbnail
    this.highlightActiveThumbnail();
  }

  async saveCurrentPage() {
    const page = this.pagesData[this.currentPageIndex];
    if (!page) return;

    page.strokes = this.ink.getStrokes();
    page.textNotes = this.tools.getTextNotes();
    await storage.savePage(page);

    this.updateThumbnailsSidebar();
  }

  async addNewPage() {
    const newPageId = 'page_' + Date.now();
    const newPage = {
      id: newPageId,
      notebookId: this.currentNotebook.id,
      paperType: this.currentNotebook.paperType || 'ruled',
      strokes: [],
      textNotes: []
    };

    // Insert after current page
    this.pagesData.splice(this.currentPageIndex + 1, 0, newPage);
    this.currentNotebook.pageIds.splice(this.currentPageIndex + 1, 0, newPageId);

    await storage.savePage(newPage);
    await storage.saveNotebook(this.currentNotebook);

    this.currentPageIndex++;
    this.loadCurrentPage();
  }

  async deleteCurrentPage() {
    if (this.pagesData.length <= 1) {
      alert('A notebook must have at least one page.');
      return;
    }

    const removed = this.pagesData.splice(this.currentPageIndex, 1)[0];
    this.currentNotebook.pageIds = this.currentNotebook.pageIds.filter(id => id !== removed.id);

    await storage.deletePage(removed.id);
    await storage.saveNotebook(this.currentNotebook);

    if (this.currentPageIndex >= this.pagesData.length) {
      this.currentPageIndex = this.pagesData.length - 1;
    }
    this.loadCurrentPage();
  }

  /* ----------------- UI BINDINGS ----------------- */
  bindUIEvents() {
    // Sync strokes change
    this.ink.onChange = () => this.saveCurrentPage();

    // Lasso selection change
    const lassoBox = document.getElementById('lasso-box');
    this.ink.onSelectionChange = (bounds) => {
      if (bounds) {
        lassoBox.style.display = 'block';
        lassoBox.style.left = `${bounds.x}px`;
        lassoBox.style.top = `${bounds.y}px`;
        lassoBox.style.width = `${bounds.width}px`;
        lassoBox.style.height = `${bounds.height}px`;
      } else {
        lassoBox.style.display = 'none';
      }
    };

    document.getElementById('btn-lasso-delete').onclick = () => this.ink.deleteSelectedStrokes();
    document.getElementById('btn-lasso-duplicate').onclick = () => this.ink.duplicateSelectedStrokes();

    // Title editing (sanitized and length-limited)
    const titleInput = document.getElementById('notebook-title-input');
    titleInput.maxLength = 80;
    titleInput.addEventListener('change', async () => {
      const sanitizedTitle = titleInput.value.trim().slice(0, 80) || 'Untitled Notebook';
      this.currentNotebook.title = sanitizedTitle;
      titleInput.value = sanitizedTitle;
      await storage.saveNotebook(this.currentNotebook);
    });

    // Page navigation
    document.getElementById('btn-prev-page').onclick = () => {
      if (this.currentPageIndex > 0) {
        this.saveCurrentPage();
        this.currentPageIndex--;
        this.loadCurrentPage();
      }
    };

    document.getElementById('btn-next-page').onclick = () => {
      if (this.currentPageIndex < this.pagesData.length - 1) {
        this.saveCurrentPage();
        this.currentPageIndex++;
        this.loadCurrentPage();
      }
    };

    document.getElementById('btn-add-page').onclick = () => this.addNewPage();
    document.getElementById('btn-sidebar-add-page').onclick = () => this.addNewPage();

    // Undo / Redo
    document.getElementById('btn-undo').onclick = () => this.ink.undo();
    document.getElementById('btn-redo').onclick = () => this.ink.redo();

    // Clear Page
    document.getElementById('btn-clear-page').onclick = () => {
      if (confirm('Clear all drawings on this page?')) {
        this.ink.clear();
      }
    };

    // Export Handlers
    document.getElementById('btn-export-png').onclick = () => {
      NotebookExporter.exportPageAsPNG(
        this.paperCanvas,
        this.inkCanvasEl,
        `${this.currentNotebook.title}_page_${this.currentPageIndex + 1}.png`
      );
    };

    document.getElementById('btn-export-pdf').onclick = () => {
      NotebookExporter.printAsPDF(this.currentNotebook, this.pagesData);
    };

    // Sidebar Toggle
    document.getElementById('btn-toggle-sidebar').onclick = () => {
      const sidebar = document.getElementById('page-sidebar');
      sidebar.classList.toggle('collapsed');
    };

    // Tools Switching
    const toolButtons = {
      pen: document.getElementById('tool-pen'),
      highlighter: document.getElementById('tool-highlighter'),
      eraser: document.getElementById('tool-eraser'),
      lasso: document.getElementById('tool-lasso'),
      shape: document.getElementById('tool-shape'),
      text: document.getElementById('tool-text'),
      hand: document.getElementById('tool-hand')
    };

    Object.keys(toolButtons).forEach(tool => {
      toolButtons[tool].onclick = () => {
        Object.values(toolButtons).forEach(b => b.classList.remove('active'));
        toolButtons[tool].classList.add('active');
        this.tools.setTool(tool);
      };
    });

    // Text tool click to add text
    this.inkCanvasEl.addEventListener('click', (e) => {
      if (this.ink.tool === 'text') {
        const pt = this.ink.getCanvasPoint(e);
        this.tools.addTextBox(pt.x, pt.y);
        this.saveCurrentPage();
      }
    });

    // Color Presets
    const colorDots = [
      document.getElementById('color-dot-1'),
      document.getElementById('color-dot-2'),
      document.getElementById('color-dot-3')
    ];

    colorDots.forEach(dot => {
      dot.onclick = () => {
        colorDots.forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        const color = dot.getAttribute('data-color');
        this.tools.setColor(color);
        if (this.ink.selectedStrokeIds.size > 0) {
          this.ink.setSelectedStrokesColor(color);
        }
      };
    });

    const customPicker = document.getElementById('custom-color-picker');
    customPicker.addEventListener('input', (e) => {
      colorDots.forEach(d => d.classList.remove('selected'));
      this.tools.setColor(e.target.value);
      if (this.ink.selectedStrokeIds.size > 0) {
        this.ink.setSelectedStrokesColor(e.target.value);
      }
    });

    // Thickness Presets
    const thickPills = [
      document.getElementById('thick-pill-1'),
      document.getElementById('thick-pill-2'),
      document.getElementById('thick-pill-3')
    ];

    thickPills.forEach(pill => {
      pill.onclick = () => {
        thickPills.forEach(p => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.tools.setThickness(pill.getAttribute('data-thickness'));
      };
    });

    // Zoom Controls
    document.getElementById('btn-zoom-in').onclick = () => {
      this.ink.setZoom(this.ink.zoom + 0.15);
      this.updateZoomLabel();
    };

    document.getElementById('btn-zoom-out').onclick = () => {
      this.ink.setZoom(this.ink.zoom - 0.15);
      this.updateZoomLabel();
    };

    document.getElementById('btn-zoom-reset').onclick = () => {
      this.ink.setZoom(1.0);
      this.updateZoomLabel();
    };

    // Modal: Template Picker
    const templateModal = document.getElementById('modal-template');
    document.getElementById('btn-template-picker').onclick = () => templateModal.classList.add('open');
    document.getElementById('btn-close-template-modal').onclick = () => templateModal.classList.remove('open');

    // Modal: Notebooks Shelf
    const shelfModal = document.getElementById('modal-notebooks');
    document.getElementById('btn-library').onclick = () => {
      this.renderNotebooksShelf();
      shelfModal.classList.add('open');
    };
    document.getElementById('btn-close-notebooks-modal').onclick = () => shelfModal.classList.remove('open');

    document.getElementById('btn-create-new-notebook').onclick = async () => {
      const rawTitle = prompt('Enter notebook title:', 'New Notebook');
      if (!rawTitle) return;
      const title = rawTitle.trim().slice(0, 80) || 'New Notebook';
      const id = 'nb_' + Date.now();
      const pId = 'page_' + Date.now();
      const colors = ['#007aff', '#34c759', '#af52de', '#ff9500', '#ff2d55', '#5856d6'];
      const chosenColor = colors[Math.floor(Math.random() * colors.length)];

      const nb = {
        id,
        title,
        coverColor: chosenColor,
        paperType: 'ruled',
        pageIds: [pId],
        createdAt: new Date().toISOString()
      };
      const pg = { id: pId, notebookId: id, paperType: 'ruled', strokes: [], textNotes: [] };

      await storage.saveNotebook(nb);
      await storage.savePage(pg);
      shelfModal.classList.remove('open');
      await this.loadNotebook(id);
    };
  }

  updateZoomLabel() {
    document.getElementById('zoom-label').innerText = `${Math.round(this.ink.zoom * 100)}%`;
  }

  /* ----------------- TEMPLATES PICKER ----------------- */
  renderTemplatePickerOptions() {
    const grid = document.getElementById('template-picker-grid');
    grid.innerHTML = '';

    PaperRenderer.TEMPLATES.forEach(tmpl => {
      const card = document.createElement('div');
      card.className = 'template-card';

      const previewBox = document.createElement('div');
      previewBox.className = 'template-preview-box';
      const pCanvas = document.createElement('canvas');
      PaperRenderer.render(pCanvas, tmpl.id, 140, 180);
      previewBox.appendChild(pCanvas);

      const label = document.createElement('span');
      label.className = 'template-name';
      label.innerText = tmpl.name;

      card.appendChild(previewBox);
      card.appendChild(label);

      card.onclick = async () => {
        const page = this.pagesData[this.currentPageIndex];
        page.paperType = tmpl.id;
        await storage.savePage(page);
        this.loadCurrentPage();
        document.getElementById('modal-template').classList.remove('open');
      };

      grid.appendChild(card);
    });
  }

  /* ----------------- NOTEBOOKS SHELF MODAL ----------------- */
  async renderNotebooksShelf() {
    const grid = document.getElementById('notebooks-shelf-grid');
    grid.innerHTML = '';

    const notebooks = await storage.getAllNotebooks();
    notebooks.forEach(nb => {
      const card = document.createElement('div');
      card.className = 'notebook-cover-card';

      const cover = document.createElement('div');
      cover.className = 'notebook-cover-graphic';
      cover.style.background = `linear-gradient(135deg, ${nb.coverColor || '#007aff'}, #1c1c1e)`;

      const title = document.createElement('div');
      title.className = 'notebook-cover-title';
      title.innerText = nb.title;
      cover.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.style.fontSize = '11px';
      subtitle.style.opacity = '0.7';
      subtitle.innerText = `${nb.pageIds.length} page(s)`;
      cover.appendChild(subtitle);

      card.appendChild(cover);

      card.onclick = async () => {
        document.getElementById('modal-notebooks').classList.remove('open');
        await this.loadNotebook(nb.id);
      };

      grid.appendChild(card);
    });
  }

  /* ----------------- SIDEBAR THUMBNAILS ----------------- */
  updateThumbnailsSidebar() {
    const container = document.getElementById('thumbnails-list');
    container.innerHTML = '';

    this.pagesData.forEach((page, idx) => {
      const item = document.createElement('div');
      item.className = 'thumb-item' + (idx === this.currentPageIndex ? ' active' : '');

      const wrap = document.createElement('div');
      wrap.className = 'thumb-canvas-wrap';

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.className = 'thumb-canvas';
      // Quick miniature render
      PaperRenderer.render(thumbCanvas, page.paperType || 'ruled', 160, 226);
      wrap.appendChild(thumbCanvas);

      const footer = document.createElement('div');
      footer.className = 'thumb-footer';
      const pageLabel = document.createElement('span');
      pageLabel.textContent = `Page ${idx + 1}`;
      footer.appendChild(pageLabel);

      const actions = document.createElement('div');
      actions.className = 'thumb-actions';

      const delBtn = document.createElement('button');
      delBtn.className = 'thumb-btn-sm';
      delBtn.title = 'Delete Page';
      delBtn.innerText = '🗑';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this.currentPageIndex = idx;
        this.deleteCurrentPage();
      };
      actions.appendChild(delBtn);

      footer.appendChild(actions);

      item.appendChild(wrap);
      item.appendChild(footer);

      item.onclick = () => {
        this.saveCurrentPage();
        this.currentPageIndex = idx;
        this.loadCurrentPage();
      };

      container.appendChild(item);
    });
  }

  highlightActiveThumbnail() {
    const items = document.querySelectorAll('.thumb-item');
    items.forEach((it, idx) => {
      if (idx === this.currentPageIndex) it.classList.add('active');
      else it.classList.remove('active');
    });
  }

  /* ----------------- KEYBOARD SHORTCUTS ----------------- */
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.isContentEditable) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.ink.redo();
        else this.ink.undo();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        this.ink.redo();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'p': document.getElementById('tool-pen').click(); break;
        case 'h': document.getElementById('tool-highlighter').click(); break;
        case 'e': document.getElementById('tool-eraser').click(); break;
        case 'l': document.getElementById('tool-lasso').click(); break;
        case 's': document.getElementById('tool-shape').click(); break;
        case 't': document.getElementById('tool-text').click(); break;
        case ' ': document.getElementById('tool-hand').click(); break;
        case '[': document.getElementById('btn-prev-page').click(); break;
        case ']': document.getElementById('btn-next-page').click(); break;
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new GoodnotesApp();
});
