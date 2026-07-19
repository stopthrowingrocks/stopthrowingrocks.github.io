import { REGION_COLORS } from './constants';
import { CellState, type Puzzle } from './types';

export function renderPreview(p: Puzzle, stateArr: CellState[] | null, size = 150): HTMLCanvasElement {
  const { size: N, regions } = p;
  const cs  = Math.floor(size / N);
  const cv  = document.createElement("canvas");
  cv.width  = cs * N;
  cv.height = cs * N;
  const ctx = cv.getContext("2d")!;

  for (let i = 0; i < N * N; i++) {
    const r = Math.floor(i / N), col = i % N;
    const x = col * cs, y = r * cs;

    ctx.fillStyle = REGION_COLORS[regions[i]] ?? "#ddd";
    ctx.fillRect(x, y, cs, cs);

    ctx.strokeStyle = "#111";
    function drawEdge(thick: boolean, x1: number, y1: number, x2: number, y2: number): void {
      ctx.lineWidth = thick ? 2 : 0.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    drawEdge(r === 0     || regions[i] !== regions[(r-1)*N+col], x,    y,    x+cs, y);
    drawEdge(col === 0   || regions[i] !== regions[r*N+(col-1)], x,    y,    x,    y+cs);
    drawEdge(r === N-1   || regions[i] !== regions[(r+1)*N+col], x,    y+cs, x+cs, y+cs);
    drawEdge(col === N-1 || regions[i] !== regions[r*N+(col+1)], x+cs, y,    x+cs, y+cs);

    if (stateArr?.[i] === CellState.STAR) {
      ctx.fillStyle = "#111";
      ctx.font = `bold ${Math.round(cs * 0.55)}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("★", x + cs / 2, y + cs / 2);
    } else if (stateArr?.[i] === CellState.ELIM) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.arc(x + cs / 2, y + cs / 2, cs * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return cv;
}
