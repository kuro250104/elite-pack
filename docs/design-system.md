# Système de design

La fondation visuelle utilise Tailwind CSS 4 et les conventions shadcn/ui, avec composants locaux adaptés selon la documentation Radix : `Button`, `Badge`, `Card` et `Input`. `components.json` prépare le CLI, les alias `@/` et les variables CSS. Ce choix évite une bibliothèque de composants opaque et permet de relire les modifications de chaque composant.

Le thème sombre est défini dans `src/app/globals.css`. Fond anthracite, surfaces légèrement éclaircies, texte clair et accent or pâle. Les couleurs des raretés sont exposées par les tokens `rarity-common`, `rarity-uncommon`, `rarity-rare`, `rarity-epic`, `rarity-legendary` et `rarity-mythic` : gris, vert, bleu, violet, or et rouge. Ces couleurs ne remplacent jamais les noms français des raretés. Les probabilités ne sont pas des tokens visuels : elles viendront de PostgreSQL.

Les titres et paragraphes utilisent une police système, sans téléchargement au build. Les composants de présentation restent compatibles avec les Server Components. Une frontière `use client` sera ajoutée uniquement aux contrôles interactifs nécessaires. Aucune animation ni donnée de jeu fictive n’est requise sur la page de fondation.

## Accessibilité

- Document en français, navigation nommée et lien d’évitement vers le contenu.
- Titres hiérarchisés, icônes décoratives masquées aux lecteurs d’écran.
- Focus visible et cibles tactiles de 44 pixels pour les contrôles principaux.
- Texte des formulaires relié par `label` et `htmlFor`; erreurs reliées par `aria-describedby` et `aria-invalid`.
- Les préférences de réduction des mouvements neutralisent les transitions.
- Grilles sur une colonne sur mobile et trois colonnes lorsque l’espace le permet.

## Sources

- [Installation manuelle shadcn/ui](https://ui.shadcn.com/docs/installation/manual)
- [Button Radix shadcn/ui](https://ui.shadcn.com/docs/components/radix/button)
- [Server et Client Components Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Frontière client React](https://react.dev/reference/rsc/use-client)

Ces recommandations sont appliquées à la structure. La validation finale comprend lint, TypeScript, build et navigation Playwright, avec inspection mobile si le navigateur est disponible.
