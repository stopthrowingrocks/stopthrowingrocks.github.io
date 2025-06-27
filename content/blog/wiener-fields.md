+++
title = "Modeling random fields"
date = 2025-06-25
+++

# Modeling random fields over arbitrary geometries by extending Brownian motion

_TODO min read._

Hello! Thank you for coming here to read my article. This is part story, part walkthrough of TODO. It is intended to be read by people with at least about basic college-level math experience. Be prepared to take the time to parse and understand some potentially lengthy mathematical expressions to get the most out of it.

## Motivation: Inspiration from quantum gravity

Theoretical physics is, in part, the search for a so-called Theory of Everything. Such a Theory of Everything would be able to explain every phenomenon and predict every outcome, at least in theory. It might take a very big computer and some clever approximations to actually calculate what the theory says, but at least you know what the rules of the universe are at their most fundamental level.

However, right now theoretical physicists are stuck with two successful but incompatible theories: Quantum Field Theory (QFT) and General Relativity (GR). QFT is best at explaining things that happen around the scale of atoms. GR is best at explaining gravity, which happens around heavy things like planets. By making informed simplifications of the two theories, they can also be extended to explain things that happen in our everyday life. As water drips from the faucet, the surface tension of the water is a quantum property, whereas the water falling into the sink is because of gravity.

And yet despite their success, QFT and GR remain separate theories. This is frustrating for theoretical physicists, because it means there are some phenomena that even in principle we don't know how to predict. Most of these have to do with black holes, like what happens inside a black hole, or on the surface of a black hole, or what happens if you look at reality at such a small scale that tiny black holes should appear randomly all the time.

A theory that would successfully unify QFT and GR would be a theory of Quantum Gravity. This is currently considered the Holy Grail of theoretical physics. It's also fascinating to me, and I like to think about what a theory of Quantum Gravity could look like.

Maybe part of Quantum Gravity is that space-time itself is somehow randomly configured. I got this idea in trying to some Quanta Magazine article iirc. But what could that even mean? What would that look like? I needed to get my hands on some math, so I decided to do this project.

## Prior work: Stochastic processes and Brownian motion

I decided to focus on trying to model some kind of randomly-fluctuating variable on an existing static space, like 2D or 3D space. It just so happens that there are a lot of tools for describing randomly-fluctuating varibles in time, under the name [Stochastic Process Theory](https://en.wikipedia.org/wiki/Stochastic_process).

The most basic example of a stochastic process like this is Brownian motion. The basic idea is that you have a random variable that at every timestep randomly increases or decreases a little bit. This could be used to model a stock price going up and down with time, or a continuous random walk in one dimension. For concision, let's call the units of Brownian motion "field", represented by $\phi$.

Brownian motion has many interesting properties.
- Brownian motion is not any specific shape or function, but rather a probabilistic collection of functions that obeys certain properties. No two exact stock trajectories will look the same, but we may still be able to model both of them using the same equations. In practice, people _generate_ examples of Brownian motion, and/or study specific instantiations of processes modeled by it.
- Brownian motion looks self-similar. Zooming in or out of Brownian motion looks like more Brownian motion, though probably not an exact copy of the original.
- It tends to grow at a rate proportional to $\sqrt{\Delta t}$, where $\Delta t$ is the amount of time that has passed. This also means if we zoom into the time axis by a factor of 4, we only need to zoom into the field axis by a factor of 2 for it to look basically the same, subject to the same caveat as above.
- If you know the value at one point in time, that affects the probability distribution of what values other points can take. We will explore the details of this in just a moment.
- It has what is called a Markov property: if you know the value at a certain point $t$ in time, the probability distributions of value before $t$ become independent of those after $t$, and vice versa.

Ideally, we would be able to state our theory in math, as this will be the most precise way of understanding what we're actually saying and of how our model works. Indeed, one might say that the purpose of math as a language is to exactly describe some idea, model, or theoretical system, where all assumptions and relations must be exactly laid out.

One of the fundamental properties of Brownian motion is the probability relation between values of the field at two points. Specifically, for a function $\phi(t)$ representing Brownian motion, we have the following Probability Density Function (PDF), denoted $\mathcal{P}$, in $\phi_1$:

$\mathcal{P}\left(\phi(t_1)=\phi_1 \mid \phi(t_0)=\phi_0\right) \sim \exp\left(-\tfrac{1}{2}\frac{\left(\phi_1-\phi_0\right)^2}{\nu |t_1-t_0|}\right) = \exp\left(-\frac{1}{2}\frac{\Delta\phi^2}{\nu\Delta t}\right)$.

Most of the fundamental mathematical objects in this article will look like the above, so take your time to get used to it if you need. This is a normal distribution for $\phi_1$ with mean $\phi_0$ and variance $\nu \Delta t$. Here, $\nu$ is a proportionality constant with units of $\phi^2 / t$. The larger the value of $\nu$, the faster the resulting Brownian motion changes field value. Probability density functions also have a proportionality constant so that they integrate to one, but we will be omitting this for clarity. The important thing for our discussion is the exponential and its contents. As such, we only say that the PDF is _proportional_ to the exponential expression, denoted by the $\sim$. For concision, I will call this exponential expression the "correlation function" for this configuration of points. Note that from a correlation function, the actual PDF can be recovered by integrating the correlation function over all inputs, getting the result, and dividing the correlation function by that result. This means that when we integrate this new quantity over all inputs, we get $1$, which is the requirement on a Probability Density Function.

## Working with correlation functions
So we have the correlation function for the possible value of $\phi(t_1)$ given knowledge of $\phi(t_0)$. And because of the Markov property, if $t_0<t_1<t_2$, then given knowledge of $\phi(t_1)$, the distributions for $\phi(t_0)$ and $\phi(t_2)$ will be independent. This is because knowing the value for $\phi(t_1)$ effectively "cuts off" influence between $t_0$ and $t_2$. But what if we know $\phi(t_0)$, and we want to get the joint correlation function for $\phi(t_1)$ and $\phi(t_2)$?

So we want to compute $\mathcal{P}\left(\phi(t_1)=\phi_1 \land \phi(t_2)=\phi_2 \mid \phi(t_0)=\phi_0\right)$. By Bayes' theorem, this equals $\mathcal{P}\left(\phi(t_2)=\phi_2 \mid \phi(t_0)=\phi_0 \land \phi(t_1)=\phi_1\right)\mathcal{P}\left(\phi(t_1)=\phi_1 \mid \phi(t_0)=\phi_0\right)$. Applying the Markov property, we simplify to $\mathcal{P}\left(\phi(t_2)=\phi_2 \mid \phi(t_1)=\phi_1\right)\mathcal{P}\left(\phi(t_1)=\phi_1 \mid \phi(t_0)=\phi_0\right)$. Because this is a product of PDFs, the correlation function for this will also just be the product of each individual correlation function. As a result, the correlation function for the joint distribution is $\exp\left(-\tfrac{1}{2}\left(\frac{\left(\phi_2-\phi_1\right)^2}{\nu|t_2-t_1|} + \frac{\left(\phi_1-\phi_0\right)^2}{\nu|t_1-t_0|}\right)\right)$. Notice how within the exponential expression, we simply add the two fractions associated with each individual correlation function. Not only that, it can be expressed as a quadratic polynomial in the $\phi_i$ s, and in general this form looks like it has a lot of structure.

This is very nice! This gives us a sign that potentially this kind of problem will continue to yield to symbolic methods.

### Subsection: Integrating correlation functions

What I'd like to do now is walk through a certain operation on correlation functions. We have the joint correlation function for $\phi(t_1)$ and $\phi(t_2)$ given $\phi(t_0)$, but we'd like to prove that if we are somehow able to ignore the information we get about $\phi(t_1)$, that we recover the correlation function for $\phi(t_2)$ given $\phi(t_0)$. This would basically ensure that our joint correlation function is self-consistent, and is the true generalization of the individual correlation functions.

We will do this by integrating the correlation function over all possible values of $\phi_1$. This is analogous to the probabilistic idea that $P(A \land B) + P(A\land \neg B)=P(A)$. (TODO: Maybe improve this analogy.) Formally speaking, this looks like $\mathcal{P}\left(\phi(t_2)=\phi_2 \mid \phi(t_0)=\phi_0\right)=\int_\mathbb{R}\mathcal{P}\left(\phi(t_1)=\phi_1\land \phi(t_2)=\phi_2 \mid \phi(t_0)=\phi_0\right)d\phi_1$. But because we are working with correlation functions, we instead say $\mathcal{P}\left(\phi(t_2)=\phi_2 \mid \phi(t_0)=\phi_0\right)\sim\int_\mathbb{R} \exp\left(-\tfrac{1}{2}\left(\frac{\left(\phi_2-\phi_1\right)^2}{\nu|t_2-t_1|} + \frac{\left(\phi_1-\phi_0\right)^2}{\nu|t_1-t_0|}\right)\right) d\phi_1$. Now, it turns out that given constant $a$ and constants $v_j$ for $j\in\{0\ldots n\}$, $\int_\mathbb{R}\exp\left(-\tfrac{1}{2}\left(\sum_{j=0}^nv_j\phi_j\right)^2\right)d\phi_i\sim 1$. However, if instead the correlation function looks like $\exp\left(-\tfrac{1}{2}\left(\left(\sum_{j=0}^nv_j\phi_j\right)^2+X\right)\right)$ where $X$ does not depend on $\phi_i$, then integrating over $\phi_i$ will just result in $\exp\left(-\tfrac{1}{2}X\right)$. The intuition is we have isolated all the behavior associated with $\phi_i$ into a self-contained Gaussian distribution, represented by a square quadratic in the correlation function, at which point integrating over it eliminates it cleanly.

Ok wow, this seems like an elegant tool. All we have to do is put our correlation function into a form like this, and then we immediately get what the correlation function would be if we integrate over $\phi_1$! It turns out that $\frac{\left(\phi_2-\phi_1\right)^2}{\nu|t_2-t_1|} + \frac{\left(\phi_1-\phi_0\right)^2}{\nu|t_1-t_0|}=\tfrac{1}{\nu}\left(\frac{1}{\left|t_2-t_1\right|}+\frac{1}{\left|t_1-t_0\right|}\right)^{-1}\left(\frac{\phi_1-\phi_2}{\left|t_2-t_1\right|}+\frac{\phi_1-\phi_0}{\left|t_1-t_0\right|}\right)^{2}+\frac{\left(\phi_2-\phi_0\right)^{2}}{\nu\left|t_2-t_0\right|}$. This might look pretty nasty, but the upshot is that the first term in the sum is exactly that square quadratic we were looking for. The second term would then be what the correlation function reduces to when we integrate over $\phi_1$. And hey, look! It's exactly what we would expect the correlation function for $\phi_2$ to be given knowledge of $\phi_0$. (TODO: There is a shift in speaking from talking about "correlation functions for $\phi(t_i)$" to "correlation functions for $\phi_i$". Is there a way to resolve this inconsistency?)

### Subsection: Relocating correlation functions
