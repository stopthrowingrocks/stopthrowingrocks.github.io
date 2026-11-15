(split region12 _ (clique N8 N9) (clique M10 N10 M11) (clique M12 M13))  ; ok: region 12-1: ★{N8 N9} = 1; region 12-2: ★{M10 N10 M11} = 1; region 12-3: ★{M12 M13} = 1

(elims (- (clique M8 N8 M9 N9) region12-1))  ; ok: ✕ M8 M9

(elims (- (clique M10 N10 M11 N11) region12-2))  ; ok: ✕ N11

(elims (- (clique M12 N12 M13 N13) region12-3))  ; ok: ✕ N12 N13

(elims (- (clique L12 M12 L13 M13) region12-3))  ; ok: ✕ L12 L13

(split region7 _ (clique E4 D5 E5) (clique D6 E6 D7) (clique D8 D9))  ; ok: region 7-1: ★{E4 D5 E5} = 1; region 7-2: ★{D6 E6 D7} = 1; region 7-3: ★{D8 D9} = 1

(elims (- (clique D4 E4 D5 E5) region7-1))  ; ok: ✕ D4

(elims (- (clique D6 E6 D7 E7) region7-2))  ; ok: ✕ E7

(elims (- (clique D8 E8 D9 E9) region7-3))  ; ok: ✕ E8 E9

(elims (- (clique C8 D8 C9 D9) region7-3))  ; ok: ✕ C8 C9

(claim (= (count I13 J13 K13) 0) (by-contradiction (body (claim (is-elim L11) (by-contradiction (body (stars region12-3) (stars (- region14 (clique J14 K14))) (stars region14)) (via "asm176_177_178!=0"))) (split region14 _ (clique I14 J14) (clique K14 L14) (clique M14 N14)) (elims (- (clique I13 J13 I14 J14) region14-1)) (elims (- (clique K13 K14 L14) region14-2))) (via "asm176_177_178!=0")))  ; ok: proved: ★{I13 J13 K13} = 0

(elims "clm176_177_178=0")  ; ok: ✕ I13 J13 K13

(claim (!= (count G4 G5 G6 G7 G8) 0) (by-contradiction (body (elims "asm48_62_76_90_104=0") (split region4 _ (clique F2 E3 F3) (clique F4 F5) (clique F6)) (stars region4-3) (stars region4-2) (stars region4-1) (stars region7-1) (stars region7-2) (stars region7-3) (elims colD) (elims colF)) (via (- colE (+ (clique E11 E12) (clique E13 E14))))))  ; ok: proved: ★{G4 G5 G6 G7 G8} ≠ 0

(replace "clm48_62_76_90_104!=0" (combine "clm48_62_76_90_104!=0" (bound >= 0 G4 G5 G6 G7 G8)))  ; ok: claim G4 G5 G6 G7 G8: ★{G4 G5 G6 G7 G8} ≥ 1

(define "region 4 columns E,F" (- region4 "clm48_62_76_90_104!=0"))  ; ok: region 4 columns E,F: ★{F2 E3 F3 F4 F5 F6} ≤ 2

(suppose S3 (= (count G4 G5 G6 G7 G8) 3) (split "asm48_62_76_90_104=3" _ (clique G4 G5) (clique G6 G7) (clique G8)) (stars "asm48_62_76_90_104=3-3") (stars "asm48_62_76_90_104=3-2") (stars "asm48_62_76_90_104=3-1") (elims region4) (elims colG))  ; ok: recorded: S3 would settle 30 cells

(define "region count" (+ (+ region1 region6) (+ region9 region13)))  ; ok: region count: ★{A1 B1 C1 A2 B2 C2 D2 E2 A3 B3 C3 D3 A4 B4 C4 A5 B5 C5 A6 B6 C6 A7 B7 C7 A8 B8 A9 B9 A10 B10 A11 B11 C11 D11 A12 B12 C12 I12 A13 B13 C13 H13 A14 B14 C14 D14 E14 F14 G14 H14} = 12

(define "column count" (+ (+ colA colB) colC))  ; ok: column count: ★{A1 B1 C1 A2 B2 C2 A3 B3 C3 A4 B4 C4 A5 B5 C5 A6 B6 C6 A7 B7 C7 A8 B8 A9 B9 A10 B10 C10 A11 B11 C11 A12 B12 C12 A13 B13 C13 A14 B14 C14} = 9

(claim (is-elim L11) (by-contradiction (body (stars region12-3) (stars region12-2) (stars region12-1) (stars (- region14 (clique J14 K14))) (stars region14) (define "reg 3-2,3" (- region3 colN)) (claim (is-elim I12) (by-contradiction (body (claim (is-elim G10) (by-contradiction (body) (via (- region11 (clique H8 I8 I9))))) (split (+ row11 row12) "rows 11,12" (clique A11 B11 A12 B12) (clique C11 D11 C12 D12) (clique E11 F11 E12 F12) (clique G11 G12)) (elims (- (clique F11 G11 F12 G12) "rows 11,12-4")) (elims (- (clique D11 E11 D12 E12) "rows 11,12-3")) (elims (- (clique B11 C11 B12 C12) "rows 11,12-2")) (split (+ row12 row13) "rows 12,13" (clique A12 A13 B13) (clique C12 C13 D13) (clique E12 E13 F13) (clique G12 G13)) (elims (- (clique G12 F13 G13) "rows 12,13-4")) (elims (- (clique E12 D13 E13) "rows 12,13-3")) (elims (- (clique C12 B13 C13) "rows 12,13-2")) (claim (is-elim H10) (by-contradiction (body) (via (- region11 (clique H8 I8))))) (claim (is-elim G11) (by-contradiction (body (stars "rows 12,13-4") (define "reg 4-1" (combine "clm48_62_76_90_104!=0" (- colG (bound >= 0 G1 G2 G3 G9)))) (elims (- colG "reg 4-1")) (define "reg 4-2,3" (- region4 "reg 4-1")) (split (- (+ "region count" (bound >= 0 C10)) "column count") "left side" (clique D2 E2 D3) (clique D14 E14)) (elims (- (clique D2 E2 D3 E3) "left side-1")) (elims (- (clique E13 D14 E14) "left side-2")) (elims (- row14 "left side-2")) (stars "rows 12,13-3") (claim (is-star C12) (by-contradiction (body (stars "rows 12,13-2") (stars "left side-2") (stars "rows 11,12-2")) (via region13))) (elims row12) (stars row11) (stars row13) (elims (- (+ colD colE) (+ "left side-1" (+ "left side-2" region7)))) (stars (- row10 (clique I10 J10))) (stars region7-3) (elims (- (clique D5 E5 D6 E6) region7-2)) (stars region7-1) (elims (- (clique I9 J9 I10 J10) row10)) (elims region10) (elims (- (+ colA colC) (- region6 (bound <= 1 B6)))) (stars (- region6 (+ colA colC))) (stars region9) (elims (- (clique A3 B3 A4 B4) colA))) (via (- region1 (+ colB "left side-1"))))) (stars "rows 11,12-4") (split region11 _ (clique F9 G9) (clique H8 I8 H9 I9) (clique I10)) (stars region11-3) (elims colI) (stars region11-2) (stars region11-1) (split region8 _ (clique J5 J6 K6) (clique K7) (clique K8 K9 L9)) (stars region8-2) (stars region8-1) (stars (- colJ (clique J1 J2))) (stars colJ) (stars colK) (split (- region3 colN) "reg 3" (clique L1 M1 L2) (clique M6)) (stars "reg 3-2") (split region5 _ (clique M2) (clique L3 M3 L4 M4) (clique H2)) (stars region5-3) (stars region5-1)) (via region3))) (claim (is-elim C10) (by-contradiction (body) (via (- region13 (+ row14 (clique C12 C13)))))) (define diff (- (- "region count" "column count") (- row14 (bound >= 0 A14 B14 C14)))) (stars (- diff (clique D2 E2 D3))) (replace diff (combine diff (clique D2 E2 D3))) (elims (- (clique D2 E2 D3 E3) diff)) (claim (<= (count A14 B14 C14) 0) (by-contradiction (body) (via (- (- (- "region count" "column count") (- row14 "asm182_183_184>=1")) (clique D2 E2 D3))))) (elims "clm182_183_184<=0") (claim (!= (count K1 L1 M1 L2) 0) (by-contradiction (body (elims "asm10_11_12_25=0") (split "reg 3-2,3" _ (clique L6 M6 L7) (clique L8)) (stars "reg 3-2,3-2") (split region8 _ (clique I5 J5 I6 J6) (clique J9 J10) (clique K6)) (stars region8-3) (define "region 5-1,2" (- (+ colL (+ colM colN)) region3)) (define "region 5-3" (- region5 "region 5-1,2")) (split "region 5-1,2" "region 5" (clique M2 L3 M3) (clique L4 M4 M5)) (elims (- (clique L3 M3 L4 M4) colL)) (stars (- colM (clique M5 M6))) (stars colL) (stars colM) (stars colN) (stars colK) (elims region5) (elims (- (clique H5 I5 H6 I6) region8-1)) (elims (- (clique I9 J9 I10 J10) region8-2)) (split colJ _ (clique J8) region8-2 (clique J11 J12)) (stars colJ-1) (stars colJ-2) (stars colJ-3) (stars (- colI region8-1)) (elims row8) (stars region7-3) (split region4 _ (clique F2 E3 F3) (clique F4 G4 F5 G5) (clique F6 G6 G7)) (elims (- (clique F6 G6 F7 G7) region4-3)) (elims (- (clique E2 F2 E3 F3) region4-1)) (elims (- (clique C2 D2 C3 D3) diff)) (elims (- (clique F2 G2 F3 G3) region4-1)) (split row7 _ (clique A7 B7) (clique C7 D7) (clique G7 H7)) (elims (- (clique A6 B6 A7 B7) row7-1)) (elims (- (clique C6 D6 C7 D7) row7-2)) (elims (- (clique G6 G7 H7) row7-3)) (split (+ row9 row10) "rows 9,10" (clique A9 B9 A10 B10) (clique F9 G9 F10 G10) (clique H9 H10)) (elims (- (clique G9 H9 G10 H10) "rows 9,10-3")) (split (+ row11 row12) "rows 11,12" (clique A11 B11 A12 B12) (clique F11 G11 F12 G12) (clique H11 H12)) (elims (- (clique G11 H11 G12 H12) "rows 11,12-3")) (elims (- region2 (- colH (+ "rows 9,10-3" "rows 11,12-3")))) (stars (- row1 (clique B1 C1))) (stars row1) (stars row2) (stars diff) (elims region1) (stars row3) (stars row4) (stars region7-1)) (via colD))) (replace "clm10_11_12_25!=0" (combine "clm10_11_12_25!=0" (bound >= 0 K1 L1 M1 L2))) (claim (!= (count F2 F3 F4 F5 F6) 0) (by-contradiction (body (elims "asm19_33_47_61_75=0") (split region4 _ (clique G4 G5) (clique G6 G7) (clique G8)) (stars region4-3) (stars region4-2) (stars region4-1) (elims colG) (split (+ row12 row13) "rows 12,13" (clique A12 B12 A13 B13) (clique C13 D13) (clique F12 E13 F13) (clique H12) (clique J12)) (stars "rows 12,13-4") (stars "rows 12,13-5") (split colH _ (clique H1 H2) (clique H10)) (stars colH-2) (elims (- (clique H1 I1 H2 I2) colH-1)) (claim (is-elim E13) (by-contradiction (body) (via row14))) (claim (is-elim F11) (by-contradiction (body (elims region11) (stars "rows 12,13-3") (stars row14)) (via region10))) (stars region11) (elims row8) (split row9 _ (clique A9 B9) (clique D9) (clique K9 L9)) (stars row9-2) (split row7 _ (clique A7 B7) (clique C7 D7) (clique K7 L7)) (elims (- (clique A6 B6 A7 B7) row7-1)) (elims (- (clique C6 D6 C7 D7) row7-2)) (elims (- (clique K6 L6 K7 L7) row7-3)) (elims (- (clique A10 B10 A11 B11) row11)) (elims (- (clique A11 B11 A12 B12) row11)) (stars row12) (claim (is-elim D5) (by-contradiction (body (elims colD)) (via region7))) (split (+ colE colF) "columns E,F" (clique E1 F1 E2) (clique E4 E5) (clique E6) (clique F10) (clique E14 F14)) (stars "columns E,F-3") (stars "columns E,F-2") (stars "columns E,F-4") (stars row7-2) (stars row7-1) (elims region10) (stars "rows 12,13-2") (stars "rows 12,13-1") (elims row10) (split region8 _ (clique I5 J5 I6 J6) (clique K7) (clique K9 L9)) (stars region8-2) (elims (- region9 (- row9 region8-3))) (stars row11) (elims region13)) (via row14))) (replace "clm19_33_47_61_75!=0" (combine "clm19_33_47_61_75!=0" (bound >= 0 F2 F3 F4 F5 F6))) (claim (is-elim B12) (by-contradiction (body) (via (- (+ row13 row14) (+ (clique F13 G13 F14 G14) (clique D13 E13 D14 E14)))))) (split (+ row11 row12) "rows 11,12" (clique A11 B11 A12) (clique F11 G11 F12 G12) (clique H11 I11 H12) (clique J11 J12)) (elims (- (clique I11 J11 J12) "rows 11,12-4")) (elims (- (clique G11 H11 G12 H12) "rows 11,12-3")) (claim (is-star D9) (by-contradiction (body (stars region7-3) (elims (- (clique D5 E5 D6 E6) region7-2)) (stars region7-1) (split (+ row9 row10) "rows 9,10" (clique A9 B9 A10 B10) (clique F9 G9 F10 G10) (clique H9 I9 H10 I10) (clique J9 K9 J10) (clique L9)) (stars "rows 9,10-5") (elims (- (clique I9 J9 I10 J10) "rows 9,10-4")) (elims (- (clique G9 H9 G10 H10) "rows 9,10-3")) (elims (- (clique D1 E1 D2 E2) diff)) (define hyp (- (+ colD colE) (+ diff region7-2))) (split (+ row12 row13) "rows 12,13" (clique A12 A13 B13) (clique C13 D13) (clique F12 E13 F13) (clique G12 H12 G13) (clique J12)) (stars "rows 12,13-5") (elims (- (clique C13 D13 D14) "rows 12,13-2")) (claim (is-elim F6) (by-contradiction (body (stars region7-2) (elims colD) (stars diff) (stars "rows 12,13-2") (stars region4) (elims row8) (stars "rows 9,10-2")) (via (- region11 (clique H11 H12))))) (stars "clm19_33_47_61_75!=0") (stars diff) (elims colD) (stars region7-2) (stars "rows 12,13-2") (elims (- region13 row14)) (elims (- (clique E13 F13 E14 F14) colE)) (elims (- colF (+ "rows 9,10-2" "rows 11,12-2"))) (define hyp2 (- colG region4)) (elims (- (+ row13 row14) (+ hyp2 hyp))) (stars "rows 12,13-1") (define "region 9-2" (- region9 "rows 9,10-1")) (elims (- (clique A7 B7 A8 B8) "region 9-2")) (claim (is-star H11) (by-contradiction (body (stars "rows 11,12-3") (stars row11)) (via region10))) (stars row12)) (via row13))) (claim (is-elim F11) (by-contradiction (body (stars row12) (elims region11) (split (+ row13 row14) "rows 13,14" (clique C13 D13 D14) (clique E13 F13 E14 F14) (clique G14)) (stars "rows 13,14-3") (elims (- (clique D13 E13 D14 E14) "rows 13,14-2")) (stars "rows 13,14-1") (stars row13) (elims region13) (stars (- region10 (clique F7 F8))) (elims (- (clique F7 G7 F8 G8) region10)) (split region9 _ (clique B7 C7 B8) (clique A9 B9 A10)) (split (- (+ row9 row10) region9-2) "rows 9,10" (clique J9 K9 J10) (clique L9)) (stars "rows 9,10-2") (split region4 _ (clique F2) (clique F3 F4 G4) (clique F5 G5 F6 G6)) (stars region4-1) (elims (- (clique F4 G4 F5 G5) region4-2)) (elims (- (clique C2 D2 C3 D3) diff)) (elims (- colD diff)) (stars (- region7 (clique E5 E6))) (stars region7) (stars region4) (stars region10) (stars diff) (claim (is-elim J10) (by-contradiction (body (elims row10) (elims (- (clique A8 B8 A9 B9) row9)) (stars row8) (elims colJ)) (via (- region2 (clique H1 I1))))) (stars row10) (stars row9) (elims (- (clique A7 B7 A8 B8) row8)) (split row7 _ (clique C7) (clique I7 J7) (clique K7 L7)) (stars row7-1) (stars row8) (elims colA)) (via (- region6 colC)))) (stars "rows 11,12-2") (claim (is-elim C13) (by-contradiction (body (elims (- region13 row14)) (stars row13) (stars row12) (split (+ colB colC) "columns B,C" (clique B1 C1 B2 C2) (clique B3 C3 B4 C4) (clique B5 C5 B6 C6) (clique B7 C7 B8) (clique B9)) (stars "columns B,C-5") (stars row11) (elims region9)) (via "columns B,C-4"))) (elims (- (clique A10 B10 A11 B11) (- region13 row14))) (stars (- (+ row12 row13) (clique A12 A13 B13))) (stars row11) (elims colD) (stars (- region7 (clique E5 E6))) (stars region7) (stars diff)) (via "clm19_33_47_61_75!=0")))  ; ok: proved: ★{L11} = 0

(elims (- row14 region14))  ; ok: ✕ A14 B14 C14 D14 E14 F14 G14 H14

(split region14 _ (clique I14 J14) (clique K14 L14) (clique M14 N14))  ; ok: region 14-1: ★{I14 J14} = 1; region 14-2: ★{K14 L14} = 1; region 14-3: ★{M14 N14} = 1

(elims (- (clique M13 M14 N14) region14-3))  ; ok: ✕ M13

(stars region12-3)  ; ok: ★ M12

(elims (- (clique N9 M10 N10) region12-2))  ; ok: ✕ N9

(stars region12-1)  ; ok: ★ N8

(claim (is-elim C10) (by-contradiction (body) (via (- region13 (+ (clique C12 C13) (clique I12 H13))))))  ; ok: proved: ★{C10} = 0

(claim (is-elim D12) (by-contradiction (body) (via (- region13 (+ (clique B10 B11) (clique I12 H13))))))  ; ok: proved: ★{D12} = 0

(split (- "region count" "column count") amalg (clique D2 E2 D3) (clique D11) (clique I12 H13))  ; ok: amalg-1: ★{D2 E2 D3} = 1; amalg-2: ★{D11} = 1; amalg-3: ★{I12 H13} = 1

(stars amalg-2)  ; ok: ★ D11

(elims (- (clique H12 I12 H13) amalg-3))  ; ok: ✕ H12

(elims (- (clique D2 E2 D3 E3) amalg-1))  ; ok: ✕ E3

(claim (!= (count D13 E13) 0) (by-contradiction (body (elims "asm171_172=0") (split colE _ (clique E1 E2) (clique E4 E5) (clique E6)) (stars colE-3) (stars colE-2)) (via (- (+ colD colE) (+ region7 (clique D1 E1 D2 E2))))))  ; ok: proved: ★{D13 E13} ≠ 0

(replace "clm171_172!=0" (combine (clique D13 E13) (combine "clm171_172!=0" (bound >= 0 D13 E13))))  ; ok: claim D13 E13: ★{D13 E13} = 1

(elims (- (+ colD colE) (+ amalg-1 (+ region7 "clm171_172!=0"))))  ; ok: ✕ D1 E1

(claim (is-elim B6) (by-contradiction (body (split colC _ (clique C1 C2) (clique C3 C4) (clique C13)) (stars colC-3) (elims (- (clique B1 C1 B2 C2) colC-1)) (elims (- (clique C1 C2 D2) colC-1)) (elims (- (clique B3 C3 B4 C4) colC-2)) (elims (- (clique C3 D3 C4) colC-2)) (split region1 _ (clique A1 A2) colC-1 (clique E2)) (stars region1-3) (split region9 _ (clique B8 A9 B9) (clique A10 A11) (clique A12 A13)) (elims (- colA (+ region1-1 (+ region9-2 region9-3))))) (via (- region6 colC-2))))  ; ok: proved: ★{B6} = 0

(claim (!= (count A3 A4 A5 A6 A7 A8) 0) (by-contradiction (body (elims "asm28_42_56_70_84_98=0")) (via (- region6 (+ (clique C3 C4) (clique C5 C6))))))  ; ok: proved: ★{A3 A4 A5 A6 A7 A8} ≠ 0

(replace "clm28_42_56_70_84_98!=0" (combine "clm28_42_56_70_84_98!=0" (bound >= 0 A3 A4 A5 A6 A7 A8)))  ; ok: claim A3 A4 A5 A6 A7 A8: ★{A3 A4 A5 A6 A7 A8} ≥ 1

(claim (!= (count C3 C4 C5 C6) 0) (by-contradiction (body (elims "asm30_44_58_72=0") (stars (- colC (clique C1 C2))) (elims (- colA region6))) (via region9)))  ; ok: proved: ★{C3 C4 C5 C6} ≠ 0

(replace "clm30_44_58_72!=0" (combine "clm30_44_58_72!=0" (bound >= 0 C3 C4 C5 C6)))  ; ok: claim C3 C4 C5 C6: ★{C3 C4 C5 C6} ≥ 1

(define "region 13-2" (- region13 amalg-3))  ; ok: region 13-2: ★{B10 B11 C13} = 1

(claim (is-elim D5) (by-contradiction (body) (via colE)))  ; ok: proved: ★{D5} = 0

(elims (- (clique E4 F4 E5 F5) region7-1))  ; ok: ✕ F4 F5

(claim (!= (count D6 E6) 0) (by-contradiction (body (elims "asm73_74=0") (stars region7-2) (stars region7-3) (elims colD) (stars amalg-1) (split region4 _ (clique G4) (clique G5 F6 G6) (clique G7 G8)) (stars region4-1) (elims (- (clique F6 G6 F7 G7) region4-2)) (stars region4-3) (stars (- colE region7-1))) (via (- colF (clique F10 F11)))))  ; ok: proved: ★{D6 E6} ≠ 0

(replace "clm73_74!=0" (combine (clique D6 E6) (combine "clm73_74!=0" (bound >= 0 D6 E6))))  ; ok: claim D6 E6: ★{D6 E6} = 1

(elims (- (clique E5 D6 E6) "clm73_74!=0"))  ; ok: ✕ E5

(stars region7-1)  ; ok: ★ E4

(elims (- (clique D6 E6 D7) "clm73_74!=0"))  ; ok: ✕ D7

(claim (is-elim F7) (by-contradiction (body) (via (- region4 (clique G4 G5)))))  ; ok: proved: ★{F7} = 0

(claim (is-elim F8) (by-contradiction (body (split region4 _ (clique F2) (clique G4) (clique G5 F6 G6)) (stars region4-1) (stars region4-2) (stars amalg-1) (elims (- colD region7-3)) (stars region7-2) (stars "clm171_172!=0") (stars region4-3) (elims (- (clique F10 G10 F11 G11) colF)) (elims (- region10 colG)) (stars colF) (stars colG) (stars amalg-3)) (via (- colH (+ (clique H1 H2) (clique H8 H9))))))  ; ok: proved: ★{F8} = 0

(claim (is-elim K10) (by-contradiction (body (split region8 _ (clique I5 J5 I6 J6) (clique K6 K7) (clique K8)) (stars region8-3) (stars region8-2) (elims colK) (elims (- (clique H5 I5 H6 I6) region8-1)) (stars region14-2) (stars region14-3) (split colL _ (clique L1 L2) (clique L3 L4)) (elims (- (clique L1 M1 L2 M2) colL-1)) (elims (- (clique L3 M3 L4 M4) colL-2)) (split colM _ (clique M5 M6) (clique M10)) (stars colM-2) (elims (- (clique M5 N5 M6 N6) colM)) (split region3 _ colN colL-1 (clique M6)) (stars region3-3) (split region5 _ (clique H2 I2 I3) (clique I4 J4) colL-2) (elims (- (clique I4 J4 I5) region5-2)) (stars region8-1) (elims row6)) (via region7-2)))  ; ok: proved: ★{K10} = 0

(claim (!= (count F12 G12 F13 G13) 0) (by-contradiction (body (elims "asm159_160_173_174=0") (stars (- region10 (+ "clm171_172!=0" (clique G10 H10)))) (stars (- region10 "clm171_172!=0")) (elims (- row10 region12)) (split (+ row12 row13) "rows 12,13" (clique A12 B12 A13 B13) (clique C13) "clm171_172!=0" amalg-3 (clique J12 K12)) (stars "rows 12,13-2") (stars "clm171_172!=0") (elims (- (clique J11 K11 J12 K12) "rows 12,13-5"))) (via (- row11 (clique A11 B11)))))  ; ok: proved: ★{F12 G12 F13 G13} ≠ 0

(replace "clm159_160_173_174!=0" (combine (clique F12 G12 F13 G13) (combine "clm159_160_173_174!=0" (bound >= 0 F12 G12 F13 G13))))  ; ok: claim F12 G12 F13 G13: ★{F12 G12 F13 G13} = 1

(define "region 10-3" (- region10 (+ "clm171_172!=0" "clm159_160_173_174!=0")))  ; ok: region 10-3: ★{F10 G10 H10} = 1

(claim (is-elim G9) (by-contradiction (body) (via "region 10-3")))  ; ok: proved: ★{G9} = 0

(claim (is-elim G11) (by-contradiction (body) (via "region 10-3")))  ; ok: proved: ★{G11} = 0

(split (+ row11 row12) "rows 11,12" (clique A11 B11 A12 B12) (clique F11 F12 G12) (clique H11 I11 I12) (clique J11 K11 J12 K12))  ; ok: rows 11,12-1: ★{A11 B11 A12 B12} = 1; rows 11,12-2: ★{F11 F12 G12} = 1; rows 11,12-3: ★{H11 I11 I12} = 1; rows 11,12-4: ★{J11 K11 J12 K12} = 1

(claim (is-elim D13) (by-contradiction (body (stars colE) (split colF _ (clique F9) (clique F10 F11) (clique F12 F13)) (stars colF-1)) (via (- region4 (+ (clique G4 G5) (clique G6 G7))))))  ; ok: proved: ★{D13} = 0

(stars "clm171_172!=0")  ; ok: ★ E13

(elims (- (clique G12 G13 H13) "clm159_160_173_174!=0"))  ; ok: ✕ H13

(stars amalg-3)  ; ok: ★ I12

(claim (is-elim L10) (by-contradiction (body (stars (- row11 (clique A11 B11))) (stars region10) (stars region12) (elims row10) (elims (- (clique A11 B11 A12 B12) row11)) (stars row12) (elims region11) (stars (- row9 (clique A9 B9))) (split region9 _ (- (+ row11 row13) region13) (clique A9 B9) (clique B7 C7 B8)) (elims (- (clique A8 B8 A9 B9) region9-2)) (stars row8) (split row7 _ (clique A7) region9-3 (clique I7 J7)) (stars row7-1) (stars row7-2) (stars "clm73_74!=0")) (via (- colF (clique F1 F2)))))  ; ok: proved: ★{L10} = 0

(suppose "S F11" (is-star F11) (stars region10))  ; ok: recorded: S F11 would settle 9 cells

(claim (is-star H10) (by-contradiction (body (elims (- (clique F9 F10 G10) "region 10-3")) (elims (- (clique F10 G10 F11) "region 10-3")) (stars (- colF (clique F1 F2))) (stars region7-2) (stars colE)) (via colF)))  ; ok: proved: ★{H10} = 1

(elims "region 10-3")  ; ok: ✕ F10

(claim (is-elim E2) (by-contradiction (body (elims colE) (stars region7-2) (stars (- colF (clique F10 F11)))) (via region4)))  ; ok: proved: ★{E2} = 0

(stars amalg-1)  ; ok: ★ D2

(stars colE)  ; ok: ★ E6

(stars (- colF (clique F1 F2)))  ; ok: ★ F9 F11

(stars region10)  ; ok: ★ G13

(split colC _ (clique C4 C5) (clique C6 C7) (clique C13))  ; ok: column C-1: ★{C4 C5} = 1; column C-2: ★{C6 C7} = 1; column C-3: ★{C13} = 1

(stars colC-3)  ; ok: ★ C13

(elims region13)  ; ok: ✕ B10 B11

(elims row13)  ; ok: ✕ A13

(elims (- (clique B4 C4 B5 C5) colC-1))  ; ok: ✕ B4 B5

(elims (- (clique C6 B7 C7) colC-2))  ; ok: ✕ B7

(claim (is-star J10) (by-contradiction (body (stars (- row10 region12)) (stars row11) (stars row12) (stars (- colB (clique B1 B2))) (stars colC-1)) (via colC-2)))  ; ok: proved: ★{J10} = 1

(stars "rows 11,12-4")  ; ok: ★ K12

(elims row12)  ; ok: ✕ A12

(elims (- row10 region12-2))  ; ok: ✕ A10

(split region9 _ row11 (clique A9 B9) (clique B7 C7 B8))  ; ok: region 9-1: ★{A11} = 1; region 9-2: ★{A9 B9} = 1; region 9-3: ★{C7 B8} = 1

(elims (- (clique A8 B8 A9 B9) region9-2))  ; ok: ✕ A8 B8

(elims (- (clique C6 B7 C7) region9-3))  ; ok: ✕ C6

(elims region11)  ; ok: ✕ H8 I8

(elims (- (+ colF colG) region4))  ; ok: ✕ F1 G1 G2 G3

(split colG _ (clique G4 G5) (clique G6 G7))  ; ok: column G-1: ★{G4 G5} = 1; column G-2: ★{G6 G7} = 1

(stars colF)  ; ok: ★ F2

(elims (- (clique G4 H4 G5 H5) colG-1))  ; ok: ✕ H4 H5

(elims (- (clique G6 H6 G7 H7) colG-2))  ; ok: ✕ H6 H7

(stars (- colH (clique H2 H3)))  ; ok: ★ H1

(stars colH)  ; ok: ★ H3

(stars colG-1)  ; ok: ★ G5

(stars colG-2)  ; ok: ★ G7

(stars (- colC (clique C4 C5)))  ; ok: ★ C7

(stars region7)  ; ok: ★ D9

(stars region9-1)  ; ok: ★ A11

(elims (- colA (- region6 colC)))  ; ok: ✕ A1 A2 A9

(stars region9)  ; ok: ★ B9

(elims row9)  ; ok: ✕ L9

(stars (- region1 (clique B2 B3)))  ; ok: ★ B1

(stars region1)  ; ok: ★ B3

(stars colC)  ; ok: ★ C5

(stars (- colA (clique A6 A7)))  ; ok: ★ A5

(stars colA)  ; ok: ★ A7

(stars (- row8 (clique K8 L8)))  ; ok: ★ J8

(stars row8)  ; ok: ★ L8

(elims row5)  ; ok: ✕ I5 J5 K5 L5 M5 N5

(stars colI)  ; ok: ★ I6 I14

(stars region8)  ; ok: ★ K6

(elims region2)  ; ok: ✕ J1 J2 J3

(stars colJ)  ; ok: ★ J4

(elims row6)  ; ok: ✕ M6 N6

(claim (is-elim M3) (by-contradiction (body) (via row4)))  ; ok: proved: ★{M3} = 0

(claim (is-elim L3) (by-contradiction (body) (via region5)))  ; ok: proved: ★{L3} = 0

(stars row3)  ; ok: ★ N3

(stars region5)  ; ok: ★ K2 L4

(stars colL)  ; ok: ★ L14

(stars region14)  ; ok: ★ N14

(stars colM)  ; ok: ★ M1 M10
