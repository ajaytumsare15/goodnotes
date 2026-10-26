/**
 * Export and Backup Module for Goodnotes Notebooks
 */
import { PaperRenderer } from './paper.js';

export class NotebookExporter {
  static async exportPageAsPNG(paperCanvas, inkCanvas, fileName = 'goodnotes-page.png') {
    const width = 794;
    const height = 1123;
    const exportCanvas = document.createElement('canvas');
    const dpr = 2; // High-res 2x export
    exportCanvas.width = width * dpr;
    exportCanvas.height = height * dpr;

    const ctx = exportCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Draw background paper
    ctx.drawImage(paperCanvas, 0, 0, width, height);

    // Draw drawing layer
    ctx.drawImage(inkCanvas, 0, 0, width, height);

    // Trigger download
    const dataUrl = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  static async exportNotebookAsJSON(notebook, pages) {
    const backupData = {
      version: 1,
      appName: 'GoodnotesClone',
      exportedAt: new Date().toISOString(),
      notebook,
      pages
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${notebook.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async printAsPDF(notebook, pages) {
    // Generate an isolated printable view for native browser PDF printing (Save as PDF)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to print/export as PDF.');
      return;
    }

    // Set title and structure safely without document.write to prevent XSS
    printWindow.document.title = notebook.title ? String(notebook.title).slice(0, 80) : 'Goodnotes Export';

    const style = printWindow.document.createElement('style');
    style.textContent = `
      @page { size: A4; margin: 0; }
      body { margin: 0; padding: 0; background: #fff; }
      .page-print { width: 100vw; height: 100vh; page-break-after: always; display: flex; justify-content: center; align-items: center; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; }
    `;
    printWindow.document.head.appendChild(style);

    const container = printWindow.document.createElement('div');
    container.id = 'pages-container';
    printWindow.document.body.appendChild(container);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageDiv = printWindow.document.createElement('div');
      pageDiv.className = 'page-print';

      const tempPaper = document.createElement('canvas');
      PaperRenderer.render(tempPaper, page.paperType || 'ruled', 794, 1123);

      const tempInk = document.createElement('canvas');
      tempInk.width = 794;
      tempInk.height = 1123;
      const inkCtx = tempInk.getContext('2d');

      // Draw strokes on tempInk
      if (page.strokes) {
        // Highlighters
        inkCtx.save();
        inkCtx.globalCompositeOperation = 'multiply';
        page.strokes.filter(s => s.tool === 'highlighter').forEach(s => renderOfflineStroke(inkCtx, s));
        inkCtx.restore();

        // Ink
        page.strokes.filter(s => s.tool !== 'highlighter').forEach(s => renderOfflineStroke(inkCtx, s));
      }

      // Combine
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = 794;
      finalCanvas.height = 1123;
      const fCtx = finalCanvas.getContext('2d');
      fCtx.drawImage(tempPaper, 0, 0);
      fCtx.drawImage(tempInk, 0, 0);

      const img = printWindow.document.createElement('img');
      img.src = finalCanvas.toDataURL('image/png');
      pageDiv.appendChild(img);
      container.appendChild(pageDiv);
    }

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  }
}

function renderOfflineStroke(ctx, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (stroke.opacity) ctx.globalAlpha = stroke.opacity;

  if (stroke.shapeData) {
    const d = stroke.shapeData;
    ctx.beginPath();
    if (d.type === 'line') {
      ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2);
    } else if (d.type === 'circle') {
      ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
    } else if (d.type === 'rectangle') {
      ctx.rect(d.x, d.y, d.w, d.h);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  const pts = stroke.points;
  if (!pts || pts.length === 0) {
    ctx.restore();
    return;
  }
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
  ctx.restore();
}
