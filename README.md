# Bølgen Studio

Webshoppen for Bølgen Studio. Bygget med Astro og Tailwind, med Shopify som kurv og kasse.

## Kom i gang

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Sådan hænger det sammen

- **Produkter** hentes fra Shopify Storefront API, når siden bygges (`src/lib/products.ts`). Nye priser,
  størrelser og lagerstatus kræver derfor et nyt build/deploy. Svarer Shopify ikke, vises hoodien stadig,
  men uden køb.
- **Kurven** lever hos Shopify. Browseren gemmer kun kurvens id (`src/lib/cart.ts`), og "Gå til kassen"
  sender kunden til Shopifys checkout.
- **Fotos** ligger i `src/assets/collection/` og bliver automatisk til WebP i flere størrelser.
  - `hvid/` og `sort/`: produktfotos pr. farve. Filnavnet styrer rækkefølgen i galleriet:
    `front`, `back`, `kaligrafi`, `wrist`, `trio`. Mappenavnet skal matche farvens navn i Shopify.
  - `studio/`: billedstriben "Studie perspektiv" på forsiden.
  - Fotos, hvor hoodien fylder lidt i billedet, kan beskæres omkring motivet via `FOCUS` i
    `src/lib/images.ts`.
- **Størrelsesguiden** har én kilde: `src/lib/size-chart.ts`.
- **Farver og typografi** er defineret i `tailwind.config.mjs` og `src/styles/global.css`. Siden er farvet
  som hoodien: hvid bomuld med blå tråd, og `data-theme="sort"` vender den til den sorte hoodie.

## Miljøvariabler

Se `.env.example`. Shoppen virker uden token (Shopifys tokenløse adgang), men et Storefront-token giver
højere grænser.

## Kontakt & nyhedsbrev

Formularerne bruger [FormSubmit](https://formsubmit.co). Sæt `PUBLIC_FORMSUBMIT_RECIPIENT` for at ændre
modtageren. Er den tom, bruges Netlify Forms (kun relevant, hvis siden hostes på Netlify).
