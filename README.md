# Sploot & Co — Custom Shopify Theme

Custom Shopify theme for [Sploot & Co](https://www.splootandco.com) — heavyweight streetwear with woodcut graphics, dark-fantasy corgis, and brutalist energy.

## Stack

- **Shopify Online Store 2.0** (JSON templates, sections everywhere)
- **Vanilla Liquid + CSS + JS** — no framework, no build step
- **Web Components** for interactive bits (cart drawer, variant picker)
- **Mobile-first** responsive layout
- **Native lazy-loading**, fluid typography, system-font-first stack

## Structure

```
assets/      static CSS, JS, fonts (theme.css, theme.js)
config/      settings_schema.json + settings_data.json (theme editor)
layout/      theme.liquid (master layout, header/footer slots)
locales/     en.default.json (storefront strings)
sections/    reusable sections referenced by templates
snippets/    small reusable Liquid chunks (product card, icons, etc.)
templates/   JSON templates — index, product, collection, cart, page, search, 404
```

## Local development

Install the [Shopify CLI](https://shopify.dev/docs/themes/tools/cli):

```bash
brew tap shopify/shopify
brew install shopify-cli
```

From the repo root:

```bash
# Live preview against the dev store with hot reload
shopify theme dev --store splootandco.myshopify.com

# Push as an unpublished theme to review in admin
shopify theme push --unpublished --theme "Sploot — Dev"

# Pull theme changes from Shopify back into the repo
shopify theme pull
```

## Design direction

- **Palette:** bone (`#F4EFE6`) on near-black (`#0B0B0B`), accent rust (`#B5471A`)
- **Type:** condensed display + a clean serif body, all-caps for navigation
- **Voice:** brutalist, irreverent, packlike — "we are the pack"
- **Motion:** subtle, scroll-driven; no decorative bounce
