# Project

This is a monorepo of an Internet Shaper prototype exploring just-in-time generative adaptation of web interfaces, as part of my batchelor's degree thesis

## Context

Popular, commertial user interfaces have systematically misaligned business and user goals. This ofter results in dopamine loops, that increase retention, while ignoring prefered usage patterns; or excessive ads of the features that provide little extra value.

## Research Question

How can adaptive generative interfaces counteract this problem by re-aligning
the interface with a user's articulated goal?

# Packages

## browser-extension

Chrome extension built with [fiber-extension](../fiber/README.md) framework.

```bash
cd browser-extension
pnpm dev    # Dev mode with HMR
pnpm build  # Production build
```

Load `browser-extension/dist/` in chrome://extensions as unpacked extension.

# Best Practices

- Write in TypeScript, use Deno
- Log all script results with input configuration in .log files for reproducability
