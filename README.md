# Goodnotes Web Clone

A full-featured digital notebook application inspired by Goodnotes 6, running directly in the browser with high-DPI vector ink, stroke smoothing, and paper templates.

## ✨ Key Features

1. **Digital Ink & Drawing Engine**:
   - **Ballpoint Pen**: Silky smooth midpoint quadratic Bezier curve interpolation.
   - **Highlighter**: Semi-transparent multiply blend mode (`globalCompositeOperation = 'multiply'`) so highlighters stay underneath pen ink without obscuring text.
   - **Stroke Eraser**: Tap or swipe across any stroke to delete the entire vector path instantly.
   - **Lasso Tool**: Draw a freehand selection loop around strokes to move, duplicate, recolor, or delete them.
   - **Auto-Shapes**: Draw lines, circles, ellipses, or rectangles and the app auto-snaps them to geometric vectors.
   - **Text Annotations**: Click anywhere with the Text tool to type formatted notes.

2. **Goodnotes Paper Templates**:
   - 📝 **Lined / Ruled** (College rule with red margin line)
   - 🔲 **Grid / Graph** (Engineering 24px grid)
   - 🔘 **Dot Grid** (Bullet journal dot matrix)
   - 📋 **Cornell Notes** (Cue column, main note area, summary footer)
   - 📄 **Blank White** (Clean unlined sketchpad)
   - 🌙 **Dark Ruled & Dark Grid** (Low-light writing)
   - 📜 **Warm Sepia** (Parchment finish)

3. **Multi-Page & Multi-Notebook Management**:
   - Create and organize multiple notebooks with customizable colored cover cards.
   - Add, duplicate, reorder, and delete pages.
   - Page thumbnail sidebar drawer for quick visual navigation.

4. **Export & Storage**:
   - Automatic local persistence with IndexedDB.
   - Export page as high-resolution PNG image (2x Retina scale).
   - Export notebook as multi-page PDF document.

---

## ⌨️ Keyboard Shortcuts

| Key | Tool / Action |
| :--- | :--- |
| `P` | Pen Tool |
| `H` | Highlighter Tool |
| `E` | Stroke Eraser |
| `L` | Lasso Selection Tool |
| `S` | Auto-Shape Tool |
| `T` | Text Note Tool |
| `Space` | Hand / Pan Page Tool |
| `Cmd` / `Ctrl` + `Z` | Undo |
| `Cmd` + `Shift` + `Z` / `Ctrl` + `Y` | Redo |
| `[` / `]` | Previous / Next Page |

---

## 🚀 How to Run

You can run the app with Python's built-in web server:

```bash
cd /Users/raavee/.gemini/antigravity/scratch/goodnotes-clone
python3 -m http.server 5173
```

Then open `http://localhost:5173` in your browser!
