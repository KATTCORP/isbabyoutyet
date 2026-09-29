import type { SousVideEntry } from "@/data/sousVide";
import type { ContentT } from "@/lib/content-t";

/**
 * Extra guidance for a cut card: notes and external sources.
 * Not every cut has a detail sheet — only time-sensitive or multi-source rows.
 */
type GuideReference = {
  href: string;
  label: string;
};

type IngredientStart = Exclude<SousVideEntry["start"], null>;

export type CutGuide = {
  cutId: string;
  notes: ReadonlyArray<string>;
  references: ReadonlyArray<GuideReference>;
};

const KITCHENLAB_GUIDE_HREF =
  "https://www.kitchenlab.se/koksbloggen/koksguiden-9-sous-vide-temperaturer-och-koktider/";

/** Detail sheets keyed by cut id (see `groupSousVideEntriesByCut`). */
export function getCutGuide(cutId: string, t: ContentT): CutGuide | null {
  switch (cutId) {
    case "egg":
      return {
        cutId,
        notes: [
          t(
            "Times are for large eggs taken straight from the fridge. Room-temperature eggs finish a minute or two sooner on the short hot baths.",
          ),
          t(
            "Onsen-style (63C / 45-60 min) is the classic 145F egg — Anova lists 63C; Serious Eats often cites 62.8C.",
          ),
          t(
            "Soft and jammy are longer KitchenLab equilibrium baths. Poached (75C / 13-14 min) is Anova / ChefSteps high-and-fast: set white, still-runny yolk.",
          ),
          t(
            "Past about an hour on Onsen, Soft, or Jammy, the white barely changes; the yolk thickens toward a soft gel by the 2h max.",
          ),
          t(
            "Lower eggs in gently once the bath is at temperature. For make-ahead poached eggs, ice-bath immediately, refrigerate, then rewarm around 60C for a few minutes.",
          ),
        ],
        references: [
          {
            href: "https://anovaculinary.com/blogs/recipes/sous-vide-egg",
            label: "Anova — sous vide egg (75C / 13 min, from fridge)",
          },
          {
            href: "https://anovaculinary.com/pages/sous-vide-egg-guide",
            label: "Anova — egg guide (63C timing: 45 min to 2 h yolk thickening)",
          },
          {
            href: "https://www.chefsteps.com/activities/perfect-sous-vide-poached-eggs",
            label: "ChefSteps — perfect poached eggs (75C / 13 min)",
          },
          {
            href: "https://www.seriouseats.com/sous-vide-101-all-about-eggs",
            label: "Serious Eats — sous vide eggs (equilibrium baths; longer cooks thicken yolk)",
          },
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9 (original table)",
          },
        ],
      };
    case "pork-fillet":
    case "pork-chop":
    case "pork-roast":
    case "pork-shoulder":
    case "pork-belly":
      return {
        cutId,
        notes: [
          t(
            "Pink pork is normal at Rare and Medium. Colour is not a safety check — pathogen kill is time at temperature, not how red it looks.",
          ),
          t(
            "USDA whole-muscle pork is 63C / 145F. Rare at 60C is a texture target; hold the full recommended time for pasteurisation.",
          ),
          t(
            "Trichinella die at about 60C with slow heating and are very rare in inspected farmed pork, so these baths with the full hold cover them.",
          ),
          t(
            "Wild boar and bear can carry Trichinella. Unless the meat is tested, cook it through (CDC: 74C / 165F) instead of using these pork temps.",
          ),
        ],
        references: [
          {
            href: "https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/meat-fish/fresh-pork-farm-table",
            label: "USDA FSIS — fresh pork (63C / 145F whole-muscle; pink can still be safe)",
          },
          {
            href: "https://www.livsmedelsverket.se/livsmedel-och-innehall/bakterier-virus-parasiter-och-mogelsvampar1/parasiter/trikiner",
            label: "Livsmedelsverket — trikiner (die around 60-65C; rare in Swedish farmed pigs)",
          },
          {
            href: "https://www.cdc.gov/mmwr/volumes/73/wr/mm7320a2.htm",
            label: "CDC MMWR — trichinellosis from bear meat (cook wild game to 74C / 165F)",
          },
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9 (notes FDA lowered pork to 63C)",
          },
          {
            href: "https://www.seriouseats.com/sous-vide-cooking-temperature-and-timing-charts",
            label: "Serious Eats — sous vide temperature and timing charts",
          },
        ],
      };
    case "chicken-breast":
    case "chicken-thigh":
      return {
        cutId,
        notes: [
          t(
            "Sous vide chicken can stay pink even when pasteurised. Safety is time at temperature, not clear juices or white meat colour.",
          ),
          t(
            "Breast at 60-63C needs the full recommended hold after the core is hot. Anova and Serious Eats publish poultry pasteurisation charts.",
          ),
        ],
        references: [
          {
            href: "https://anovaculinary.com/pages/sous-vide-chicken-guide",
            label: "Anova — chicken guide (pasteurisation below 74C / 165F)",
          },
          {
            href: "https://www.seriouseats.com/the-food-lab-complete-guide-to-sous-vide-chicken-breast",
            label: "Serious Eats — sous vide chicken breast (time-at-temp pasteurisation)",
          },
          {
            href: "https://www.seriouseats.com/safe-chicken-temperature-time-and-temp-11948586",
            label: "Serious Eats — safe chicken temperature (time and temp)",
          },
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9 (extra time at 63C for juicier chicken)",
          },
        ],
      };
    case "salmon":
    case "tuna":
    case "cod":
    case "halibut":
      return {
        cutId,
        notes: [
          t(
            "Fish fillets here are short cooks: start from fridge-cold, about 25 mm thick. Thicker pieces need more time; thinner cook faster.",
          ),
          t(
            "These temperatures describe texture, not pasteurisation. Use a trusted fish food-safety guide when serving vulnerable guests.",
          ),
        ],
        references: [
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9",
          },
          {
            href: "https://www.seriouseats.com/sous-vide-cooking-temperature-and-timing-charts",
            label: "Serious Eats — sous vide temperature and timing charts",
          },
        ],
      };
    case "lobster":
    case "scallop":
    case "shrimp":
      return {
        cutId,
        notes: [
          t(
            "Shellfish times are short and assume fridge-cold pieces. Pull promptly at the recommended time — a few extra minutes toughens them.",
          ),
        ],
        references: [
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9",
          },
          {
            href: "https://www.seriouseats.com/sous-vide-cooking-temperature-and-timing-charts",
            label: "Serious Eats — sous vide temperature and timing charts",
          },
        ],
      };
    case "carrot":
    case "asparagus":
      return {
        cutId,
        notes: [
          t(
            "Quick vegetable baths assume fridge-cold produce at roughly stick thickness. Larger roots need longer.",
          ),
        ],
        references: [
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9",
          },
        ],
      };
    case "chuck":
      return {
        cutId,
        notes: [
          t(
            "Chuck (Swedish högrev) is a tough, collagen-rich roast. The long times here are for breaking connective tissue, not just heating the centre.",
          ),
          t(
            "Rare (57C / 24 h) stays sliceable and steak-like. Medium (64C / 16 h) moves toward pot-roast. Well done (82C / 8 h) is fully braised and pull-apart. Larger pieces may need toward the max time.",
          ),
          t(
            "Pat the roast very dry and sear hard in a ripping-hot pan or on the grill after the bath so you get a crust without cooking the interior further.",
          ),
        ],
        references: [
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — högrev (57 / 64 / 82C table)",
          },
          {
            href: "https://hagshult.se/guider-tips/stora-guiden-till-sous-vide/",
            label: "Hagshultskossorna — stora guiden (högrev 58–62C)",
          },
          {
            href: "https://www.gardssallskapet.se/kottguiden/recept/hogrev-sousvide-chimichurri",
            label: "Gårdssällskapet — högrev sous vide (57C / 24 h)",
          },
          {
            href: "http://www.kunskapskokboken.se/4.21514/varufakta/sa-lagas-hogrev-av-not/",
            label: "Kunskapskokboken — högrev sous vide (~58C / ~18 h)",
          },
          {
            href: "https://recipes.anovaculinary.com/recipe/sous-vide-medium-rare-chuck-roast",
            label: "Anova — medium-rare chuck roast (57C / 24–36 h)",
          },
        ],
      };
    default:
      return null;
  }
}

export function cutHasGuideDetail(options: {
  cutId: string;
  starts: ReadonlyArray<IngredientStart | null>;
  t: ContentT;
}) {
  if (getCutGuide(options.cutId, options.t) !== null) {
    return true;
  }
  return options.starts.some((start) => start !== null);
}
