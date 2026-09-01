; Region0 = A1,B1,A2,B2,A3 exactly 2. {A1,B1,A2,B2} is a 2x2 block (all king-adjacent) -> at most 1 star.
(define r0clique (clique A1 B1 A2 B2))
(define r0rest (- region0 r0clique))
(stars r0rest)

; region1 (display "region 2") = C1,D1,C2,D2,C3,D3,C4 =2. Top 2x2 block <=1, rest {C3,D3,C4} is also a clique (<=1) but must be >=1 combined -> =1.
(define r1top (clique C1 D1 C2 D2))
(define r1rest (- region1 r1top))
(define r1restClique (clique C3 D3 C4))
(define r1restEq (combine r1rest r1restClique))
(subsum region1 r1restEq)
; region1 is now exactly 1 over {C1,D1,C2,D2} (the top block), matching r1top's <=1 bound tightened to =1.

; region2 = E1,E2,E3,F3,G3,H3,I3,D4,E4,F4 =2. {E3,F3,E4,F4} is a 2x2 block (<=1).
(define r2clique1 (clique E3 F3 E4 F4))
(define r2rest (- region2 r2clique1))
; r2rest: >=1 among {E1,E2,G3,H3,I3,D4}
(define r2clique2 (clique E1 E2))

; region3 = F1,G1,H1,I1,J1,F2,G2,H2,I2,J2,J3,J4,I5,J5 =2.
(define r3clique1 (clique F1 G1 F2 G2))
(define r3clique2 (clique H1 I1 H2 I2))
(define r3clique3 (clique J1 J2))
(define r3clique4 (clique J3 J4))
(define r3clique5 (clique I5 J5))
