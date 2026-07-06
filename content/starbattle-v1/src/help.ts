interface Slide { title: string; body: string; }

const SLIDES: readonly Slide[] = [
  { title: "The Goal",
    body: "<p>Place <strong>K stars</strong> in every row, every column, and every colored region — K is shown in the category name (1★, 2★, or 3★).</p><p>Stars may <strong>never touch</strong> each other, not even diagonally.</p>" },
  { title: "Placing Stars",
    body: "<ul><li><strong>Click</strong> a cell to cycle: empty → <span class='sb-key'>·</span> eliminated → <span class='sb-key'>★</span> star → empty</li><li><strong>Drag</strong> across cells to mark many as eliminated at once</li></ul>" },
  { title: "Visual Feedback",
    body: "<p><strong>Auto-shading:</strong> cells that can't hold a star are dimmed automatically — neighbours of stars, and cells in a completed row / column / region.</p><p><strong>Red borders</strong> flag any group with too many stars or no valid placement left.</p>" },
  { title: "Splitting (Advanced)",
    body: "<p><strong>Right-click</strong> a cell (or tap <span class='sb-key'>✂ Split</span> then a cell) to fork into three boards: the original, one where that cell is ★, and one where it's eliminated.</p><p>Tap the <strong>coloured cell</strong> to cycle between the boards.</p>" },
  { title: "Dead Ends",
    body: "<p>If a branch leads to a contradiction, press <span class='sb-key'>✗ Impos.</span> — it's marked dead and you jump to the surviving branch automatically.</p><p>If both branches are impossible, their parent is also marked dead; this cascades up the tree.</p>" },
];

let modal: HTMLElement | null = null;
let slideEls: HTMLElement[]   = [];
let dotEls: HTMLElement[]     = [];
let currentIdx = 0;

function build(): void {
  if (modal) return;

  modal = document.createElement("div");
  modal.id = "sb-help-modal";
  modal.addEventListener("click", e => { if (e.target === modal) sbCloseHelp(); });

  const box = document.createElement("div");
  box.id = "sb-help-box";

  const closeBtn = document.createElement("button");
  closeBtn.id = "sb-help-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", sbCloseHelp);
  box.appendChild(closeBtn);

  SLIDES.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "sb-slide" + (i === 0 ? " active" : "");
    el.innerHTML = `<h3>${s.title}</h3>${s.body}`;
    box.appendChild(el);
    slideEls.push(el);
  });

  const footer = document.createElement("div");
  footer.id = "sb-help-footer";

  const prev = document.createElement("button");
  prev.id = "sb-help-prev"; prev.className = "sb-hnav";
  prev.textContent = "← Prev"; prev.disabled = true;
  prev.addEventListener("click", () => goto(currentIdx - 1));

  const dotsEl = document.createElement("div");
  dotsEl.id = "sb-help-dots";
  SLIDES.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "sb-dot" + (i === 0 ? " on" : "");
    d.addEventListener("click", () => goto(i));
    dotsEl.appendChild(d);
    dotEls.push(d);
  });

  const next = document.createElement("button");
  next.id = "sb-help-next"; next.className = "sb-hnav";
  next.textContent = "Next →";
  next.addEventListener("click", () => goto(currentIdx + 1));

  footer.appendChild(prev); footer.appendChild(dotsEl); footer.appendChild(next);
  box.appendChild(footer);
  modal.appendChild(box);
  document.body.appendChild(modal);
}

function goto(i: number): void {
  slideEls[currentIdx].classList.remove("active");
  dotEls[currentIdx].classList.remove("on");
  currentIdx = Math.max(0, Math.min(i, slideEls.length - 1));
  slideEls[currentIdx].classList.add("active");
  dotEls[currentIdx].classList.add("on");
  (document.getElementById("sb-help-prev") as HTMLButtonElement).disabled = currentIdx === 0;
  (document.getElementById("sb-help-next") as HTMLButtonElement).disabled = currentIdx === slideEls.length - 1;
}

export function sbOpenHelp(): void {
  build(); goto(0); modal!.classList.add("open");
}

export function sbCloseHelp(): void {
  modal?.classList.remove("open");
}
