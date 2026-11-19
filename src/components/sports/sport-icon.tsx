import { Bike, Car, CircleDot, Dumbbell, Flag, Goal, Medal, Mountain, Snowflake, Swords, Target, Trophy, Volleyball, Waves, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = { bike: Bike, car: Car, ball: CircleDot, dumbbell: Dumbbell, flag: Flag, goal: Goal, medal: Medal,
  mountain: Mountain, snowflake: Snowflake, swords: Swords, target: Target, trophy: Trophy, volleyball: Volleyball, waves: Waves };
// French display names (slugs are provider identifiers) mapped to an icon key; the stored Sport.icon wins when it is set.
const byName: [RegExp, string][] = [[/football|rugby|handball/u, "goal"], [/automobile|formule|rallye|moto/u, "car"], [/cyclisme|vélo/u, "bike"],
  [/natation|plongeon|aviron|voile|surf/u, "waves"], [/boxe|mma|judo|lutte|escrime|karaté/u, "swords"], [/volley/u, "volleyball"],
  [/basket|tennis|golf|baseball|cricket|badminton|hockey/u, "ball"], [/ski|patinage|biathlon/u, "snowflake"], [/escalade|alpinisme/u, "mountain"],
  [/haltérophilie|musculation/u, "dumbbell"], [/tir|archerie|fléchettes/u, "target"], [/athlétisme|triathlon/u, "medal"]];

export function SportIcon({ nameFr, icon, className }: { nameFr: string; icon: string | null; className?: string }) {
  const key = (icon && icons[icon] ? icon : byName.find(([pattern]) => pattern.test(nameFr.toLocaleLowerCase("fr")))?.[1]) ?? "trophy";
  const Icon = icons[key] ?? Trophy;
  return <Icon className={className} aria-hidden="true" />;
}
