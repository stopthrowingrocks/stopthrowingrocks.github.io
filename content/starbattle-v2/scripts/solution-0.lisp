(elims (- (+ row3 row4) (+ region3 region4)))  ; ok: ✕ A4 B4 A5 B5

(stars region2)  ; ok: ★ B3

(stars region3)  ; ok: ★ C5

(stars col0)  ; ok: ★ A1

(stars row3)  ; ok: ★ E4

(elims col4)  ; ok: ✕ E1 E2

(elims row0)  ; ok: ✕ C1 D1

(stars region1)  ; ok: ★ D2
