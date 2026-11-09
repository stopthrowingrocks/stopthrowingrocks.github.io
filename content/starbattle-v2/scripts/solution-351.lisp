(split region11 _ (clique F10 F11 G11) (clique D10 E10) (clique C10))  ; ok: region 11-1: ★{F10 F11 G11} = 1; region 11-2: ★{D10 E10} = 1; region 11-3: ★{C10} = 1

(stars region11-3)  ; ok: ★ C10

(stars region11-2)  ; ok: ★ E10

(stars region11-1)  ; ok: ★ G11

(split region12 _ (clique J11 K11 J12) (clique J13 K13 J14) (clique I14))  ; ok: region 12-1: ★{J11 K11 J12} = 1; region 12-2: ★{J13 K13 J14} = 1; region 12-3: ★{I14} = 1

(stars region12-3)  ; ok: ★ I14

(stars region12-2)  ; ok: ★ K13

(elims (- (clique J10 K10 J11 K11) region12-1))  ; ok: ✕ J10 K10

(split region8 _ (clique F7 G7 F8) (clique H6 H7) (clique H5))  ; ok: region 8-1: ★{F7 G7 F8} = 1; region 8-2: ★{H6 H7} = 1; region 8-3: ★{H5} = 1

(stars region8-3)  ; ok: ★ H5

(stars region8-2)  ; ok: ★ H7

(elims (- (clique E7 F7 E8 F8) region8-1))  ; ok: ✕ E7 E8

(split region4 _ (clique L4 L5) (clique M2 L3 M3) (clique N3 N4))  ; ok: region 4-1: ★{L4 L5} = 1; region 4-2: ★{M2 L3 M3} = 1; region 4-3: ★{N3 N4} = 1

(elims (- (clique M3 N3 M4 N4) region4-3))  ; ok: ✕ M3 M4

(elims (- (clique L4 L5 M5) region4-1))  ; ok: ✕ M5

(elims (- (clique K4 L4 K5 L5) region4-1))  ; ok: ✕ K4 K5

(elims (- (clique L2 M2 L3) region4-2))  ; ok: ✕ L2

(split region7 _ (clique J4 J5) (clique J6) (clique I9 J9))  ; ok: region 7-1: ★{J4 J5} = 1; region 7-2: ★{J6} = 1; region 7-3: ★{I9 J9} = 1

(stars region7-2)  ; ok: ★ J6

(stars region7-1)  ; ok: ★ J4

(elims (- (clique I9 J9 I10) region7-3))  ; ok: ✕ I10

(claim (is-elim C13) (by-contradiction (body) (via (- region13 (clique A13 A14)))))  ; ok: proved: ★{C13} = 0

(claim (is-elim D13) (by-contradiction (body) (via (- region13 (+ (clique B12 A13 B13) (clique A14 B14))))))  ; ok: proved: ★{D13} = 0

(stars (- region14 (clique E13 E14 F14)))  ; ok: ★ I12 G14

(stars region12)  ; ok: ★ K11

(elims (- (clique E13 D14 E14) region14))  ; ok: ✕ D14

(split (+ colJ colK) "cols JK" (clique J1 K1 J2 K2) (clique J8 K8 J9 K9))  ; ok: cols JK-1: ★{J1 K1 J2 K2} = 1; cols JK-2: ★{J8 K8 J9 K9} = 1

(split (+ colI colJ) "cols IJ" (clique I1 J1 I2 J2) (clique J8 I9 J9))  ; ok: cols IJ-1: ★{I1 J1 I2 J2} = 1; cols IJ-2: ★{J8 I9 J9} = 1

(split region10 _ (clique M9 N9 M10 N10) (clique M11 N11 M12 N12) (clique M13 N13 M14 N14))  ; ok: region 10-1: ★{M9 N9 M10 N10} = 1; region 10-2: ★{M11 N11 M12 N12} = 1; region 10-3: ★{M13 N13 M14 N14} = 1

(split region13 _ (- (+ row13 row14) (+ region10-3 region14)) (clique B12 C12) (clique D12 E12))  ; ok: region 13-1: ★{A13 B13 A14 B14 C14} = 1; region 13-2: ★{B12 C12} = 1; region 13-3: ★{D12 E12} = 1

(elims (- (clique D12 E12 E13) region13-3))  ; ok: ✕ E13

(stars region14)  ; ok: ★ E14

(elims row14)  ; ok: ✕ A14 B14 C14 M14 N14

(elims (- (clique B12 C12 B13) region13-2))  ; ok: ✕ B13

(stars region13-1)  ; ok: ★ A13

(stars region13-2)  ; ok: ★ C12

(stars region13-3)  ; ok: ★ E12

(elims colE)  ; ok: ✕ E1 E2 E3 E4 E5 E6

(elims (- (clique M12 N12 M13 N13) region10-3))  ; ok: ✕ M12 N12

(elims (- (clique M10 N10 M11 N11) region10-2))  ; ok: ✕ M10 N10

(stars row10)  ; ok: ★ A10

(elims (- (clique M8 N8 M9 N9) region10-1))  ; ok: ✕ M8 N8

(split region9 _ (clique B7 C7 B8 C8) (clique B6))  ; ok: region 9-1: ★{B7 C7 B8 C8} = 1; region 9-2: ★{B6} = 1

(stars region9-2)  ; ok: ★ B6

(split region1 _ colA (clique B2 B3 C3) (clique B1))  ; ok: region 1-1: ★{A1 A2 A3 A4 A8} = 1; region 1-2: ★{B2 B3 C3} = 1; region 1-3: ★{B1} = 1

(stars region1-3)  ; ok: ★ B1

(elims (- (clique B3 C3 B4 C4) region1-2))  ; ok: ✕ B4 C4

(claim (is-elim G2) (by-contradiction (body) (via (- region2 (clique D1 D2)))))  ; ok: proved: ★{G2} = 0

(claim (is-elim I9) (by-contradiction (body (elims colI) (elims (- (clique J1 K1 J2 K2) colJ)) (elims (- (clique K8 L8 K9 L9) colK)) (define "region 6-23" (- region6 colK)) (split region3 _ (clique H2 H3) colJ (- (+ colL (+ colM colN)) (+ "region 6-23" (+ region4 region10)))) (elims (- (clique H2 G3 H3) region3-1)) (claim (is-elim G9) (by-contradiction (body (elims (- row9 region10-1)) (stars colK) (stars region8) (elims colG) (split colL _ (clique L1) (clique L3 L4) (clique L5 L6)) (stars colL-1) (stars region4-2) (stars region4-1) (elims region3-3) (stars (- "region 6-23" (clique N6 M7 N7))) (stars region4) (elims (- row7 "region 6-23")) (stars row6) (elims row5) (elims (- colH region3-1)) (split region2 _ (clique D1 D2) (clique F1 F2) (clique F3)) (stars region2-3) (stars region2-2) (elims row1) (stars region2) (stars colJ) (stars colC) (stars region1-2)) (via row3))) (stars colG) (stars colH) (stars (- row9 region10-1)) (claim (is-elim M2) (by-contradiction (body) (via (- colL (+ region4-1 (clique L6 L7)))))) (stars region4-2) (stars region4-1) (elims (- row3 region1-2)) (stars region4-3) (stars (- region6 (clique N6 M7 N7))) (elims colL) (split (- colF region8) "column F" (clique F4) (clique F5 F6)) (stars "column F-1")) (via (- region2 (clique D1 D2)))))  ; ok: proved: ★{I9} = 0

(stars region7)  ; ok: ★ J9

(elims colJ)  ; ok: ✕ J1 J2

(elims (- (clique K1 L1 K2) colK))  ; ok: ✕ L1

(elims (- (clique H1 I1 H2 I2) colI))  ; ok: ✕ H1 H2

(elims (- (+ colL (+ colM colN)) (+ region4 (+ region6 region10))))  ; ok: ✕ M1 N1 N2

(stars (- region3 (+ colI colK)))  ; ok: ★ H3

(stars colI)  ; ok: ★ I1

(split region2 _ (clique D1 D2) (clique F1 G1) (clique F2 F3))  ; ok: region 2-1: ★{D1 D2} = 1; region 2-2: ★{F1 G1} = 1; region 2-3: ★{F2 F3} = 1

(elims (- row1 region2-2))  ; ok: ✕ D1 K1

(stars region3)  ; ok: ★ K2

(stars region2-1)  ; ok: ★ D2

(stars region4-2)  ; ok: ★ M2

(stars region1-2)  ; ok: ★ B3

(stars region1-1)  ; ok: ★ A8

(stars region9)  ; ok: ★ C8

(stars region4-3)  ; ok: ★ N4

(stars row3)  ; ok: ★ F3

(stars (- colD (clique D4 D5)))  ; ok: ★ D6

(stars colD)  ; ok: ★ D4

(elims row4)  ; ok: ✕ L4

(stars region4)  ; ok: ★ L5

(stars row5)  ; ok: ★ F5

(elims region5)  ; ok: ✕ G9 H9

(stars (- row9 region10-1))  ; ok: ★ L9

(stars region10-1)  ; ok: ★ N9

(stars colL)  ; ok: ★ L7

(stars colG)  ; ok: ★ G1

(stars row8)  ; ok: ★ F8

(stars row7)  ; ok: ★ N7

(stars colM)  ; ok: ★ M11 M13
