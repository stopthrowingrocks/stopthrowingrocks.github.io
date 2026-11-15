(split region12 _ (clique N8 N9) (clique M10 N10 M11) (clique M12 M13))

(elims (- (clique M10 N10 M11 N11) region12-2))

(elims (- (clique M12 N12 M13 N13) region12-3))

(elims (- (clique L12 M12 L13 M13) region12-3))

(split region7 _ (clique E4 D5 E5) (clique D6 E6 D7) (clique D8 D9))

(elims (- (clique D4 E4 D5 E5) region7-1))

(elims (- (clique D6 E6 D7 E7) region7-2))

(elims (- (clique D8 E8 D9 E9) region7-3))

(elims (- (clique C8 D8 C9 D9) region7-3))

(claim (= (count I13 J13 K13) 0)
  (by-contradiction
    (body
      (claim (is-elim L11)
        (by-contradiction
          (body
            (stars region12-3)
            (stars (- region14 (clique J14 K14)))
            (stars region14)
          )
          (via "asm176_177_178!=0")
        )
      )
      (split region14 _ (clique I14 J14) (clique K14 L14) (clique M14 N14))
      (elims (- (clique I13 J13 I14 J14) region14-1))
      (elims (- (clique K13 K14 L14) region14-2))
    )
    (via "asm176_177_178!=0")
  )
)

(elims "clm176_177_178=0")

(define "region count" (+ (+ region1 region6) (+ region9 region13)))

(define "column count" (+ (+ colA colB) colC))

(claim (is-elim L11)
  (by-contradiction
    (body
      (stars region12-3)
      (stars region12-2)
      (stars region12-1)
      (stars (- region14 (clique J14 K14)))
      (stars region14)
      (claim (is-elim I12)
        (by-contradiction
          (body
            (split (+ row11 row12) "rows 11,12" (clique A11 B11 A12 B12) (clique C11 D11 C12 D12) (clique E11 F11 E12 F12) (clique G11 G12))
            (elims (- (clique F11 G11 F12 G12) "rows 11,12-4"))
            (elims (- (clique D11 E11 D12 E12) "rows 11,12-3"))
            (elims (- (clique B11 C11 B12 C12) "rows 11,12-2"))
            (split (+ row12 row13) "rows 12,13" (clique A12 A13 B13) (clique C12 C13 D13) (clique E12 E13 F13) (clique G12 G13))
            (claim (is-elim G11)
              (by-contradiction
                (body
                  (stars "rows 12,13-4")
                  (split (- (+ "region count" (bound >= 0 C10)) "column count") "left side" (clique D2 E2 D3) (clique D14 E14))
                  (elims (- (clique E13 D14 E14) "left side-2"))
                  (stars "rows 12,13-3")
                  (claim (is-star C12)
                    (by-contradiction
                      (body
                        (stars "rows 12,13-2")
                        (stars "left side-2")
                        (stars "rows 11,12-2")
                      )
                      (via region13)
                    )
                  )
                  (stars row11)
                  (stars row13)
                  (elims (- (+ colD colE) (+ "left side-1" (+ "left side-2" region7))))
                  (stars (- row10 (clique I10 J10)))
                  (elims (- (+ colA colC) (- region6 (bound <= 1 B6))))
                  (stars (- region6 (+ colA colC)))
                  (stars region9)
                )
                (via (- region1 (+ colB "left side-1")))
              )
            )
            (split region11 _ (clique F9 G9) (clique H8 I8 H9 I9) (clique I10))
            (stars region11-3)
            (elims colI)
            (split region8 _ (clique J5 J6 K6) (clique K7) (clique K8 K9 L9))
            (stars region8-2)
            (stars region8-1)
            (stars (- colJ (clique J1 J2)))
            (stars colJ)
            (split (- region3 colN) "reg 3" (clique L1 M1 L2) (clique M6))
            (stars "reg 3-2")
            (split region5 _ (clique M2) (clique L3 M3 L4 M4) (clique H2))
            (stars region5-1)
          )
          (via region3)
        )
      )
      (claim (is-elim C10)
        (by-contradiction
          (body
          )
          (via (- region13 (+ row14 (clique C12 C13))))
        )
      )
      (define diff (- (- "region count" "column count") (- row14 (bound >= 0 A14 B14 C14))))
      (stars (- diff (clique D2 E2 D3)))
      (replace diff (combine diff (clique D2 E2 D3)))
      (elims (- (clique D2 E2 D3 E3) diff))
      (claim (<= (count A14 B14 C14) 0)
        (by-contradiction
          (body
          )
          (via (- (- (- "region count" "column count") (- row14 "asm182_183_184>=1")) (clique D2 E2 D3)))
        )
      )
      (elims "clm182_183_184<=0")
      (claim (!= (count F2 F3 F4 F5 F6) 0)
        (by-contradiction
          (body
            (elims "asm19_33_47_61_75=0")
            (split region4 _ (clique G4 G5) (clique G6 G7) (clique G8))
            (stars region4-3)
            (stars region4-2)
            (stars region4-1)
            (elims colG)
            (split (+ row12 row13) "rows 12,13" (clique A12 B12 A13 B13) (clique C13 D13) (clique F12 E13 F13) (clique H12) (clique J12))
            (stars "rows 12,13-4")
            (stars "rows 12,13-5")
            (split colH _ (clique H1 H2) (clique H10))
            (stars colH-2)
            (claim (is-elim E13)
              (by-contradiction
                (body
                )
                (via row14)
              )
            )
            (claim (is-elim F11)
              (by-contradiction
                (body
                  (stars "rows 12,13-3")
                  (stars row14)
                )
                (via region10)
              )
            )
            (stars region11)
            (elims row8)
            (split row9 _ (clique A9 B9) (clique D9) (clique K9 L9))
            (stars row9-2)
            (split row7 _ (clique A7 B7) (clique C7 D7) (clique K7 L7))
            (elims (- (clique K6 L6 K7 L7) row7-3))
            (elims (- (clique A11 B11 A12 B12) row11))
            (stars row12)
            (split (+ colE colF) "columns E,F" (clique E1 F1 E2) (clique E4 E5) (clique E6) (clique F10) (clique E14 F14))
            (stars "columns E,F-3")
            (stars "columns E,F-4")
            (stars row7-2)
            (elims region10)
            (stars "rows 12,13-2")
            (stars "rows 12,13-1")
            (elims row10)
            (split region8 _ (clique I5 J5 I6 J6) (clique K7) (clique K9 L9))
            (elims (- region9 (- row9 region8-3)))
            (stars row11)
            (elims region13)
          )
          (via row14)
        )
      )
      (claim (is-elim B12)
        (by-contradiction
          (body
          )
          (via (- (+ row13 row14) (+ (clique F13 G13 F14 G14) (clique D13 E13 D14 E14))))
        )
      )
      (split (+ row11 row12) "rows 11,12" (clique A11 B11 A12) (clique F11 G11 F12 G12) (clique H11 I11 H12) (clique J11 J12))
      (elims (- (clique I11 J11 J12) "rows 11,12-4"))
      (elims (- (clique G11 H11 G12 H12) "rows 11,12-3"))
      (claim (is-star D9)
        (by-contradiction
          (body
            (stars region7-3)
            (elims (- (clique D5 E5 D6 E6) region7-2))
            (stars region7-1)
            (split (+ row9 row10) "rows 9,10" (clique A9 B9 A10 B10) (clique F9 G9 F10 G10) (clique H9 I9 H10 I10) (clique J9 K9 J10) (clique L9))
            (stars "rows 9,10-5")
            (elims (- (clique I9 J9 I10 J10) "rows 9,10-4"))
            (elims (- (clique G9 H9 G10 H10) "rows 9,10-3"))
            (define hyp (- (+ colD colE) (+ diff region7-2)))
            (split (+ row12 row13) "rows 12,13" (clique A12 A13 B13) (clique C13 D13) (clique F12 E13 F13) (clique G12 H12 G13) (clique J12))
            (stars "rows 12,13-5")
            (claim (is-elim F6)
              (by-contradiction
                (body
                  (stars region7-2)
                  (elims colD)
                  (stars diff)
                  (stars region4)
                  (elims row8)
                  (stars "rows 9,10-2")
                )
                (via (- region11 (clique H11 H12)))
              )
            )
            (stars "clm19_33_47_61_75!=0")
            (stars diff)
            (elims colD)
            (stars "rows 12,13-2")
            (elims (- colF (+ "rows 9,10-2" "rows 11,12-2")))
            (define hyp2 (- colG region4))
            (elims (- (+ row13 row14) (+ hyp2 hyp)))
            (stars "rows 12,13-1")
            (claim (is-star H11)
              (by-contradiction
                (body
                  (stars "rows 11,12-3")
                  (stars row11)
                )
                (via region10)
              )
            )
            (stars row12)
          )
          (via row13)
        )
      )
      (claim (is-elim F11)
        (by-contradiction
          (body
            (stars row12)
            (elims region11)
            (split (+ row13 row14) "rows 13,14" (clique C13 D13 D14) (clique E13 F13 E14 F14) (clique G14))
            (stars "rows 13,14-3")
            (elims (- (clique D13 E13 D14 E14) "rows 13,14-2"))
            (stars "rows 13,14-1")
            (elims region13)
            (stars (- region10 (clique F7 F8)))
            (elims (- (clique F7 G7 F8 G8) region10))
            (split region9 _ (clique B7 C7 B8) (clique A9 B9 A10))
            (split (- (+ row9 row10) region9-2) "rows 9,10" (clique J9 K9 J10) (clique L9))
            (stars "rows 9,10-2")
            (split region4 _ (clique F2) (clique F3 F4 G4) (clique F5 G5 F6 G6))
            (stars region4-1)
            (elims (- (clique F4 G4 F5 G5) region4-2))
            (elims (- colD diff))
            (stars (- region7 (clique E5 E6)))
            (stars region7)
            (stars region4)
            (stars region10)
            (stars diff)
            (claim (is-elim J10)
              (by-contradiction
                (body
                  (elims (- (clique A8 B8 A9 B9) row9))
                  (stars row8)
                  (elims colJ)
                )
                (via (- region2 (clique H1 I1)))
              )
            )
            (stars row10)
            (stars row9)
            (elims (- (clique A7 B7 A8 B8) row8))
            (split row7 _ (clique C7) (clique I7 J7) (clique K7 L7))
            (stars row7-1)
            (stars row8)
            (elims colA)
          )
          (via (- region6 colC))
        )
      )
      (stars "rows 11,12-2")
      (claim (is-elim C13)
        (by-contradiction
          (body
            (elims (- region13 row14))
            (stars row13)
            (stars row12)
            (split (+ colB colC) "columns B,C" (clique B1 C1 B2 C2) (clique B3 C3 B4 C4) (clique B5 C5 B6 C6) (clique B7 C7 B8) (clique B9))
            (stars "columns B,C-5")
            (stars row11)
            (elims region9)
          )
          (via "columns B,C-4")
        )
      )
      (stars (- (+ row12 row13) (clique A12 A13 B13)))
      (elims colD)
      (stars (- region7 (clique E5 E6)))
      (stars region7)
      (stars diff)
    )
    (via "clm19_33_47_61_75!=0")
  )
)

(elims (- row14 region14))

(split region14 _ (clique I14 J14) (clique K14 L14) (clique M14 N14))

(elims (- (clique M13 M14 N14) region14-3))

(stars region12-3)

(elims (- (clique N9 M10 N10) region12-2))

(stars region12-1)

(claim (is-elim C10)
  (by-contradiction
    (body
    )
    (via (- region13 (+ (clique C12 C13) (clique I12 H13))))
  )
)

(split (- "region count" "column count") amalg (clique D2 E2 D3) (clique D11) (clique I12 H13))

(stars amalg-2)

(elims (- (clique H12 I12 H13) amalg-3))

(elims (- (clique D2 E2 D3 E3) amalg-1))

(claim (!= (count D13 E13) 0)
  (by-contradiction
    (body
      (elims "asm171_172=0")
      (split colE _ (clique E1 E2) (clique E4 E5) (clique E6))
      (stars colE-3)
      (stars colE-2)
    )
    (via (- (+ colD colE) (+ region7 (clique D1 E1 D2 E2))))
  )
)

(replace "clm171_172!=0" (combine (clique D13 E13) (combine "clm171_172!=0" (bound >= 0 D13 E13))))

(elims (- (+ colD colE) (+ amalg-1 (+ region7 "clm171_172!=0"))))

(claim (is-elim B6)
  (by-contradiction
    (body
      (split colC _ (clique C1 C2) (clique C3 C4) (clique C13))
      (stars colC-3)
      (elims (- (clique B1 C1 B2 C2) colC-1))
      (elims (- (clique C1 C2 D2) colC-1))
      (elims (- (clique B3 C3 B4 C4) colC-2))
      (elims (- (clique C3 D3 C4) colC-2))
      (split region1 _ (clique A1 A2) colC-1 (clique E2))
      (split region9 _ (clique B8 A9 B9) (clique A10 A11) (clique A12 A13))
      (elims (- colA (+ region1-1 (+ region9-2 region9-3))))
    )
    (via (- region6 colC-2))
  )
)

(claim (is-elim D5)
  (by-contradiction
    (body
    )
    (via colE)
  )
)

(elims (- (clique E4 F4 E5 F5) region7-1))

(claim (!= (count D6 E6) 0)
  (by-contradiction
    (body
      (elims "asm73_74=0")
      (stars region7-2)
      (stars region7-3)
      (elims colD)
      (stars amalg-1)
      (split region4 _ (clique G4) (clique G5 F6 G6) (clique G7 G8))
      (stars region4-1)
      (elims (- (clique F6 G6 F7 G7) region4-2))
      (stars region4-3)
      (stars (- colE region7-1))
    )
    (via (- colF (clique F10 F11)))
  )
)

(replace "clm73_74!=0" (combine (clique D6 E6) (combine "clm73_74!=0" (bound >= 0 D6 E6))))

(elims (- (clique E5 D6 E6) "clm73_74!=0"))

(stars region7-1)

(elims (- (clique D6 E6 D7) "clm73_74!=0"))

(claim (is-elim F7)
  (by-contradiction
    (body
    )
    (via (- region4 (clique G4 G5)))
  )
)

(claim (is-elim F8)
  (by-contradiction
    (body
      (split region4 _ (clique F2) (clique G4) (clique G5 F6 G6))
      (stars region4-1)
      (stars region4-2)
      (stars amalg-1)
      (elims (- colD region7-3))
      (stars region7-2)
      (stars "clm171_172!=0")
      (stars region4-3)
      (elims (- (clique F10 G10 F11 G11) colF))
      (elims (- region10 colG))
      (stars colF)
      (stars colG)
      (stars amalg-3)
    )
    (via (- colH (+ (clique H1 H2) (clique H8 H9))))
  )
)

(claim (is-elim K10)
  (by-contradiction
    (body
      (split region8 _ (clique I5 J5 I6 J6) (clique K6 K7) (clique K8))
      (stars region8-3)
      (stars region8-2)
      (elims colK)
      (stars region14-2)
      (stars region14-3)
      (split colL _ (clique L1 L2) (clique L3 L4))
      (elims (- (clique L1 M1 L2 M2) colL-1))
      (elims (- (clique L3 M3 L4 M4) colL-2))
      (split colM _ (clique M5 M6) (clique M10))
      (stars colM-2)
      (split region3 _ colN colL-1 (clique M6))
      (stars region3-3)
      (split region5 _ (clique H2 I2 I3) (clique I4 J4) colL-2)
      (elims (- (clique I4 J4 I5) region5-2))
      (stars region8-1)
      (elims row6)
    )
    (via region7-2)
  )
)

(claim (!= (count F12 G12 F13 G13) 0)
  (by-contradiction
    (body
      (elims "asm159_160_173_174=0")
      (stars (- region10 (+ "clm171_172!=0" (clique G10 H10))))
      (stars (- region10 "clm171_172!=0"))
      (split (+ row12 row13) "rows 12,13" (clique A12 B12 A13 B13) (clique C13) "clm171_172!=0" amalg-3 (clique J12 K12))
      (elims (- (clique J11 K11 J12 K12) "rows 12,13-5"))
    )
    (via (- row11 (clique A11 B11)))
  )
)

(replace "clm159_160_173_174!=0" (combine (clique F12 G12 F13 G13) (combine "clm159_160_173_174!=0" (bound >= 0 F12 G12 F13 G13))))

(define "region 10-3" (- region10 (+ "clm171_172!=0" "clm159_160_173_174!=0")))

(claim (is-elim G11)
  (by-contradiction
    (body
    )
    (via "region 10-3")
  )
)

(split (+ row11 row12) "rows 11,12" (clique A11 B11 A12 B12) (clique F11 F12 G12) (clique H11 I11 I12) (clique J11 K11 J12 K12))

(claim (is-elim D13)
  (by-contradiction
    (body
      (stars colE)
      (split colF _ (clique F9) (clique F10 F11) (clique F12 F13))
      (stars colF-1)
    )
    (via (- region4 (+ (clique G4 G5) (clique G6 G7))))
  )
)

(stars "clm171_172!=0")

(elims (- (clique G12 G13 H13) "clm159_160_173_174!=0"))

(stars amalg-3)

(claim (is-elim L10)
  (by-contradiction
    (body
      (stars (- row11 (clique A11 B11)))
      (stars region10)
      (stars region12)
      (elims row10)
      (elims (- (clique A11 B11 A12 B12) row11))
      (stars row12)
      (elims region11)
      (stars (- row9 (clique A9 B9)))
      (split region9 _ (- (+ row11 row13) region13) (clique A9 B9) (clique B7 C7 B8))
      (elims (- (clique A8 B8 A9 B9) region9-2))
      (stars row8)
      (split row7 _ (clique A7) region9-3 (clique I7 J7))
      (stars row7-1)
      (stars row7-2)
      (stars "clm73_74!=0")
    )
    (via (- colF (clique F1 F2)))
  )
)

(claim (is-star H10)
  (by-contradiction
    (body
      (elims (- (clique F9 F10 G10) "region 10-3"))
      (elims (- (clique F10 G10 F11) "region 10-3"))
      (stars (- colF (clique F1 F2)))
      (stars colE)
    )
    (via colF)
  )
)

(elims "region 10-3")

(claim (is-elim E2)
  (by-contradiction
    (body
      (stars (- colF (clique F10 F11)))
    )
    (via region4)
  )
)

(stars amalg-1)

(stars colE)

(stars (- colF (clique F1 F2)))

(stars region10)

(split colC _ (clique C4 C5) (clique C6 C7) (clique C13))

(stars colC-3)

(elims region13)

(elims row13)

(elims (- (clique B4 C4 B5 C5) colC-1))

(elims (- (clique C6 B7 C7) colC-2))

(claim (is-star J10)
  (by-contradiction
    (body
      (stars (- row10 region12))
      (stars (- colB (clique B1 B2)))
      (stars colC-1)
    )
    (via colC-2)
  )
)

(stars "rows 11,12-4")

(elims row12)

(elims (- row10 region12-2))

(split region9 _ row11 (clique A9 B9) (clique B7 C7 B8))

(elims (- (clique A8 B8 A9 B9) region9-2))

(elims (- (clique C6 B7 C7) region9-3))

(elims region11)

(elims (- (+ colF colG) region4))

(split colG _ (clique G4 G5) (clique G6 G7))

(stars colF)

(elims (- (clique G4 H4 G5 H5) colG-1))

(elims (- (clique G6 H6 G7 H7) colG-2))

(stars (- colH (clique H2 H3)))

(stars colH)

(stars colG-1)

(stars colG-2)

(stars (- colC (clique C4 C5)))

(stars region7)

(stars region9-1)

(elims (- colA (- region6 colC)))

(stars region9)

(elims row9)

(stars (- region1 (clique B2 B3)))

(stars region1)

(stars colC)

(stars (- colA (clique A6 A7)))

(stars colA)

(stars (- row8 (clique K8 L8)))

(elims row5)

(stars colI)

(stars region8)

(elims region2)

(stars colJ)

(elims row6)

(claim (is-elim M3)
  (by-contradiction
    (body
    )
    (via row4)
  )
)

(claim (is-elim L3)
  (by-contradiction
    (body
    )
    (via region5)
  )
)

(stars row3)

(stars region5)

(stars colL)

(stars region14)

(stars colM)
