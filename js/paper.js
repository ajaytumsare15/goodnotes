/**
 * Paper Background Engine for Goodnotes Templates
 */
export class PaperRenderer {
  static TEMPLATES = [
    { id: 'ruled', name: 'Lined / Ruled', dark: false },
    { id: 'grid', name: 'Grid / Graph', dark: false },
    { id: 'dot', name: 'Dot Grid', dark: false },
    { id: 'cornell', name: 'Cornell Notes', dark: false },
    { id: 'blank', name: 'Blank White', dark: false },
    { id: 'dark-ruled', name: 'Dark Ruled', dark: true },
    { id: 'dark-grid', name: 'Dark Grid', dark: true },
    { id: 'sepia', name: 'Warm Sepia', dark: false }
  ];

  static render(canvas, type = 'ruled', width = 794, height = 1123) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const isDark = type.startsWith('dark');
    const isSepia = type === 'sepia';

    // Base Paper Color
    if (isDark) {
      ctx.fillStyle = '#1e1e24';
    } else if (isSepia) {
      ctx.fillStyle = '#f7f1e5';
    } else {
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillRect(0, 0, width, height);

    const lineColor = isDark ? 'rgba(255, 255, 255, 0.09)' : isSepia ? 'rgba(139, 90, 43, 0.15)' : 'rgba(0, 0, 0, 0.09)';
    const marginColor = isDark ? 'rgba(255, 69, 58, 0.35)' : 'rgba(255, 59, 48, 0.35)';

    switch (type) {
      case 'ruled':
      case 'dark-ruled':
      case 'sepia': {
        const lineSpacing = 32;
        const topMargin = 72;
        const leftMargin = 80;

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;

        // Horizontal ruled lines
        for (let y = topMargin; y < height - 40; y += lineSpacing) {
          ctx.beginPath();
          ctx.moveTo(30, y);
          ctx.lineTo(width - 30, y);
          ctx.stroke();
        }

        // Left margin line
        if (type !== 'sepia') {
          ctx.strokeStyle = marginColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(leftMargin, 0);
          ctx.lineTo(leftMargin, height);
          ctx.stroke();
        }
        break;
      }

      case 'grid':
      case 'dark-grid': {
        const gridSize = 24;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 0.8;

        ctx.beginPath();
        for (let x = gridSize; x < width; x += gridSize) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let y = gridSize; y < height; y += gridSize) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
        break;
      }

      case 'dot': {
        const dotSpacing = 24;
        const dotColor = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.22)';
        ctx.fillStyle = dotColor;

        for (let x = dotSpacing; x < width; x += dotSpacing) {
          for (let y = dotSpacing; y < height; y += dotSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }

      case 'cornell': {
        const headerH = 70;
        const cueW = 200;
        const summaryH = 150;
        const lineSpacing = 28;

        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = 1.5;

        // Top Header divider
        ctx.beginPath();
        ctx.moveTo(0, headerH);
        ctx.lineTo(width, headerH);
        ctx.stroke();

        // Left Cue vertical divider
        ctx.beginPath();
        ctx.moveTo(cueW, headerH);
        ctx.lineTo(cueW, height - summaryH);
        ctx.stroke();

        // Bottom Summary divider
        ctx.beginPath();
        ctx.moveTo(0, height - summaryH);
        ctx.lineTo(width, height - summaryH);
        ctx.stroke();

        // Labels
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)';
        ctx.fillText('HEADER / TITLE', 24, 40);
        ctx.fillText('CUE COLUMN / QUESTIONS', 24, headerH + 28);
        ctx.fillText('MAIN NOTES AREA', cueW + 20, headerH + 28);
        ctx.fillText('SUMMARY', 24, height - summaryH + 28);

        // Lines in main note area
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        for (let y = headerH + 40; y < height - summaryH - 20; y += lineSpacing) {
          ctx.beginPath();
          ctx.moveTo(cueW + 15, y);
          ctx.lineTo(width - 25, y);
          ctx.stroke();
        }
        break;
      }

      case 'blank':
      default:
        // Already filled with solid paper color
        break;
    }
  }
}
