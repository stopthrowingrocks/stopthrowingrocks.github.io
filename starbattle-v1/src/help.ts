interface Slide {
  title: string;
  body: string;
}

const SLIDES: readonly Slide[] = [
  {
    title: "The Goal",
    body: "<p>Place <strong>K stars</strong> in every row, every column, and every colored region — K is shown in the category name (1★, 2★, or 3★).</p><p>Stars may <strong>never touch</strong> each other, not even diagonally.</p>",
  },
  {
    title: "Placing Stars",
    body: "<p><strong>Click</strong> a cell to cycle: empty → <span class='sb-key'>·</span> eliminated → <span class='sb-key'>★</span> star → empty.</p><p><strong>Drag</strong> across cells to eliminate multiple cells at a time.</p>",
  },
  {
    title: "Visual Feedback",
    body: "<p><strong>Auto-elimination.</strong> If a cell is next to a starred neighbor, or is in a completed row, column, or region, it will automatically be marked as eliminated for you, but in a lighter color so you know it was an automatic marking.</p><p><strong>Constraint violation.</strong> If there are too few or too many stars in a row, column, or region, that row/column/region will be outlined in red so you know the board cannot be solved in its current state.</p>",
  },
  {
    title: "Splitting (Advanced)",
    body: "<p>To assist in understanding the puzzle structure and trying different options, you have the ability to <strong>Split</strong> the board on a cell. What this will do is create <em>two boards</em>, one where that cell is a star, and one where it is eliminated.</p><p>To split a cell, either right click a cell or press the <strong>Split</strong> button and then click a cell normally. Once the boards are split, you can cycle between them by clicking on the split cell, which is bordered in blue.</p>",
  },
  {
    title: "✗ Impos.",
    body: "<p>If you've split the board and become convinced that that board is impossible, you can press the <strong>✗ Impos.</strong> button to declare that board impossible. This will bring you back to the other board, which is now considered forced. The corresponding cell that was originally split on will be bordered in grey, and you can click it to bring yourself back to the board you declared impossible.</p><p>You can declare a board impossible either after you've created a <strong>contradiction</strong> outlined in red, or if you become convinced by your own reasoning.</p>",
  },
];

let modal: HTMLElement | null = null;
let slideEls: HTMLElement[] = [];
let dotEls: HTMLElement[] = [];
let currentIdx = 0;

function build(): void {
  if (modal) return;

  modal = document.createElement("div");
  modal.id = "sb-help-modal";
  modal.addEventListener("click", (e) => {
    if (e.target === modal) sbCloseHelp();
  });

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
  prev.id = "sb-help-prev";
  prev.className = "sb-hnav";
  prev.textContent = "← Prev";
  prev.disabled = true;
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
  next.id = "sb-help-next";
  next.className = "sb-hnav";
  next.textContent = "Next →";
  next.addEventListener("click", () => goto(currentIdx + 1));

  footer.appendChild(prev);
  footer.appendChild(dotsEl);
  footer.appendChild(next);
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
  (document.getElementById("sb-help-prev") as HTMLButtonElement).disabled =
    currentIdx === 0;
  (document.getElementById("sb-help-next") as HTMLButtonElement).disabled =
    currentIdx === slideEls.length - 1;
}

export function sbOpenHelp(): void {
  build();
  goto(0);
  modal!.classList.add("open");
}

export function sbCloseHelp(): void {
  modal?.classList.remove("open");
}
