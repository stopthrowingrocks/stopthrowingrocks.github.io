+++
title = "Cataloguing equivalence relations over lattices"
date = 2026-02-26

[extra]
subtitle = "MATH. Published 2026-02-26."
tab_title = "Equivalence Relations"
katex = true
+++

## Problem Statement

If one has a lattice $\mathcal{L}$ with origin point $\mathbf{0}$, we are interested in reversible linear transformations $T:\mathcal{L}\to\mathcal{L}$ such that $T(\mathbf{0})=\mathbf{0}$ and $T(\mathbf{u}+\mathbf{v})=T(\mathbf{u})+T(\mathbf{v})$, where $+$ is defined relative to $\mathbf{0}$. Given a lattice $\mathcal{L}$, let $\mathcal{T}\_{\mathcal{L}}$ represent the set of all such transformations over $\mathcal{L}$, which forms a group over $\mathcal{L}$.

Suppose that we have a group of transformations $\mathcal{T}=\lbrace\ldots T\rbrace\subseteq\mathcal{T}\_{\mathcal{L}}$. Define an equivalence relation $\sim\_{\mathcal{T}}$ such that $\mathbf{u}\sim\_{\mathcal{T}} \mathbf{v}$ iff there is an element $T\in\mathcal{T}$ such that $T\mathbf{u} = \mathbf{v}$. We want to study these equivalence relations and probe them for structure across sets of transformations $\mathcal{T}$ and across dimensions.

## Analysis

Luckily, it turns out that for every $n$-dimensional lattice $\mathcal{L}$, there exists a non-singular transformation matrix $Z$ such that $Z\mathcal{L}=\mathbb{Z}^n$. Thus, given a transformation $T\_{\mathcal{L}}:\mathcal{L}\to\mathcal{L}$, we can uniquely produce the translation $T_n:\mathbb{Z}^n\to\mathbb{Z}^n$, defined by $T_n=ZT\_{\mathcal{L}} Z^{-1}$. We can also go the other way by setting $T\_{\mathcal{L}}=Z^{-1}T_nZ$. The equivalence relation is preserved by this mapping, and so it suffices to study this topic by only considering the lattices $\mathbb{Z}^n$.

At this point, notice that if we want to study a transformation $T_n$, we can just watch what happens to the unit vectors. Each unit vector will get mapped to another point on the lattice, which will itself be an integral sum of unit vectors. Because each of these vectors is a column of the transformation matrix, all such $T_n$ must be integral matrices. Because they are integral matrices, they all must have integral determinants. However, because the transformation matrices form a group, that means the inverse of any $T_n$ must also be an integral matrix with integral determinant. This forces all transformation matrices to not only have all integral components, but also have a determinant of only $1$ or $-1$.

### GCD Vector Reduction Lemma: All relatively prime vectors can be mapped to a unit vector

I claim that for any relatively prime $n$-vector $\mathbf{p}\in\mathbb{Z}^n$ (where $\gcd(\mathbf{p})=1$), there exists an $n\times n$ unit matrix $P\in \mathbb{Z}^{n\times n}$ where $\det P = \pm1$ such that $\mathbf{p}=P\mathbf{e}$ for some unit vector $\mathbf{e}$. This is equivalent to the statement that for all $n\geq 1$, given vector $\mathbf{u}$ there exists an integral $n\times (n-1)$ matrix $U\in\mathbb{Z}^{n\times n}$ such that $\det\begin{bmatrix}\mathbf{u} & U\end{bmatrix}=\pm\gcd(\mathbf{u})$. We are going to prove this by induction in $n$. In the 1D case, $U$ is empty and so the determinant is just $u_1$ which is the gcd, multiplied by the sign of $u_1$.

In the inductive case, we assume that for any $n$-vector $\mathbf{u}$, there exists a $n\times(n-1)$ matrix $U$ such that $\det\begin{bmatrix}\mathbf{u} & U\end{bmatrix}=\pm_n\gcd(\mathbf{u})$. Here, $n\geq 1$. We want to show that given $(n+1)$-vector $\mathbf{v}$, there exists a $(n+1)\times n$ matrix $V$ such that $\det\begin{bmatrix}\mathbf{v} & V\end{bmatrix}=\gcd(\mathbf{v})$. Let the first $n$ components of $\mathbf{v}$ be called $\mathbf{u}$, and define $g,\mathbf{p}$ such that $g=\gcd(\mathbf{u})$ and $g\mathbf{p}=\mathbf{u}$. Let the $(n+1)$ component of $\mathbf{v}$ be called $v$. Note that because $\mathbf{p}$ is a relatively prime $n$-vector, there exists a matrix $U$ such that $\det\begin{bmatrix}\mathbf{p} & U\end{bmatrix}=1$. Note that $\det\begin{bmatrix}U & \mathbf{p}\end{bmatrix} = (-1)^{n+1}$. We will construct $V$ like so:

$$V = \begin{bmatrix} U & a\mathbf{p}\\\\ 0 & b \end{bmatrix}$$

$V$ is a $(n+1)\times n$ matrix, $U$ is a $n\times(n-1)$ matrix, $a\mathbf{p}$ is a $n\times 1$ column vector, $0$ is a $1\times (n-1)$ row vector of zeroes, and $b$ is a $1\times 1$ scalar.

We can calculate $\det\begin{bmatrix}\mathbf{v} & V\end{bmatrix}$ as:

$$\det\begin{bmatrix}\mathbf{v} & V\end{bmatrix}=\det\begin{bmatrix} g\mathbf{p} & U & a\mathbf{p}\\\\ v & 0 & b \end{bmatrix}=b\det\begin{bmatrix}g\mathbf{p} & U\end{bmatrix} - v\det\begin{bmatrix}a\mathbf{p} & U\end{bmatrix} = \pm_{n}(gb - va)$$

(The minus sign in front of $v$ intuitively makes sense because if $b=v$ and $a=g$ then the first and last columns are identical, meaning the columns are no longer linearly independent, meaning the determinant is zero. I know it looks weird but if it could be positive then the determinant could be non-zero in the case of linear dependence.)

By Bezout's identity, there exists $a,b\in\mathbb{Z}$ such that $\pm_{n}(gb - va)=\gcd(g,v)=\gcd(\mathbf{v})$, which completes the induction. This means that for relatively prime $\mathbf{p}$, there always exists an integral matrix such that $\mathbf{p}=\pm P\mathbf{e}$ and $\det P=\pm1$. As we see from the above argument, the only case where we need a negative in the $\pm$ is if $n=1$ and $p_1=-1$, so $P$ must be $-1$ as well.

Connecting this with our other discussion, for every relatively prime vector $\mathbf{p}$ there exists a matrix $P$ such that $\mathbf{p}\sim_P \mathbf{e}$. This means that if we combine every such $P$ into a set $\mathcal{P}$, if $\mathbf{p}$ and $\mathbf{q}$ are both relatively prime, then $\mathbf{p}\sim\_{\mathcal{P}} \mathbf{q}$. This means that for general $\mathbf{u}$ and $\mathbf{v}$, $\gcd(\mathbf{u})=\gcd(\mathbf{v}) \implies \mathbf{u}\sim\_{\mathcal{P}} \mathbf{v}$.

### Scaling Lemma: Scaled vectors must fail the equivalence relation

Next, I would like to prove that for any equivalence relation $\sim$, given any relatively prime vector $\mathbf{p}$, $a\mathbf{p}\sim b\mathbf{p} \implies a=\pm b$ for all $a,b\in\mathbb{Z}\setminus\lbrace 0\rbrace$. By assumption, there exists a transformation $T$ such that $b\mathbf{p}=Ta\mathbf{p}$, or $\frac{b}{a}\mathbf{p}=T\mathbf{p}$. Because $\gcd(\mathbf{p})=1$, if $\frac{b}{a}$ is not an integer then $\frac{b}{a}\mathbf{p}\not\in\mathbb{Z}^n$, which would mean $T$ is not a valid transformation. So we can conclude that $\frac{b}{a}\in\mathbb{Z}\setminus\lbrace 0\rbrace$. By symmetry of the above argument, $\frac{a}{b}\in\mathbb{Z}\setminus\lbrace 0\rbrace$ as well. This is only possible iff $a=\pm b$.

A consequence of this is that for all $\mathbf{u}$ and $\mathbf{v}$ and for all $\sim$, $\mathbf{u} \sim \mathbf{v}\implies \gcd(\mathbf{u})=\gcd(\mathbf{v})$. Combining with the above result, we get that there exists an equivalence relation $\sim\_{\top}$ such that $\mathbf{u} \sim\_{\top} \mathbf{v} \iff \gcd(\mathbf{u})=\gcd(\mathbf{v})$.

### Ordering equivalence relations

Suppose we have two equivalence relations, $\sim_a$ and $\sim_b$. Informally, $\sim_a$ is at least as fine as $\sim_b$ (in notation, $(\sim_a)\preceq (\sim_b)$) if every equivalence class of $\sim_b$ is the union of one or more equivalence classes in $\sim_a$. Formally,

$$(\sim_a) \preceq (\sim_b) \iff \forall \mathbf{u}, \mathbf{v}\in\mathcal{L}: \mathbf{u} \sim_a \mathbf{v} \implies \mathbf{u} \sim_b \mathbf{v}$$

We know that $\sim\_{\top}$ is the coarsest possible equivalence relation, which means that:

$$\forall (\sim): (\sim) \preceq (\sim\_{\top})$$

The finest possible equivalence relation can be constructed with $\mathcal{T}=\lbrace\rbrace$, leading to the relation: $\mathbf{u}\sim\_{\bot}\mathbf{v}\iff\mathbf{u}=\mathbf{v}$. Between these two extremes there is a lot of variety.

Given a "transformation basis" $\hat{\mathcal{T}} = \lbrace T_0,\ldots T_n\rbrace$, let $\hat{\mathcal{T}}^- = \lbrace T_0^{-1},\ldots T_n^{-1}\rbrace$, let $\hat{\mathcal{T}}^\pm = \hat{\mathcal{T}}\cup\hat{\mathcal{T}}^-$, let $\hat{\mathcal{T}}^?=\lbrace\epsilon\rbrace\cup \hat{\mathcal{T}}$, and let $\hat{\mathcal{T}}^*$ be the closure of $\hat{\mathcal{T}}^?$ under string concatenation. For a pair of bases $\hat{\mathcal{T}}_0$ and $\hat{\mathcal{T}}_1$, define $\hat{\mathcal{T}}_0\hat{\mathcal{T}}_1$ to be the concatenation of every element of $\hat{\mathcal{T}}_0$ with every element of $\hat{\mathcal{T}}_1$. Note that in string land, $T_iT_i^{-1}$ is not identical with $\epsilon$.

An easy way to construct a whole bunch of unique equivalence classes is by starting with a unit matrix $T$, constructing $\mathcal{T}=T^*$, and looking at the equivalence class of it. These classes still have structure within them, namely that $T^{n*}$ for $n\geq 2$ will always be finer than $T^*$.

Define the unit shear $n\times n$ matrices $S_{n:ij}=I+e_ie_j^T$. Then, define $\hat{\mathcal{S}}\_n=\lbrace S_{n:ij}\mid i\not=j\rbrace$, and $\mathcal{S}\_n = \hat{\mathcal{S}}\_n^{\pm*}$. In context $n$ is often clear and we can drop it.

For an $n$-dimensional lattice, $\sim\_{\top}$ can always be constructed using $\mathcal{S}\_n$, though I have not proved this yet. However, in $n$ dimensions this requires a total of $\frac{n(n-1)}{2}$ matrices, which scales rather quickly with $n$. This relation could be constructed more easily with a single unit shear matrix in the first dimension and then rotation matrices for every other dimension in and out of the first dimension, to get every other shear matrix and from there the rest of the group. This only requires $n$ transformation matrices.

One could consider variations on the shear matrices, which for example shear by non-unit amounts. This will create finer equivalence classes, but the exact dynamics of how that works in arbitrary dimensions still eludes me.

### 2D unit matrix decomposition lemma

Let $S_{21}=\begin{bmatrix}1 & 0\\\\1 & 1\end{bmatrix}$, $S_{12}=\begin{bmatrix}1 & 1\\\\0 & 1\end{bmatrix}$. I claim that any 2x2 unit matrix $M$ can be written as a product involving $S_{21},S_{21}^{-1},S_{12},S_{12}^{-1}$. Let $M=\begin{bmatrix}a & b\\\\c & d\end{bmatrix}$ such that $ad-bc=1$. This also implies that $\gcd(a,b)=\gcd(a,c)=\gcd(d,b)=\gcd(d,c)=1$. We see the following:

$$\begin{aligned}
MS_{21}&=\begin{bmatrix}a & b\\\\c & d\end{bmatrix}\begin{bmatrix}1 & 0\\\\1 & 1\end{bmatrix}=\begin{bmatrix}a+b & b\\\\c+d & d\end{bmatrix}\\\\
MS_{21}^{-1}&=\begin{bmatrix}a & b\\\\c & d\end{bmatrix}\begin{bmatrix}1 & 0\\\\-1 & 1\end{bmatrix}=\begin{bmatrix}a-b & b\\\\c-d & d\end{bmatrix}\\\\
MS_{12}&=\begin{bmatrix}a & b\\\\c & d\end{bmatrix}\begin{bmatrix}1 & 1\\\\0 & 1\end{bmatrix}=\begin{bmatrix}a & b+a\\\\c & d+c\end{bmatrix}\\\\
MS_{12}^{-1}&=\begin{bmatrix}a & b\\\\c & d\end{bmatrix}\begin{bmatrix}1 & -1\\\\0 & 1\end{bmatrix}=\begin{bmatrix}a & b-a\\\\c & d-c\end{bmatrix}
\end{aligned}$$

Notice that by multiplying $M$ by combinations of the above, we can always use the Euclidean algorithm over $a$ and $b$ to eventually get $a'=1,b'=0$ because $\gcd(a,b)=1$. At this point, because the determinant never changed, we also know that $d'=1$. So now we have $M'=\begin{bmatrix}1 & 0\\\\c' & 1\end{bmatrix}=S_{21}^{c'}$, and so $M'S_{21}^{-c'}=I$. Now, we have a chain from $M$ to $I$, and so we can simply reverse the process to write $M$ as a product of the above, which completes the proof. This also means that for any $\hat{\mathcal{T}}$, $\hat{\mathcal{T}}\subset \mathcal{S}\_2$ and in fact $\hat{\mathcal{T}}^*\subset \mathcal{S}\_2$. A further question is for what $\hat{\mathcal{T}}$ is $\hat{\mathcal{T}}^* = \mathcal{S}\_2$, which produces the coarsest relation.

(This procedure can be completed in higher dimensions as well, but I don't want to go into the details here.)

### 2D shear reduction lemma

First, I will prove that every element of $\pm\mathcal{S}\_2$ can be reduced to an element of $\pm\hat{\mathcal{S}}\_2^*\hat{\mathcal{S}}\_2^-$, $\pm\hat{\mathcal{S}}\_2^{-*}\hat{\mathcal{S}}\_2$, $\pm\hat{\mathcal{S}}\_2^*$, $\pm\hat{\mathcal{S}}\_2^{-*}$, or $\pm\hat{\mathcal{S}}\_2^{?3}$. I will do this by showing that every string product can either be reduced to one of the categories or can be reduced to a shorter string.

Let a normal term be either $S_{21}$ or $S_{12}$, and let an inverse term be either $S_{21}^{-1}$ or $S_{12}^{-1}$. If we have a string with 3 or fewer terms, or that is entirely composed of normal terms or entirely composed of inverse terms, it already falls into one of the listed categories. So let's assume we have a string with at least one normal term and at least one inverse term, that has at least 4 terms total.

Because there is at least one normal and one inverse term, there must be a rift in the string where there is a normal term adjacent to an inverse term. A left rift is either $S_{21}S_{12}^{-1}$ or $S_{12}S_{21}^{-1}$, and a right rift is either $S_{21}^{-1}S_{12}$ or $S_{12}^{-1}S_{21}$. One can see that any string is composed of alternating left and right rifts, followed by patches of only either normal or inverse terms. I will prove that a rift can be "moved" either left or right, and prove that two rifts will cancel out when they "collide", allowing for sign flips.

I first prove that a left rift can be moved right:

$$\begin{aligned}
\left(S_{21}S_{12}^{-1}\right)S_{12}^{-1} &= -S_{12}\left(S_{12}S_{21}^{-1}\right)\\\\
\left(S_{21}S_{12}^{-1}\right)S_{21}^{-1} &= S_{12}\left(S_{21}S_{12}^{-1}\right)\\\\
\left(S_{12}S_{21}^{-1}\right)S_{12}^{-1} &= S_{21}\left(S_{12}S_{21}^{-1}\right)\\\\
\left(S_{12}S_{21}^{-1}\right)S_{21}^{-1} &= -S_{21}\left(S_{21}S_{12}^{-1}\right)
\end{aligned}$$

By inverting all these statements, we show that a right rift can be moved left. What about when two rifts collide? Of course there are trivial situations like $S_{21}S_{12}^{-1}S_{12}=S_{21}$ where the string length decreases, but there are also a few nontrivial ways this can happen:

$$S_{21}S_{12}^{-1}S_{21},\quad S_{12}S_{21}^{-1}S_{12},\quad S_{21}^{-1}S_{12}S_{21}^{-1},\quad S_{12}^{-1}S_{21}S_{12}^{-1}$$

These terms all happen to be equivalent to each other up to a sign flip, which means that no matter what term comes next or before in the string, this group of three can be changed into one that allows for inverse cancellation, which decreases the length of the string. In the first case, there are four possibilities, though these are mostly illustrative:

$$\begin{aligned}
\left(S_{21}S_{12}^{-1}S_{21}\right)S_{21}^{-1} &= S_{21}S_{12}^{-1}\\\\
\left(S_{21}S_{12}^{-1}S_{21}\right)S_{21} &= \left(-S_{21}^{-1}S_{12}S_{21}^{-1}\right)S_{21} = -S_{21}^{-1}S_{12}\\\\
\left(S_{21}S_{12}^{-1}S_{21}\right)S_{12} &= \left(S_{12}^{-1}S_{21}S_{12}^{-1}\right)S_{12} = S_{12}^{-1}S_{21}\\\\
\left(S_{21}S_{12}^{-1}S_{21}\right)S_{12}^{-1} &= \left(-S_{12}S_{21}^{-1}S_{12}\right)S_{12}^{-1} = -S_{12}S_{21}^{-1}
\end{aligned}$$

So actually, if there are at least two rifts and at least four terms, we are bound to be able to decrease the length of the string. Otherwise, if there is only one rift, then we can move it to the end of the string, resulting in the first two options listed above.

To summarize, the cases are:
- String has no rifts, and is either all normal terms or all inverse terms.
- String has one rift, which can be moved to the end while possibly incurring a sign flip.
- String has at least two rifts and at least length 4, which can be moved into each other, resulting in a decrease in string length and possibly a sign flip.
- String has length three, and has two rifts.

Also notice that in all of these equivalences, the following transformations preserve identities: $(S_{21}, S_{12}, S_{21}^{-1}, S_{12}^{-1}) \to (S_{12}, S_{21}, S_{12}^{-1}, S_{21}^{-1}) \to (S_{21}^{-1}, S_{12}^{-1}, S_{21}, S_{12})$.

### 2D shear identity lemma

I will prove that every string that evaluates to identity or negative identity can be generated by a grammar that parallels the techniques in the above proof, described below. Let $x, y$ represent distinct normal terms and $x^{-1}, y^{-1}$ represent distinct inverse terms, and let $X, X^C$ represent the two halves of the whole string:

$$\begin{aligned}
\epsilon &\leftrightarrow x^{-1}x,\; xx^{-1}\\\\
xy^{-1}x \leftrightarrow yx^{-1}y &\leftrightarrow x^{-1}yx^{-1} \leftrightarrow y^{-1}xy^{-1}\\\\
xy^{-1}x^{-1} &\leftrightarrow yxy^{-1}\\\\
xy^{-1}y^{-1} &\leftrightarrow yyx^{-1}\\\\
x^{-1}yx &\leftrightarrow y^{-1}x^{-1}y\\\\
x^{-1}yy &\leftrightarrow y^{-1}y^{-1}x\\\\
XX^C &\leftrightarrow X^CX \quad \text{because if } XX^C=I \text{ then } X,X^C \text{ are inverses so } X^CX=I
\end{aligned}$$

Suppose that we have a string that evaluates to identity. I will prove that it must be possible to decrease its length. Start by getting it into a form like the above proof. If the string has no rifts and has length greater than 0, it will grow in size unboundedly away from identity, and so can't be identity. All the strings of length 3 with 3 rifts are not identity. So we are left with all the strings with one rift, moved to the end. WLOG it is a left rift, otherwise we can take the inverse transpose of the string to make it a right rift at the end. Again WLOG we can write it as $xy^{-1}$ at the end. Wrapping the first character of the string around, it must be either $x$ or $y$ by construction. If it is $y$, we can immediately reduce the length of the string. If it is $x$, the end of the string now has $xy^{-1}x$, which is not identity itself and is known to be unstable and leading to a decreasing string length if the string has length four or greater. Therefore, every identity string is reducible according to the above grammar, and so every identity string can be constructed by that grammar as well.

### Non-unit 2D shears

Suppose that instead of having unit shear matrices, we have

$$T_1=\begin{bmatrix} 1 & n_1\\\\ 0 & 1 \end{bmatrix} \quad\text{and}\quad T_2=\begin{bmatrix} 1 & 0\\\\ n_2 & 1 \end{bmatrix}$$

The following computes the orbit of $(1,0)$ under these transformations:

$$\begin{aligned}
T_2^n(1,0) &= (1,nn_2)\\\\
(1,0) &\sim (1+an_1n_2,\; bn_2)\\\\
T_1(1+an_1n_2,\; bn_2) &= (1+an_1n_2,\; (b+1+an_1n_2)n_2)\\\\
T_1^{-1}(1+an_1n_2,\; bn_2) &= (1+an_1n_2,\; (b-1-an_1n_2)n_2)\\\\
T_2(1+an_1n_2,\; bn_2) &= (1+(a+b)n_1n_2,\; bn_2)\\\\
T_2^{-1}(1+an_1n_2,\; bn_2) &= (1+(a-b)n_1n_2,\; bn_2)
\end{aligned}$$

## What's Next

- Cataloguing finer relations than the top relation in 2 dimensions.
- Extending the 2D unit matrix decomposition lemma to higher dimensions.
- Exploring the ideas in sections 2.5 and 2.6 in higher dimensions.

## Appendix

The following are terms and definitions that are used in this text.

$\gcd(\mathbf{u})$ is defined as the gcd of the components of $\mathbf{u}$. A vector is relatively prime iff it has a gcd of 1. The gcd is always computed to be a positive integer.

Fineness and coarseness are used as antonyms in this text.

An integral matrix is a matrix with components that are all integers.

A unit matrix is an integral matrix with determinant 1.
