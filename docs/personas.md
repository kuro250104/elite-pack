# Personas

Trois personas guident le backlog d’Elite Pack : deux sont **imposés par le TD « Road to MVP »**, le troisième est **propre au projet**. Chaque besoin renvoie à une user story du [Jira SCRUM](https://lemeurvincent31.atlassian.net/jira/software/projects/SCRUM/boards/1/backlog) ; leur place dans le parcours est visible sur [la story map](story-map.md).

| | Persona | Type | Besoin principal | Story phare |
| --- | --- | --- | --- | --- |
| 🖥️ | [Gérard, l’éducateur du club-house](#gérard-léducateur-du-club-house) | Imposé | Jouer sur un écran cathodique 800x600 | [SCRUM-90](https://lemeurvincent31.atlassian.net/browse/SCRUM-90) |
| 📊 | [Inès, la compétitrice](#inès-la-compétitrice) | Imposé | Statistiques et gamification | [SCRUM-89](https://lemeurvincent31.atlassian.net/browse/SCRUM-89) |
| 🃏 | [Thomas, le collectionneur](#thomas-le-collectionneur) | Personnalisé | Compléter ses collections sans payer | [SCRUM-88](https://lemeurvincent31.atlassian.net/browse/SCRUM-88) |

---

## Gérard, l’éducateur du club-house

> « Je veux montrer les cartes de nos anciens joueurs aux gamins, mais sur notre vieil écran la moitié de la page dépasse. »

**Persona imposé : écran cathodique 800x600.**

| | |
| --- | --- |
| **Âge** | 67 ans |
| **Situation** | Retraité, bénévole d’un club de rugby amateur |
| **Équipement** | PC du club-house relié à un écran cathodique 15 pouces en **800x600**, souris, navigateur à jour, connexion ADSL lente |
| **Aisance numérique** | Faible : il zoome rarement, ne connaît pas les raccourcis |
| **Fréquence** | Deux fois par semaine, après les entraînements, avec les jeunes du club |

### Objectifs

- Ouvrir les boosters gratuits accumulés pendant la semaine.
- Montrer la fiche d’un athlète aux jeunes joueurs.
- Retrouver rapidement les cartes de rugby de la collection du club.

### Frustrations

- Les pages qui débordent et obligent à faire défiler horizontalement.
- Les textes trop petits et les contrastes faibles sur un écran cathodique.
- Les animations lentes qui figent un ordinateur ancien.

### Scénario

Gérard se connecte au compte du club, voit **« 10 / 10 — Stock plein »**, choisit **Rugby** et ouvre trois boosters. La révélation des cinq cartes doit tenir dans 600 px de haut, avec un bouton **Suivant** visible sans défiler.

### Ce que cela implique

| Besoin | Traduction dans le produit | Story |
| --- | --- | --- |
| Aucun défilement horizontal en 800x600 | Navigation compacte, grille de cartes à 3 colonnes | [SCRUM-90](https://lemeurvincent31.atlassian.net/browse/SCRUM-90) |
| Lisibilité | Texte d’au moins 14 px, contraste WCAG AA | [SCRUM-90](https://lemeurvincent31.atlassian.net/browse/SCRUM-90) |
| Ordinateur lent | Respect de `prefers-reduced-motion`, révélation simplifiée | [SCRUM-28](https://lemeurvincent31.atlassian.net/browse/SCRUM-28) |
| Non-régression | Test Playwright avec un viewport 800x600 | [SCRUM-90](https://lemeurvincent31.atlassian.net/browse/SCRUM-90) |

---

## Inès, la compétitrice

> « Si je ne vois pas ma progression, je n’ai aucune raison de revenir ouvrir mes boosters. »

**Persona imposé : besoin de statistiques et de gamification.**

| | |
| --- | --- |
| **Âge** | 19 ans |
| **Situation** | Étudiante en STAPS, joue au handball en club |
| **Équipement** | Smartphone récent ; ordinateur portable le soir |
| **Aisance numérique** | Élevée : joueuse régulière de jeux mobiles à objectifs |
| **Fréquence** | Plusieurs sessions courtes par jour, dès qu’un booster est disponible |

### Objectifs

- Mesurer sa progression : cartes possédées, éditions découvertes, raretés obtenues.
- Débloquer des succès et viser des objectifs concrets (« 10 boosters ouverts », « première carte Mythique »).
- Comparer ses statistiques de boosters d’une semaine à l’autre.

### Frustrations

- Ouvrir des boosters sans retour sur ce qu’elle a accompli.
- Ne pas savoir combien il lui manque de cartes pour compléter un sport.
- Les statistiques cachées dans des menus.

### Scénario

Inès ouvre son dixième booster dans le métro. L’écran de révélation affiche la notification **« Succès débloqué : 10 boosters ouverts »**. Sur son profil, elle voit le badge, sa date d’obtention et la barre de progression du succès suivant.

### Ce que cela implique

| Besoin | Traduction dans le produit | Story |
| --- | --- | --- |
| Objectifs et récompenses | Succès définis en base, débloqués côté serveur | [SCRUM-89](https://lemeurvincent31.atlassian.net/browse/SCRUM-89) |
| Statistiques personnelles | Boosters reçus, ouverts, stock actuel | [SCRUM-37](https://lemeurvincent31.atlassian.net/browse/SCRUM-37) |
| Progression de collection | Progression par sport, cartes manquantes | [SCRUM-31](https://lemeurvincent31.atlassian.net/browse/SCRUM-31) |
| Profil synthétique | Solde, cartes, éditions découvertes | [SCRUM-27](https://lemeurvincent31.atlassian.net/browse/SCRUM-27) |
| Usage mobile | Interfaces pensées pour le mobile, pas réduites | Toutes les stories front |

---

## Thomas, le collectionneur

> « Je collectionnais les vignettes Panini enfant. Ici je veux compléter mes séries sans sortir la carte bleue. »

**Persona personnalisé, propre à Elite Pack.**

| | |
| --- | --- |
| **Âge** | 34 ans |
| **Situation** | Développeur en télétravail, fan de Formule 1 et de rugby |
| **Équipement** | Ordinateur de bureau, grand écran ; mobile en complément |
| **Aisance numérique** | Élevée ; méfiant envers les jeux « pay-to-win » |
| **Fréquence** | Une longue session le soir, plusieurs fois par semaine |

### Objectifs

- Compléter toutes les éditions de ses athlètes favoris, y compris les éditions limitées numérotées.
- Savoir précisément quelles cartes lui manquent et où les trouver.
- Échanger ses doublons sur le marché à un prix juste.

### Frustrations

- Les probabilités opaques ou modifiées en douce.
- Les jeux où l’on progresse surtout en payant.
- Perdre la trace d’une carte qu’il cherchait.

### Scénario

Sur la fiche de Lewis Hamilton, Thomas repère l’édition **Golden** qu’il ne possède pas et l’ajoute à sa **liste de souhaits**. Le lendemain, sa liste affiche **« Disponible sur le marché »** : il l’achète avec les pièces gagnées en revendant ses doublons à la banque.

### Ce que cela implique

| Besoin | Traduction dans le produit | Story |
| --- | --- | --- |
| Suivre les cartes recherchées | Liste de souhaits reliée au marché | [SCRUM-88](https://lemeurvincent31.atlassian.net/browse/SCRUM-88) (stagiaire) |
| Voir ce qui manque | Onglet « Cartes manquantes », éditions possédées et manquantes | [SCRUM-31](https://lemeurvincent31.atlassian.net/browse/SCRUM-31), [SCRUM-32](https://lemeurvincent31.atlassian.net/browse/SCRUM-32) |
| Probabilités transparentes | Probabilités affichées et configurées en base | [SCRUM-39](https://lemeurvincent31.atlassian.net/browse/SCRUM-39) |
| Échanges équitables | Marché atomique, revente à la banque | [SCRUM-34](https://lemeurvincent31.atlassian.net/browse/SCRUM-34), [SCRUM-33](https://lemeurvincent31.atlassian.net/browse/SCRUM-33) |
| Rareté réelle | Éditions limitées numérotées (`0042 / 0500`) | [SCRUM-29](https://lemeurvincent31.atlassian.net/browse/SCRUM-29) |

---

## Utiliser les personas

- **À l’affinage** : chaque nouvelle story cite le persona qu’elle sert. Une story qui ne sert aucun persona doit être justifiée.
- **En revue de PR** : une modification d’interface est vérifiée en 800x600 (Gérard) et sur mobile (Inès).
- **Dans les tests** : le parcours de Gérard est couvert par un test Playwright en 800x600 ; celui d’Inès par le déblocage d’un succès ; celui de Thomas par l’ajout à la liste de souhaits.

Les stories issues de ces personas sont [SCRUM-88](https://lemeurvincent31.atlassian.net/browse/SCRUM-88) (liste de souhaits, US du stagiaire), [SCRUM-89](https://lemeurvincent31.atlassian.net/browse/SCRUM-89) (succès de collection) et [SCRUM-90](https://lemeurvincent31.atlassian.net/browse/SCRUM-90) (écran 800x600).
