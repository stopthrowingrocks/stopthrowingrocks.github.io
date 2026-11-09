(elims (- (+ row4 row5) (+ region4 region5)))  ; ok: ✕ A4 B4 A5 B5

(stars region3)  ; ok: ★ B3

(stars region4)  ; ok: ★ C5

(stars colA)  ; ok: ★ A1

(stars row4)  ; ok: ★ E4

(elims colE)  ; ok: ✕ E1 E2

(elims row1)  ; ok: ✕ C1 D1

(stars region2)  ; ok: ★ D2
