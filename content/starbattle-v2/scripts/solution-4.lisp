(elims (- (+ region1 region2) (+ row1 row2)))  ; ok: ✕ D3 E3 E4

(claim (is-elim D2) (by-contradiction (body) (via region2)))  ; ok: proved: ★{D2} = 0

(claim (is-elim B4) (by-contradiction (body) (via region3)))  ; ok: proved: ★{B4} = 0

(elims (- (clique B3 C3 C4) region4))  ; ok: ✕ C4

(elims (- (clique B2 C2 B3 C3) region4))  ; ok: ✕ B2 C2

(elims (- row3 region4))  ; ok: ✕ A3

(claim (is-elim A2) (by-contradiction (body (stars region4) (stars row4)) (via colA)))  ; ok: proved: ★{A2} = 0

(stars row2)  ; ok: ★ E2

(elims region2)  ; ok: ✕ C1

(elims (- region5 colD))  ; ok: ✕ C5 E5

(stars colC)  ; ok: ★ C3

(stars row4)  ; ok: ★ A4

(stars row5)  ; ok: ★ D5

(stars colB)  ; ok: ★ B1
