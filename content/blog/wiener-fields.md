+++
title = "Modeling random fields"
date = 2025-06-25
+++

# Modeling random fields over arbitrarily-connected spaces by extending Brownian motion

## Motivation: Inspiration from quantum gravity

Theoretical physics is, in part, the search for a so-called Theory of Everything. Such a Theory of Everything would be able to explain every phenomenon and predict every outcome, at least in theory. It might take a very big computer and some clever approximations to actually calculate what the theory says, but at least you know what the rules of the universe are at their most fundamental level.

However, right now theoretical physicists are stuck with two successful but incompatible theories: Quantum Field Theory (QFT) and General Relativity (GR). QFT is best at explaining things that happen around the scale of atoms. GR is best at explaining gravity, which happens around heavy things like planets. By making informed simplifications of the two theories, they can also be extended to explain things that happen in our everyday life. As water drips from the faucet, the surface tension of the water is a quantum property, whereas the water falling into the sink is because of gravity.

And yet despite their success, QFT and GR remain separate theories. This is frustrating for theoretical physicists, because it means there are some phenomena that even in principle we don't know how to predict. Most of these have to do with black holes, like what happens inside a black hole, or on the surface of a black hole, or what happens if you look at reality at such a small scale that tiny black holes should appear randomly all the time.

A theory that would successfully unify QFT and GR would be a theory of Quantum Gravity. This is currently considered the Holy Grail of theoretical physics. It's also fascinating to me, and I like to think about what a theory of Quantum Gravity could look like.

Maybe part of Quantum Gravity is that space-time itself is somehow randomly configured. I got this idea in trying to some Quanta Magazine article iirc. But what could that even mean? What would that look like? I needed to get my hands on some math, so I decided to do this project.

## Prior work: Stochastic processes and Brownian motion

I decided to focus on trying to model some kind of randomly-fluctuating variable on an existing static space, like 2D or 3D space. It just so happens that there are a lot of tools for describing randomly-fluctuating varibles in time, under the name [Stochastic Process Theory](https://en.wikipedia.org/wiki/Stochastic_process).

The most basic example of a stochastic process like this is Brownian motion. The basic idea is that you have a random variable that at every timestep randomly increases or decreases a little bit. This could be used to model a stock price going up and down with time, or a continuous random walk in one dimension. For concision, let's call the units of brownian motion "field", represented by $\phi$.

Brownian motion has many interesting properties.
- Brownian motion is not any specific shape or function, but rather a probabilistic collection of functions that obeys certain properties. No two exact stock trajectories will look the same, but we may still be able to model both of them using the same equations.
- Brownian motion looks self-similar. Zooming in or out of brownian motion looks like more brownian motion, though probably not an exact copy of the original.
- It tends to grow at a rate proportional to $\sqrt{\Delta t}$, where $\Delta t$ is the amount of time that has passed. This also means if we zoom into the time axis by a factor of 4, we only need to zoom into the field axis by a factor of 2 for it to look basically the same, subject to the same caveat as above.
- If you know the value at one point in time, that affects the probability distribution of what values other points can take. We will explore the details of this in just a moment.
- It has what is called a Markov property: if you know the value at a certain point $t$ in time, the probability distributions of value before $t$ become independent of those after $t$, and vice versa.

If $\phi_1(t),\phi_2(t),\phi_3(t)$ are independent Brownian motion processes, then the vector $\vec{\phi}=\left<\phi_1(t),\phi_2(t),\phi_3(t)\right>$ represents a random walk in three dimensions. And because Brownian motion grows proportionally to $\sqrt{\Delta t}$, that means the square of $\Delta \phi = \phi(t + \Delta t) - \phi(t)$ grows proportional to $t$. The equation for a sphere is $x_1^2+x_2^2+x_3^2=r^2$. Because each component of $\vec{\phi}$ has its square growing proportionally in time, they should all contribute about equally to the radius calculation. So it should come as no surprise that a random walk defined this way will be spherically symmetric. However, we do not yet know precisely what it means for a random walk to be spherically symmetric, or how to prove that this one is. Next, we will explore the math of brownian motion and prove that the $\vec{\phi}$ defined here is spherically symmetric. This will prepare us for the math we will use to model random fields.
