import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Price } from "@/components/price";
import { DISPLAY_FONT, displayCandidateA, displayCandidateB } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { contrastRatio } from "./contrast";
import { BadgesDemo, ButtonsDemo, FieldsDemo, OverlaysDemo, TabsDemo } from "./demos";

export const metadata: Metadata = {
  title: "UI kit",
  robots: { index: false, follow: false },
};

const SAMPLE_UK = "Прикраси ручної роботи — ґудзики, сережки, намисто, їжак і щастя";
const SAMPLE_CS_RO = "Šperky ručně vyrobené: řetízek, náušnice · Bijuterii lucrate manual: brățară, colier, ținută";
const SAMPLE_PL = "Biżuteria ręcznie robiona: łańcuszek, kolczyki, źródło";

// USD cents: tiny, under and over the 100 threshold, the D4 examples, large
const DEMO_USD_PRICES = [50, 2780, 2900, 3200, 3300, 15000, 250000];

const SWATCHES = [
  { name: "background", value: "#F4F0EB", className: "bg-background" },
  { name: "foreground / borders", value: "#635A59", className: "bg-foreground" },
  { name: "accent", value: "#FF614A", className: "bg-accent" },
  { name: "success", value: "#00C853", className: "bg-success" },
  { name: "warning", value: "#FFD600", className: "bg-warning" },
  { name: "hairline", value: "rgba(99,90,89,.1)", className: "bg-hairline" },
  { name: "separator", value: "#36475C 10%", className: "bg-separator" },
  { name: "primary/80 (opacity modifier)", value: "#635A59 80%", className: "bg-primary/80" },
];

const CONTRAST_PAIRS = [
  { label: "Brown text on beige background", fg: "#635a59", bg: "#f4f0eb" },
  { label: "Beige text on brown (contained button)", fg: "#f4f0eb", bg: "#635a59" },
  { label: "Coral accent text on beige", fg: "#ff614a", bg: "#f4f0eb" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t-2 border-hairline py-10">
      <h2 className="text-center font-display text-[40px] leading-[54px] uppercase sb:text-left sb:text-[56px] sb:leading-[76px]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FontCandidate({ id, name, className }: { id: "A" | "B"; name: string; className: string }) {
  return (
    <figure className="grid gap-3 border-2 border-foreground p-6">
      <figcaption className="font-sans text-xs font-bold tracking-[2.4px] uppercase">
        Candidate {id}: {name} {DISPLAY_FONT === id && <span className="text-accent">(selected)</span>}
      </figcaption>
      <div className={cn("grid gap-2", className)}>
        <p className="text-[40px] leading-[54px] uppercase">Earrings · Сережки</p>
        <p className="text-2xl">{SAMPLE_UK}</p>
        <p className="text-2xl">{SAMPLE_CS_RO}</p>
        <p className="text-2xl">{SAMPLE_PL}</p>
      </div>
    </figure>
  );
}

export default function UiKitPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="page-container flex flex-col pb-10">
      <h1 className="py-6 text-center font-display text-[40px] leading-[54px] uppercase sb:text-left sb:text-[56px] sb:leading-[76px]">
        TJS UI kit
      </h1>

      <Section title="Typography">
        <div className="grid gap-4">
          <p className="font-display text-[40px] leading-[54px] uppercase">Display · {SAMPLE_UK}</p>
          <p className="font-display text-2xl">{SAMPLE_CS_RO}</p>
          <p className="font-sans text-base font-semibold tracking-[1.6px]">Raleway UI · {SAMPLE_UK}</p>
          <p className="font-sans text-sm">Raleway UI · {SAMPLE_CS_RO}</p>
          <p className="font-sans text-xs font-bold tracking-[2.4px] uppercase">Product title · {SAMPLE_PL}</p>
          <p className="font-input text-sm font-medium">Inter inputs · {SAMPLE_UK} · {SAMPLE_CS_RO}</p>
          <p className="font-sans text-sm font-bold text-accent uppercase">Price —</p>
        </div>
      </Section>

      <Section title="Display font">
        <div className="grid gap-6 sb:grid-cols-2">
          <FontCandidate id="A" name="Cormorant Garamond" className={displayCandidateA.className} />
          <FontCandidate id="B" name="Playfair Display" className={displayCandidateB.className} />
        </div>
      </Section>

      <Section title="Colours">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="grid gap-2 font-sans text-xs">
              <span className={cn("h-16 border-2 border-foreground", swatch.className)} />
              <span className="font-semibold">{swatch.name}</span>
              <span>{swatch.value}</span>
            </li>
          ))}
        </ul>
        <table className="w-full max-w-xl font-sans text-sm">
          <caption className="pb-2 text-left font-semibold">WCAG contrast</caption>
          <tbody>
            {CONTRAST_PAIRS.map((pair) => {
              const ratio = contrastRatio(pair.fg, pair.bg);
              return (
                <tr key={pair.label} className="border-b border-hairline">
                  <td className="py-2" style={{ color: pair.fg, backgroundColor: pair.bg }}>
                    {pair.label}
                  </td>
                  <td className="py-2 text-right tabular-nums">{ratio.toFixed(2)}:1</td>
                  <td className="py-2 text-right">{ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "below AA"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Buttons">
        <ButtonsDemo />
      </Section>

      <Section title="Fields">
        <FieldsDemo />
      </Section>

      <Section title="Overlays">
        <OverlaysDemo />
      </Section>

      <Section title="Tabs">
        <TabsDemo />
      </Section>

      <Section title="Badges">
        <BadgesDemo />
      </Section>

      <Section title="Prices">
        <p className="font-sans text-sm">
          USD prices in the visitor&apos;s currency: switch the currency in the header; the URL stays the same.
        </p>
        <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 font-sans text-sm" data-testid="demo-prices">
          {DEMO_USD_PRICES.map((usdMinor) => (
            <div key={usdMinor} className="contents">
              <dt className="tabular-nums">${(usdMinor / 100).toFixed(2)}</dt>
              <dd className="text-right font-bold text-accent">
                <Price usdMinor={usdMinor} />
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Rules">
        <hr className="h-0.5 border-0 bg-separator" />
        <Link href="/" className="move-underline w-fit font-sans text-sm font-semibold">
          See all
        </Link>
      </Section>
    </main>
  );
}
