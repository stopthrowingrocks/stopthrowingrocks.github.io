(elims (- (+ region0 region1) (+ row0 row1)))  ; ok: ✕ D3 E3 E4

(claim (is-elim D2) (by-contradiction (body) (via region1)))  ; ok: proved: ★{D2} = 0

(claim (is-elim B4) (by-contradiction (body) (via region2)))  ; ok: proved: ★{B4} = 0

(elims (- (clique B3 C3 C4) region3))  ; ok: ✕ C4

(elims (- (clique B2 C2 B3 C3) region3))  ; ok: ✕ B2 C2

(elims (- row2 region3))  ; ok: ✕ A3

(claim (is-elim A2) (by-contradiction (body (stars region3) (stars row3)) (via col0)))  ; ok: proved: ★{A2} = 0

(stars row1)  ; ok: ★ E2

(elims region1)  ; ok: ✕ C1

(elims (- region4 col3))  ; ok: ✕ C5 E5

(stars col2)  ; ok: ★ C3

(stars row3)  ; ok: ★ A4

(stars row4)  ; ok: ★ D5

(stars col1)  ; ok: ★ B1
