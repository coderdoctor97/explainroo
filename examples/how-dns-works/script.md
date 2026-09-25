# How DNS finds a website

> A classic explainer in the chalk look. The diagram grows scene by scene:
> earlier parts are carried over with at: -1.

## hook
You type {example.com|example dot com}, and a page appears. [#but] But computers don't find each other by name. [#numbers] They use numbers, called IP addresses.

## question
So before anything loads, your browser has to ask: [#ask] what is the address of {example.com|example dot com}?

## cache
First, it checks what it already knows. [#browser] The browser [#os] and your operating system both keep recent answers in a cache.

## resolver
If neither one knows, the question goes to a resolver, [#isp] usually run by your internet provider, [#public] or a public one like {1.1.1.1|one dot one dot one dot one}.

## root
The resolver starts at the top. [#root] A root server doesn't know the answer, [#tld] but it knows who runs dot com.

## tld
The dot com servers don't know either, [#auth] but they know which name server is responsible for {example.com|example dot com}.

## answer
That name server has the answer. [#ip] It sends back the IP address, [#keep] and the resolver keeps a copy for next time.

## outro {hold=1.5}
Four hops, [#blink] usually faster than a blink. [#next] Next time a page loads, you'll know who answered first.
