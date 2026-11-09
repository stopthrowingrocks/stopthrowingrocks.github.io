; Hand-crafted solution by Marcus Luebke
(stars (- (- region3 (clique E2 F2)) (clique C2 D2 D3)))  ; ok: ★ B2

(stars (- region3 (clique D2 E2 D3)))  ; ok: ★ F2

(stars (- (- region7 (clique D7 E7)) (clique F6 G6 F7)))  ; ok: ★ C7

(stars (- region7 (clique F6 G6 F7)))  ; ok: ★ E7

(stars region7)  ; ok: ★ G6

(define "reg 6 top" (- region6 (- row7 (bound >= 0 A7 N7))))  ; ok: reg 6 top: ★{K5 K6 M6} ≥ 2

(stars (- "reg 6 top" (clique K5 K6)))  ; ok: ★ M6

(replace "reg 6 top" (combine "reg 6 top" (clique K5 K6)))  ; ok: reg 6 top: ★{K5 K6} = 1

(replace region6 (- region6 "reg 6 top"))  ; ok: region 6: ★{I7 J7 K7} = 1

(elims (- row7 region6))  ; ok: ✕ A7

(elims (- colG (- region9 (clique H11 I11))))  ; ok: ✕ G4 G13 G14

(replace region9 (- region9 colG))  ; ok: region 9: ★{H11 I11} = 1

(elims (- (clique H10 I10 H11 I11) region9))  ; ok: ✕ H10 I10

(elims (- (clique H11 I11 H12 I12) region9))  ; ok: ✕ H12 I12

(stars (- (- region13 (clique J12 J13)) (clique J10 J11 K11)))  ; ok: ★ J9

(stars (- region13 (clique J11 K11 J12)))  ; ok: ★ J13

(claim (is-elim G12) (by-contradiction (body) (via (- region14 (+ (clique E14 F14) (clique D12 E12))))))  ; ok: proved: ★{G12} = 0

(define "col G top" (combine (clique G8 G9) (- colG (clique G10 G11))))  ; ok: col G top: ★{G8 G9} = 1

(replace colG (- colG "col G top"))  ; ok: column G: ★{G10 G11} = 1

(elims (- (clique G10 G11 H11) colG))  ; ok: ✕ H11

(stars region9)  ; ok: ★ I11

(stars region13)  ; ok: ★ K11

(elims (- (clique G8 F9 G9) "col G top"))  ; ok: ✕ F9

(elims (- (clique G8 H8 G9 H9) "col G top"))  ; ok: ✕ H8 H9

(elims (- (clique F10 G10 F11 G11) colG))  ; ok: ✕ F10 F11

(define "reg 1 col H" (combine (clique H1 H2) (- colH (+ (clique H3 H4) (clique H13 H14)))))  ; ok: reg 1 col H: ★{H1 H2} = 1

(replace colH (- colH "reg 1 col H"))  ; ok: column H: ★{H3 H4 H13 H14} = 2

(define "reg 4 col H" (combine (clique H3 H4) (- colH (clique H13 H14))))  ; ok: reg 4 col H: ★{H3 H4} = 1

(replace colH (- colH "reg 4 col H"))  ; ok: column H: ★{H13 H14} = 1

(elims (- (clique H1 I1 H2 I2) "reg 1 col H"))  ; ok: ✕ I1 I2

(elims (- (clique H3 I3 H4 I4) "reg 4 col H"))  ; ok: ✕ I3 I4

(stars (- colI (clique I5 I6)))  ; ok: ★ I7

(stars colI)  ; ok: ★ I5

(stars "reg 4 col H")  ; ok: ★ H3

(stars "reg 1 col H")  ; ok: ★ H1

(elims region6)  ; ok: ✕ K7

(claim (is-elim D2) (by-contradiction (body (elims row2) (stars (- region1 (clique K1 L1))) (stars region1) (elims row1) (elims colJ)) (via (- region2 (+ (clique K3 L3 K4 L4) (clique M3 N3 M4 N4))))))  ; ok: proved: ★{D2} = 0

(stars region3)  ; ok: ★ D3

(claim (is-elim K2) (by-contradiction (body) (via region1)))  ; ok: proved: ★{K2} = 0

(claim (is-elim J2) (by-contradiction (body (elims row2) (stars region1) (elims row1)) (via (- region2 (+ (clique L3 K4 L4) (clique M3 N3 M4 N4))))))  ; ok: proved: ★{J2} = 0

(stars region4)  ; ok: ★ F4

(elims (- row1 region1))  ; ok: ✕ M1 N1

(replace region2 (- region2 (+ row2 row3)))  ; ok: region 2: ★{K4 L4 M4 N4} = 1

(replace row4 (- row4 region2))  ; ok: row 4: ★{A4 B4} = 1

(elims (- (clique A4 B4 A5 B5) row4))  ; ok: ✕ A5 B5

(stars (- row5 (clique C5 D5)))  ; ok: ★ K5

(stars row6)  ; ok: ★ A6

(elims (- (clique M3 N3 M4 N4) region2))  ; ok: ✕ M3 N3

(elims (- region5 (+ row4 row5)))  ; ok: ✕ A8

(clear region5)  ; ok: deleted region 5

(define "reg 12 bot" (combine (clique A13 B13 A14 B14) (- (- region12 (clique A9 B9 A10 B10)) (clique A11 B11 A12))))  ; ok: reg 12 bot: ★{A13 B13 A14 B14} = 1

(replace region12 (- region12 "reg 12 bot"))  ; ok: region 12: ★{A9 B9 A10 B10 A11 B11 A12} = 2

(define "reg 12 top" (combine (clique A9 B9 A10 B10) (- region12 (clique A11 B11 A12))))  ; ok: reg 12 top: ★{A9 B9 A10 B10} = 1

(replace region12 (- region12 "reg 12 top"))  ; ok: region 12: ★{A11 B11 A12} = 1

(elims (- (clique A11 B11 A12 B12) region12))  ; ok: ✕ B12

(define "reg 1 dbl" (combine (clique J1 K1) (- (+ colJ colK) (clique J3 K3))))  ; ok: reg 1 dbl: ★{J1 K1} = 1

(define "reg 2 dbl" (- (+ colJ colK) "reg 1 dbl"))  ; ok: reg 2 dbl: ★{J3 K3} = 1

(elims (- row3 "reg 2 dbl"))  ; ok: ✕ L3

(replace row1 (- row1 "reg 1 dbl"))  ; ok: row 1: ★{D1 L1} = 1

(stars (- row8 (clique L8 M8)))  ; ok: ★ G8 N8

(stars row8)  ; ok: ★ L8

(claim (is-elim L2) (by-contradiction (body) (via colK)))  ; ok: proved: ★{L2} = 0

(stars (- colL (clique L13 L14)))  ; ok: ★ L1

(stars row2)  ; ok: ★ N2

(stars colK)  ; ok: ★ K3

(stars colJ)  ; ok: ★ J1

(elims region1)  ; ok: ✕ D1

(claim (!= (count L14 M14) 1) (by-contradiction (body (elims (- (clique L13 M13 L14 M14) asm193_194=1)) (stars (- region10 (clique M11 M12))) (stars region10) (elims colM) (stars region2) (elims colN) (stars region11) (stars (- region14 (+ (clique F13 E14 F14) (clique E12 F12)))) (stars (- region14 (clique F13 E14 F14))) (stars (- colE (clique E9 E10))) (elims row14)) (via (- region8 (+ (clique C9 C10) (clique D9 E9 D10 E10))))))  ; ok: proved: ★{L14 M14} ≠ 1

(replace "clm193_194!=1" (combine "clm193_194!=1" (clique L14 M14)))  ; ok: claim L14 M14: ★{L14 M14} ≤ 0

(elims "clm193_194!=1")  ; ok: ✕ L14 M14

(stars colL)  ; ok: ★ L13

(stars (- colM (clique M10 M11)))  ; ok: ★ M4

(elims (- (clique M10 N10 M11 N11) colM))  ; ok: ✕ N10 N11

(claim (is-elim N14) (by-contradiction (body (elims colN) (stars region11) (stars (- region14 (+ (clique F13 E14 F14) (clique E12 F12)))) (stars (- region14 (clique F13 E14 F14))) (elims (- row14 region14))) (via (- region8 (+ (clique C9 C10 D10) (clique D9 E9 E10))))))  ; ok: proved: ★{N14} = 0

(stars (- region11 (clique N12 N13)))  ; ok: ★ H14

(stars (- region14 (+ (clique F13 E14 F14) (clique E12 F12))))  ; ok: ★ D12

(stars (- region14 (clique F13 E14 F14)))  ; ok: ★ F12

(stars (- colE (clique E9 E10)))  ; ok: ★ E14

(stars colG)  ; ok: ★ G10

(elims (- (clique D9 E9 D10 E10) colE))  ; ok: ✕ D9 D10

(replace region8 (- region8 colE))  ; ok: region 8: ★{C9 C10 C14} = 2

(stars (- region8 (clique C9 C10)))  ; ok: ★ C14

(stars colD)  ; ok: ★ D5

(elims row14)  ; ok: ✕ A14

(stars "reg 12 bot")  ; ok: ★ A13

(stars row12)  ; ok: ★ N12

(stars region10)  ; ok: ★ M10

(elims (- (clique B9 C9 B10 C10) colC))  ; ok: ✕ B9 B10

(stars colB)  ; ok: ★ B4 B11

(stars colA)  ; ok: ★ A9

(stars colC)  ; ok: ★ C9

(stars row10)  ; ok: ★ E10
