import type { Locale } from "@/i18n/routing";

/*
 * The jewellery glossary of the product translations: how the shop names its pieces, clasps and materials in
 * every locale, so 167 products do not get five different words for one clasp. Data only, no imports at run
 * time (the batch script scripts/translate/missing.mjs loads this file with Node). Each term lists the locales
 * it is fixed in; the prompt gives the model the pairs from the source locale into each target.
 *
 * Review status: written with an LLM from the shop's own category names (messages/<locale>/catalog.json) and
 * D31 («Намиста»); not yet checked by native speakers. A correction here applies to the next translation run.
 */

export type GlossaryTerm = { note?: string } & Partial<Record<Locale, string>>;

export const GLOSSARY: readonly GlossaryTerm[] = [
  // the categories, as the shop names them (catalog.categories.*), in the singular
  { uk: "сережки", en: "earrings", de: "Ohrringe", fr: "boucles d'oreilles", es: "pendientes", it: "orecchini", pl: "kolczyki", nl: "oorbellen", cs: "náušnice", pt: "brincos", ro: "cercei" },
  { note: "the category is «Намиста» in the plural (D31)", uk: "намисто", en: "necklace", de: "Halskette", fr: "collier", es: "collar", it: "collana", pl: "naszyjnik", nl: "ketting", cs: "náhrdelník", pt: "colar", ro: "colier" },
  { uk: "браслет", en: "bracelet", de: "Armband", fr: "bracelet", es: "pulsera", it: "bracciale", pl: "bransoletka", nl: "armband", cs: "náramek", pt: "pulseira", ro: "brățară" },
  { uk: "каблучка", en: "ring", de: "Ring", fr: "bague", es: "anillo", it: "anello", pl: "pierścionek", nl: "ring", cs: "prsten", pt: "anel", ro: "inel" },
  { uk: "брошка", en: "brooch", de: "Brosche", fr: "broche", es: "broche", it: "spilla", pl: "broszka", nl: "broche", cs: "brož", pt: "broche", ro: "broșă" },
  { uk: "корал", en: "coral", de: "Koralle", fr: "corail", es: "coral", it: "corallo", pl: "koral", nl: "koraal", cs: "korál", pt: "coral", ro: "coral" },
  // clasps and findings
  { uk: "застібка-карабін", en: "lobster clasp", de: "Karabinerverschluss", fr: "fermoir mousqueton", es: "cierre de mosquetón", it: "chiusura a moschettone", pl: "zapięcie karabińczyk", nl: "karabijnsluiting", cs: "karabinkové zapínání", pt: "fecho de mosquetão", ro: "închizătoare tip carabină" },
  { uk: "пружинна застібка-кільце", en: "spring ring clasp", de: "Federringverschluss", fr: "fermoir anneau ressort", es: "cierre de anilla", it: "chiusura ad anello a molla", pl: "zapięcie sprężynowe", nl: "springring", cs: "pružinové zapínání", pt: "fecho de argola", ro: "închizătoare inel cu arc" },
  { uk: "застібка-тогл", en: "toggle clasp", de: "Knebelverschluss", fr: "fermoir T", es: "cierre de palanca", it: "chiusura a T", pl: "zapięcie typu toggle", nl: "togglesluiting", cs: "zapínání typu T", pt: "fecho de barra", ro: "închizătoare toggle" },
  { uk: "магнітна застібка", en: "magnetic clasp", de: "Magnetverschluss", fr: "fermoir magnétique", es: "cierre magnético", it: "chiusura magnetica", pl: "zapięcie magnetyczne", nl: "magneetsluiting", cs: "magnetické zapínání", pt: "fecho magnético", ro: "închizătoare magnetică" },
  { uk: "швенза", en: "ear wire", de: "Ohrhaken", fr: "crochet d'oreille", es: "gancho de pendiente", it: "monachella", pl: "bigiel", nl: "oorhaakje", cs: "háček do ucha", pt: "gancho de brinco", ro: "tortiță" },
  { uk: "пусети", en: "stud earrings", de: "Ohrstecker", fr: "puces d'oreilles", es: "pendientes de botón", it: "orecchini a lobo", pl: "kolczyki sztyfty", nl: "oorknopjes", cs: "pecky", ro: "cercei cu șurub" },
  { uk: "кліпси", en: "clip-on earrings", de: "Ohrclips", fr: "clips d'oreilles", es: "pendientes de clip", it: "orecchini a clip", pl: "klipsy", nl: "oorclips", cs: "klipsy", ro: "cercei clips" },
  { uk: "сережки-кільця", en: "hoop earrings", de: "Creolen", fr: "créoles", es: "aros", it: "orecchini a cerchio", pl: "kolczyki koła", nl: "creolen", cs: "kruhové náušnice", pt: "argolas", ro: "cercei rotunzi" },
  { uk: "ланцюжок-подовжувач", en: "extension chain", de: "Verlängerungskette", fr: "chaînette d'extension", es: "cadena de extensión", it: "catenella di allungamento", pl: "łańcuszek przedłużający", nl: "verlengketting", cs: "prodlužovací řetízek", pt: "corrente de extensão", ro: "lănțișor prelungitor" },
  // materials
  { uk: "намистина", en: "bead", de: "Perle", fr: "perle", es: "cuenta", it: "perlina", pl: "koralik", nl: "kraal", cs: "korálek", pt: "conta", ro: "mărgea" },
  { uk: "бісер", en: "seed beads", de: "Rocailles", fr: "perles de rocaille", es: "mostacillas", it: "perline rocaille", nl: "rocailles", cs: "rokajl", pt: "missangas", ro: "mărgele de nisip" },
  { uk: "прісноводні перли", en: "freshwater pearls", de: "Süßwasserperlen", fr: "perles d'eau douce", es: "perlas de agua dulce", it: "perle d'acqua dolce", pl: "perły słodkowodne", nl: "zoetwaterparels", cs: "sladkovodní perly", pt: "pérolas de água doce", ro: "perle de apă dulce" },
  { uk: "натуральний камінь", en: "natural stone", de: "Naturstein", fr: "pierre naturelle", es: "piedra natural", it: "pietra naturale", pl: "kamień naturalny", nl: "natuursteen", cs: "přírodní kámen", pt: "pedra natural", ro: "piatră naturală" },
  { uk: "позолота", en: "gold plating", de: "Vergoldung", fr: "plaqué or", es: "baño de oro", it: "placcatura in oro", pl: "pozłacane", nl: "verguld", cs: "pozlacení", pt: "banho de ouro", ro: "placare cu aur" },
  { uk: "срібло 925 проби", en: "925 sterling silver", de: "925er Sterlingsilber", fr: "argent 925", es: "plata de ley 925", it: "argento 925", pl: "srebro próby 925", nl: "925 sterling zilver", cs: "stříbro 925", pt: "prata de lei 925", ro: "argint 925" },
  { uk: "нержавіюча сталь", en: "stainless steel", de: "Edelstahl", fr: "acier inoxydable", es: "acero inoxidable", it: "acciaio inossidabile", pl: "stal nierdzewna", nl: "roestvrij staal", cs: "nerezová ocel", pt: "aço inoxidável", ro: "oțel inoxidabil" },
  { uk: "без нікелю", en: "nickel-free", de: "nickelfrei", fr: "sans nickel", es: "sin níquel", it: "senza nichel", pl: "bez niklu", nl: "nikkelvrij", cs: "bez niklu", pt: "sem níquel", ro: "fără nichel" },
  // how a piece is made
  { uk: "ручна робота", en: "handmade", de: "handgefertigt", fr: "fait main", es: "hecho a mano", it: "fatto a mano", pl: "ręcznie robiony", nl: "handgemaakt", cs: "ručně vyráběný", pt: "feito à mão", ro: "lucrat manual" },
  { uk: "під замовлення", en: "made to order", de: "auf Bestellung gefertigt", fr: "fabriqué sur commande", es: "hecho por encargo", it: "su ordinazione", pl: "na zamówienie", nl: "op bestelling gemaakt", cs: "na objednávku", pt: "feito por encomenda", ro: "la comandă" },
];

/** Rules the model follows beyond the term pairs. */
export const GLOSSARY_RULES: readonly string[] = [
  "Keep the brand name TJS as it is.",
  "Keep Ukrainian folk jewellery names (ґердан, силянка, дукач, намисто-разок) as a transliteration (gerdan, sylianka, dukach), adding a short explanation in the target language the first time one appears in a description.",
  "Keep numbers, sizes, units (mm, cm, g) and the 925 hallmark exactly as in the source.",
];
