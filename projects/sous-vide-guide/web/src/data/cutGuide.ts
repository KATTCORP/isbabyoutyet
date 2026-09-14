import type { IngredientStart } from "@/data/sousVide";
import type { ContentT } from "@/lib/content-t";

/**
 * Extra guidance for a cut card: notes and external sources.
 * Not every cut has a detail sheet — only time-sensitive or multi-source rows.
 */
type GuideReference = {
  href: string;
  label: string;
};

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
            "Poached (75C / 13-14 min) follows the high-and-fast method used by Anova and ChefSteps: set white, still-runny yolk. Soft and jammy rows are longer equilibrium baths closer to KitchenLab / Serious Eats.",
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
            href: "https://www.chefsteps.com/activities/perfect-sous-vide-poached-eggs",
            label: "ChefSteps — perfect poached eggs (75C / 13 min)",
          },
          {
            href: "https://www.seriouseats.com/sous-vide-101-all-about-eggs",
            label: "Serious Eats — guide to sous vide eggs (equilibrium baths)",
          },
          {
            href: KITCHENLAB_GUIDE_HREF,
            label: "KitchenLab — koksguide #9 (original table)",
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
