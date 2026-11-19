# Trouble Brewing, 13 players: the Spy outs the Grimoire

Working notes. `*.zola-ignore.md`, so this does not publish.

## The table

Seating order as given, numbered, with the character the Spy named for each seat.
Seat 13 is adjacent to seat 1; every Chef and Empath inference below depends on
that, so if the order wraps differently the adjacency results change.

| Seat | Spy named it | Also known |
|---:|---|---|
| 1 | Recluse | |
| 2 | Soldier | |
| 3 | Virgin | |
| 4 | Empath | claimed Empath, night-1 result **1** |
| 5 | Librarian | claimed Librarian, result **0 Outsiders**; one of the Washerwoman's two |
| 6 | Monk | **you — and the Spy named it correctly** |
| 7 | Chef | claimed Chef, result **1** |
| 8 | Washerwoman | claimed Washerwoman; learned *Librarian* among {seat 5, seat 6} |
| 9 | Slayer | |
| 10 | Mayor | |
| 11 | Ravenkeeper | |
| 12 | Undertaker | |
| 13 | Spy | outed itself, then announced the above as the Grimoire |

Day 1, nobody dead — the Imp does not kill on the first night in Trouble Brewing
— so all four information claims are night-1 claims, and your own ability has not
yet been used.

## 1. The illegal count is the tell, not the refutation

A 13-player game is **9 Townsfolk / 0 Outsiders / 3 Minions / 1 Demon**, or
**7 / 2 / 3 / 1** with the Baron. The announced Grimoire is 11 Townsfolk, 1
Outsider, 1 Minion, 0 Demons. Every number is wrong.

My first read was that this refutes the speech. It does something more useful
than that. Take the hypothesis that the Spy — which really did see the Grimoire —
named **every good player truthfully**, and for the three evil seats substituted
the character that player intends to claim. Call that **H**. Then in a no-Baron
world, seats 1–12 hold 9 Townsfolk and 3 evils, and the list over those seats
should read:

> 9 true Townsfolk names + 3 evil claims = 11 Townsfolk names + 1 Recluse name

which is **exactly what was announced.** The count isn't a blunder; it is the
arithmetic signature of a mostly-true list with three substitutions, one of which
chose Recluse.

And you are the corroboration. The Spy named seat 6 Monk and seat 6 is the Monk.
That is one verified true entry from inside the list, which is one more than a
pure fabrication should produce.

This is also the mechanism that makes the play work. Every good player who checks
their own entry finds it correct, concludes the list is reliable, and carries the
three lies along with it.

## 2. The Librarian's zero forces the entire evil team

If seat 5's **0 Outsiders** is true:

- No Baron — it would put two Outsiders in play. So the distribution is 9/0/3/1.
- Three Minions from a four-Minion pool with the Baron excluded leaves no choice:
  the evil team is exactly **Imp, Spy, Poisoner, Scarlet Woman**.
- **No Drunk.** The Drunk is an Outsider. Every good player is a real Townsfolk
  who knows their own character, and the Poisoner is the *only* source of false
  information in the game — one target per night. So **at most one of the four
  night-1 claims is innocently false.** Any second false claim came from an evil
  mouth.
- **No Recluse**, so no evil ping anywhere on this board has a misregistration
  excuse, and seat 1's "Recluse" is a substituted claim.
- **The Scarlet Woman is in play**, which matters enormously in §7.

## 3. You are the hinge, and seat 3 is evil

The Washerwoman learned that one of {seat 5, seat 6} is the **Librarian**. You are
seat 6 and you are the Monk. So a sober, honest Washerwoman is pointing at seat 5
— and at a *real* Librarian, not a Drunk who believes itself one, because the
Washerwoman learns a Townsfolk and the Drunk is an Outsider that registers as the
Drunk. **Her ping rules out "seat 5 is the Drunk" outright.**

Chain: Washerwoman honest and sober ⟹ seat 5 is the Librarian ⟹ its zero is true
unless seat 5 was the Poisoner's night-1 target ⟹ §2.

The Empath closes it. Seat 4's neighbours are 3 and 5. With no Recluse in play,
registering evil means *being* evil, and the Spy sits at 13, nowhere near. A
result of 1 with seat 5 good gives:

> **Seat 3 — the Spy's "Virgin" — is evil.**

That conclusion is only as good as seat 4, though, and seat 4 is attackable: an
evil or poisoned Empath frees seat 3 entirely, and §4.1 shows why evil would want
to. Seat 3 is evil *given* an honest sober Empath, which is a real condition and
not a small one — roughly a one-in-five to one-in-four chance of failing, against
seat 1's one-in-twenty-five.

## 4. What H buys: the board is nearly solved

Take H and the no-Baron world together. Seats 1–12 hold 9 real Townsfolk named
correctly, plus three evils holding two Townsfolk names and one Recluse name.

- **Seat 1 is evil.** No Recluse exists, so the Recluse name sits on an evil seat.
  Note what this does *not* depend on: no good player's testimony, only H and the
  zero. It is the most robust evil read available.
- Two more evils among {2, 3, 4, 5, 7, 8, 9, 10, 11, 12}. Not seat 6.

H constrains the *counts*, not which seats are good, so the information seats are
not exempt — any of 4, 5, 7, 8 can be one of those two. §4.1 handles that. Take
for now the clean sub-branch where all four claimants are good and unpoisoned,
which is an assumption on top of H and needs saying out loud.

Then seat 3 is evil from §3, and one more evil *z* sits in {2, 9, 10, 11, 12}.
The Chef's **1** pins *z* down. One wrinkle: the Spy registers as good, so the
Storyteller may or may not have counted seat 13.

- **Spy counted as evil.** Seats 13 and 1 are adjacent, so that pair is free and
  is the whole quota. Then *z* must touch nothing: *z* = 2 pairs with both 1 and
  3, *z* = 12 pairs with 13. Both excluded. **z ∈ {9, 10, 11}**, each isolated
  between good neighbours.
- **Spy counted as good.** The evil-registering set is {1, 3, z}. Only *z* = 2
  creates adjacency, and it creates two pairs. Every other *z* gives zero. **No
  world survives.**

So the Chef's number tells us the Storyteller counted the Spy, and:

> **Evil is seat 13 (Spy), seat 1, seat 3, and one of seats 9 / 10 / 11.**

Three worlds by seat, times which of seats 1, 3, *z* is the Imp, the Poisoner and
the Scarlet Woman.

Side effects, all of them conditional on this sub-branch. The 9 real Townsfolk
are the 11 named minus seats 3 and *z*, so the Virgin is not in play and exactly
one of Slayer / Mayor / Ravenkeeper is not in play. And since the list omits only
Investigator and Fortune Teller, H predicts neither of those is in play either —
that one holds across every sub-branch, because it follows from the counts alone.

Which makes one question the most valuable thing you can do today: **ask every
seat whether the Spy got them right.** H survives only if nobody good was
mislabelled. A single honest "no — I'm actually the Fortune Teller" breaks it.

## 4.1 The information seats can be evil, and the Chef is the best place for it

Rank the four claims by how expensive they are to fake.

**Chef — cheapest by a wide margin.** One number, announced once, and nothing in
the game can ever cross-check it. Faking it also releases the entire adjacency
constraint, which is the only thing narrowing *z*. If seat 7 is evil, the Empath
and Washerwoman still force seat 3, so the evil team is exactly
**{13, 1, 3, 7}** — one world, and in it all of seats 9, 10, 11 are good. That is
the single cleanest alternative to §4 and it costs evil nothing but a seat.

**Empath — second, and it sets a trap.** Its numbers have to stay consistent with
deaths every night, so it is more work than the Chef. But a fabricated 1 frees
seat 3, and under H a good seat 3 **is the real Virgin.** So the town's natural
way to test seat 3 — nominate it and see whether anyone dies — executes the
Townsfolk who nominates. An evil Empath that invents a 1 pointing at the Virgin
is framing a good player with a test that punishes the tester. Worlds:
{13,1,4,z} with z ∈ {9,10,11} if the Chef counted the Spy, or z ∈ {2,3} if not.

**Librarian and Washerwoman — expensive, and coupled.** An evil seat 5 needs the
Washerwoman wrong too, because her ping identifies seat 5 as a real Librarian. So
it needs either seat 8 poisoned, or seat 8 evil as well — which spends two of
evil's three hidden seats on manufacturing one fake Librarian: world
**{13, 1, 5, 8}**, with seat 3 then good and the real Virgin in play. It exists,
but it is the most costly lie on the board.

The worlds, under H and no Baron, with at most one good claimant poisoned:

| Evil seats besides 13 | Faked | What it changes |
|---|---|---|
| 1, 3, and one of 9/10/11 | nothing | §4. One of Slayer/Mayor/Ravenkeeper is fake |
| 1, 3, 7 | Chef | 9, 10, 11 all good. Adjacency constraint gone |
| 1, 3, 8 | Washerwoman | seat 5 is still the Librarian — no Drunk exists without the Baron |
| 1, 4, and one of 9/10/11 | Empath | **seat 3 good → real Virgin → nomination trap** |
| 1, 4, 2 or 1, 4, 3 | Empath | Chef did not count the Spy |
| 1, 4, 7 | Empath and Chef | 3, 9, 10, 11 all good. Both numbers free. Real Virgin |
| 1, 5, 8 | Librarian and Washerwoman | two hidden seats spent on one fake. Real Virgin |

Seat 1 is in every row. That is the point of §4's first bullet: it survives every
attack on the information claims, because it does not rest on them.

## 5. Without H, loosely

If the Spy's list is not trustworthy about good players, you lose seat 1 and keep
everything in §2 and §3. Then evil is seat 13, seat 3, and two of
{1, 2, 9, 10, 11, 12}. The Chef's 1 admits these pairs:

- Counting the Spy: {1,9} {1,10} {1,11} {2,9} {2,10} {2,11} {9,10} {9,12} {10,11} {10,12}
- Not counting it: {2,9} {2,10} {2,11} {2,12} {9,10} {10,11} {11,12}

Twelve distinct worlds, and the per-seat frequencies are nearly flat — seat 10 at
5/12, seat 1 at 3/12, everything else 4/12. The Chef's 1 is a weak constraint on a
13-seat circle once the Spy's registration is free. H is where all the resolving
power is, which is why §4's poll is worth more than any further reasoning from
what we already have.

## 6. Your branch: the Poisoner blindly hit the Librarian

Live, and it is the single biggest alternative, because it is the only thing that
reopens the Baron — and with it two Outsiders, a real Recluse at seat 1, and a
Drunk somewhere among seats 2, 3, 9, 10, 11, 12 who is a *second* broken
information source. Note the count fits this world too: 7 true Townsfolk names +
the Drunk named as the Townsfolk it believes it is + a true Recluse + three evil
claims = 11 Townsfolk and 1 Recluse again. The arithmetic does not discriminate.

It also recasts §4 entirely. The Spy would then have named a **true** Recluse,
and done it knowing the town would reject it, which burns the Recluse's only
defence: when seat 1 later claims Recluse to explain an evil ping, the town
answers "that is exactly what the Spy told us to say." A truthful line weaponised
by being spoken from a discredited mouth. If that is what happened, the town
lynches a good player and it was set up on day 1.

The reason I still think it is a small branch — rough, with the priors named,
since this is exactly the calculation the code should do properly:

Given the Spy is confirmed, the other two Minions are two of {Poisoner, Baron,
Scarlet Woman}, so three equally likely Minion sets. Evidence is "a real
Librarian publicly reported 0."

| Minion set | Outsiders | P(report of 0) | Why |
|---|---:|---:|---|
| Spy, Poisoner, Scarlet Woman | 0 | ≈ 0.95 | the truth; a sober Librarian says 0 |
| Spy, Poisoner, Baron | 2 | ≈ 0.03 | needs the ~1/12 blind hit **and** the Storyteller to choose "0" as the lie |
| Spy, Baron, Scarlet Woman | 2 | ≈ 0 | no Poisoner at all, and the Washerwoman has ruled out a Drunk Librarian |

Posterior, flat prior over the three: **no Baron ≈ 96%, your branch ≈ 3–4%.**

Two things drive that. One, your branch needs a specific one-in-twelve blind hit
while the alternative needs nothing. Two, the Washerwoman's ping kills the third
row outright, and that row is where a Baron world would otherwise live
comfortably.

Which identifies exactly where to apply pressure: **the Washerwoman is
load-bearing.** If seat 8 is lying or was the poison target, a Drunk Librarian
reopens and the Baron world jumps by an order of magnitude. Worth noting in her
favour that she approached you and seat 5 privately, before the Spy spoke, which
is not how a Minion manufacturing a fake information claim usually behaves.

A clean diagnostic, from §2: poison can break exactly one claim. **If a second
inconsistency ever appears among good claims, it needs a Drunk, and a Drunk needs
the Baron — which is your branch.** So far there are zero: Empath 1, Librarian 0,
Chef 1 and the Washerwoman's ping are all mutually consistent, which mildly
favours nothing being broken at all.

## 7. Your play tonight, and the town's today

**A living Spy reads the Grimoire every night, so it sees your protection and
tells the Imp.** Be precise about what that costs you: protection still *works* —
the player you choose cannot be killed. What you lose is the upside. You will
never catch the Imp against a shield, a deathless night will never be evidence of
anything, and you cannot bluff. You are a pure shield with no information value
while seat 13 lives.

You also cannot protect anyone from the Poisoner. The Librarian cannot be shielded
from being discredited, only from being killed — and its zero is already public,
so killing it no longer retracts anything.

That points the protection at renewable information, not at spent information:

- **Execution today → protect seat 12, the Undertaker.** The Imp acts before the
  Undertaker in the night order, so killing seat 12 tonight denies the reading
  entirely, and that reading is the most valuable thing coming. Seat 12 also
  appears in none of §4.1's rows, so it is good in every clean world — you are
  not risking the night on a seat that turns out to be evil.
- **No execution today → protect seat 4, the Empath**, with eyes open. It is the
  only renewable evidence on the board, which is exactly why the Imp wants it;
  but §4.1 puts real weight on seat 4 being evil, and protecting an evil seat
  wastes the night outright. Seat 5 is the best-confirmed good player and the
  safest pick, but its information is already public and killing it retracts
  nothing, so the Imp has no reason to go there and the protection is idle.

Never seat 2 under H — a real Soldier cannot be killed by the Demon anyway.

**Claim Monk publicly.** The cost is that confirming your own entry lends the
Spy's list credibility, which is real but small. The gain is that you are the only
player who can resolve the Washerwoman's ping, and doing so is what makes seat 5
credible, which is what denies evil the Recluse excuse for the rest of the game.
Evil already knows you are the Monk — the Spy saw it and said so out loud.

**On the execution, the Scarlet Woman changes the goal.** With 13 alive, if the
Imp dies the Scarlet Woman becomes the Demon. So today's execution cannot win the
game and should not be chosen as though it might. Aim it at information and
attrition:

- **Seat 1 is the best target.** It is evil in every row of §4.1, because its read
  rests on H and the Librarian's zero rather than on any information claim — so
  every way evil can attack the Empath, the Chef or the Washerwoman leaves it
  standing. It fails only in §6's Baron branch, where it is the real Recluse, and
  executing it also publicly destroys the Recluse excuse. The Undertaker then
  reads it tonight and names which evil you got.
- Seat 3 is second, and worse than I first had it. It is evil only given an
  honest sober Empath, and §4.1 is a catalogue of reasons evil would arrange
  otherwise — including the case where seat 3 is the real Virgin and nominating
  it kills the Townsfolk who does.
- **Seat 13 is worse than it looks.** It is a certain evil and killing it ends the
  nightly leak, but the Spy may register to the Undertaker as a Townsfolk or an
  Outsider, so the town's one certain evil comes back as a good character and the
  day is spent arguing about the Undertaker. It will still be there tomorrow.

## 8. For the enumerator

- An assignment of 13 characters to seats from Trouble Brewing, satisfying
  9/0/3/1 or 7/2/3/1, with the Spy pinned to seat 13 and the Monk to seat 6.
- Which Townsfolk the Drunk believes itself to be, when a Drunk exists.
- The Poisoner's target each night, with a blind uniform prior on night 1.
- Per claim: speaker honest, poisoned, or lying.
- Storyteller choices — Spy registration per ability, Recluse registration per
  ability, and the Librarian / Washerwoman / Investigator pair selections.
- A weight on H, or better, a per-seat parameter for "the Spy named this seat
  truthfully," since §4 shows the whole result hinges on it.

Output wanted is per-seat evil probability, plus P(Imp | seat), since those differ
and only the second one matters for the endgame.

## 9. Open

- **Does every seat confirm its own entry?** The §4 poll. Highest-value question
  available, and it either solves the board or breaks H.
- **Has anyone claimed Investigator or Fortune Teller?** H says neither is in
  play. A real claim to either falsifies it.
- **Order of claims.** Did the Librarian's zero precede the Spy's speech? Before
  means the Spy chose to contradict a true Librarian head-on; after means the
  Librarian caught it.
- **Which of seats 9, 10, 11 is lying** — but only in §4's clean sub-branch. If
  the Chef or the Empath is evil, all three can be real, and that is the main
  thing distinguishing those worlds from the outside.
- **Do not nominate seat 3 to test it.** If the Empath is evil, seat 3 is the real
  Virgin under H, and the nominator dies. The test punishes whoever runs it, and
  with no Outsiders in play every good nominator is a Townsfolk.
- Per-character optimal play for every seat and every world is the next pass;
  only yours is written.
