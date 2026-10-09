# AGENTS.md — Multisport Athlete TCG

## 1. Project Overview

This project is a multiplayer online Trading Card Game (TCG)
featuring real-world athletes from as many sports as possible.

Players can:
- Create accounts and manage their profiles.
- Collect athlete cards.
- Open sport-specific or multisport boosters.
- Receive free boosters passively.
- Obtain multiple editions of the same athlete.
- Own duplicate cards.
- Sell cards to the game bank.
- Trade and sell cards through a marketplace.
- Complete collections and participate in events.
- Earn and spend virtual currency.

The application must be entirely in French.

All user-facing content must be written in French.

Code identifiers, database fields and technical documentation
may use English.

### Core principles

- Free-to-play first.
- Fair and transparent booster probabilities.
- Secure server-side game logic.
- Accurate sports data.
- Scalable architecture.
- Modular and maintainable code.
- Responsive and accessible interface.
- Expandable sports catalogue.

---

## 2. Technology Stack

Use the following technologies:

### Frontend
- Next.js App Router
- React
- TypeScript (strict mode)
- Tailwind CSS
- shadcn/ui
- Motion / Framer Motion
- Lucide Icons

### Backend
- Next.js Route Handlers
- TypeScript
- Zod
- Server-side domain services

### Database
- PostgreSQL
- Prisma ORM

### Authentication
- Auth.js
- Secure HTTP-only sessions
- Password hashing when credentials authentication is used

### Testing
- Vitest
- Playwright
- ESLint
- TypeScript type checking

### Infrastructure
- Vercel-compatible architecture
- PostgreSQL database
- S3-compatible object storage if necessary
- Environment variables for secrets

Always inspect the existing repository before installing
dependencies or changing architecture.

Prefer React Server Components.

Use Client Components only when required.

---

## 3. Project Architecture

Use a domain-oriented architecture.

Suggested structure:

src/
├── app/
│   ├── (auth)/
│   │   ├── connexion/
│   │   └── inscription/
│   │
│   ├── (game)/
│   │   ├── dashboard/
│   │   ├── collection/
│   │   ├── boosters/
│   │   ├── marche/
│   │   ├── athletes/
│   │   └── profil/
│   │
│   ├── admin/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── cards/
│   ├── boosters/
│   ├── collection/
│   ├── marketplace/
│   └── layout/
│
├── server/
│   ├── athletes/
│   ├── sports/
│   ├── cards/
│   ├── boosters/
│   ├── economy/
│   ├── marketplace/
│   └── imports/
│
├── providers/
│   ├── thesportsdb/
│   ├── wikidata/
│   └── olympedia/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── validations/
│   └── utils/
│
├── hooks/
├── types/
└── config/

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

tests/
├── unit/
├── integration/
└── e2e/

Keep business logic separate from UI components.

API handlers should remain thin.

Business rules belong in domain services.

Do not put complex business logic directly in React components.

---

## 4. Sports Data Sources

The main sports data provider is TheSportsDB.

Additional sources:

- Wikidata
- Wikimedia Commons
- Olympedia
- Paris 2024 datasets
- Other free sports APIs when useful

### TheSportsDB

Use TheSportsDB as the primary source for:

- Athlete identity
- Sport
- Team
- Nationality
- Position
- Birth date
- Athlete biography
- Available statistics
- Available image references

Do not assume every field is available for every athlete.

Respect the free API rate limits.

Do not depend on live API calls during booster openings.

Import and cache athlete data in PostgreSQL.

### Wikidata

Use Wikidata to enrich athletes with:

- External identifiers
- Nationality
- Birth date
- Career information
- Achievements
- Image references

Deduplicate athletes across providers.

### Images and licensing

Never assume an athlete image is free for commercial use.

Store:
- Image source
- License information
- Attribution
- Original URL
- Usage restrictions

Only display images that have compatible usage rights.

An athlete may have no image.

Provide a fallback visual for missing images.

### Provider architecture

Create reusable provider interfaces.

Example:

interface AthleteProvider {
getAthlete(id: string): Promise<ExternalAthlete | null>;

searchAthletes(query: string): Promise<ExternalAthlete[]>;

getAthletesBySport(
sportId: string
): Promise<ExternalAthlete[]>;
}

Actual provider implementations must respect
the capabilities of their external APIs.

Do not invent unsupported endpoints.

---

## 5. Sports Catalogue

The application must support as many sports as possible.

Sports are stored dynamically in PostgreSQL.

Do not hardcode the complete catalogue.

Each sport has:

- ID
- Internal slug
- French name
- Original provider name
- Category
- Icon
- Active status
- Athlete count

Examples:

- Football
- Basketball
- Tennis
- Formule 1
- Rugby
- Cyclisme
- Athlétisme
- Natation
- Boxe
- MMA
- Golf
- Volleyball
- Baseball
- Hockey sur glace
- Football américain
- Cricket
- Badminton
- Tennis de table
- Handball
- Sports automobiles

Administrators can enable or disable sports.

Only enabled sports can be selected for boosters.

Sport names displayed to users must always be in French.

---

## 6. Athlete Model

An athlete represents a real-world person.

Athletes must not be duplicated when imported
from multiple providers.

Each athlete may have:

- ID
- Full name
- Birth date
- Nationality
- Sport
- Current team
- Biography
- Statistics
- Achievements
- Image
- Prestige score
- External provider identifiers

An athlete can have multiple card editions.

An athlete is not itself a card.

Never confuse Athlete, CardEdition and CardInstance.

---

## 7. Card System

The card system contains three distinct concepts.

### Athlete

Represents the real athlete.

Example:

Kylian Mbappé

### CardEdition

Represents a collectible edition of that athlete.

Example:

- Mbappé Standard
- Mbappé Silver
- Mbappé Champions
- Mbappé Golden
- Mbappé World Champion

Each edition contains:

- ID
- Athlete ID
- Edition name
- Rarity
- Visual design
- Base value
- Maximum supply (optional)
- Minted supply
- Active status
- Release date

### CardInstance

Represents one individual copy of a card edition.

Each instance contains:

- ID
- Edition ID
- Owner ID
- Serial number (optional)
- Mint date
- Acquisition date
- Acquisition source

### Ownership rules

An athlete can have multiple editions.

An edition can have multiple instances.

A player may own multiple instances of the same edition.

Different players may own the same edition.

Each individual instance can have only one owner at a time.

Limited editions must never exceed their maximum supply.

Unlimited editions can generate additional instances.

All card minting and ownership changes must be
transactional and concurrency-safe.

---

## 8. Card Rarity System

The game supports six rarity levels.

| Rarity | French Name | Probability |
|--------|-------------|-------------|
| COMMON | Commune | 55% |
| UNCOMMON | Peu commune | 25% |
| RARE | Rare | 12% |
| EPIC | Épique | 5% |
| LEGENDARY | Légendaire | 2.5% |
| MYTHIC | Mythique | 0.5% |

These probabilities are initial default values.

They must be configurable from the database.

Never permanently hardcode probabilities.

### Important distinction

Athlete prestige and card rarity are separate concepts.

Athlete prestige represents sporting achievement.

Card rarity represents collectible scarcity.

A famous athlete can have a common edition.

A common athlete can receive a special rare edition.

### Example

Kylian Mbappé:

- Standard — COMMON
- Silver — RARE
- Champions — EPIC
- Golden — LEGENDARY
- World Champion — MYTHIC

Each edition can have a different supply limit.

### Prestige score

Athletes have a prestige score from 0 to 100.

The score may use:

- Olympic medals
- World championships
- Major titles
- Individual awards
- Career achievements
- Competitive level
- Statistical performance

Scoring must be sport-specific.

Do not directly compare unrelated sports statistics.

Normalize scores within relevant sporting categories.

Administrators may manually override computed scores.

---

## 9. Card Supply

Card editions support two supply modes.

### Unlimited

No maximum supply.

New instances can be minted whenever an eligible
booster selects the edition.

Recommended for standard editions.

### Limited

A maximum supply is configured.

Example:

- Champions: 5000
- Golden: 500
- World Champion: 50

These values are illustrative and configurable.

Limited editions may have serial numbers.

Example:

0042 / 0100

The database must enforce supply limits.

Concurrent minting must not exceed maximum supply.

When an edition is sold out, it must no longer be
eligible for new booster minting.

Existing instances remain tradable.

---

## 10. Booster System

Players can open boosters containing athlete cards.

Default booster size:

5 cards.

Booster size must be configurable.

### Booster types

Supported booster categories:

- Football
- Basketball
- Tennis
- Formule 1
- Rugby
- Cyclisme
- MMA
- Athlétisme
- Olympique
- Multisport

Additional sports should be automatically supported
when enough eligible athlete cards exist.

### Booster eligibility

A sport-specific booster only contains editions
associated with eligible athletes from that sport.

A multisport booster may contain cards from
multiple enabled sports.

An event booster may restrict cards by:

- Sport
- Competition
- Season
- Edition
- Rarity
- Event period

### Booster opening process

1. Validate authentication.
2. Validate booster ownership or available stock.
3. Validate selected booster type.
4. Verify eligible edition pools.
5. Determine rarity using weighted probabilities.
6. Select an eligible card edition.
7. Mint a card instance.
8. Assign ownership to the player.
9. Consume the booster.
10. Record the opening.

All critical operations must be transactional.

### Randomness

Use cryptographically secure server-side randomness.

Never use Math.random() for authoritative openings.

Never calculate rarity on the client.

### Empty pools

Handle exhausted rarity pools explicitly.

Do not use infinite retry loops.

Do not silently alter advertised probabilities.

If an opening cannot satisfy its configured rules,
reject it without consuming the booster.

### Duplicate cards

Duplicates are allowed.

A player may receive the same athlete multiple times.

A player may receive multiple editions of the same athlete.

A player may receive multiple copies of one edition.

---

## 11. Passive Booster Generation

Every player receives one free booster every 15 minutes.

### Configuration

PASSIVE_BOOSTER_INTERVAL_SECONDS = 900

PASSIVE_BOOSTER_MAX_STOCK = 10

### Rules

- Generate 1 booster every 15 minutes.
- Passive stock cannot exceed 10.
- Generation works while the player is offline.
- Generation does not require an open browser.
- Generation pauses when stock reaches 10.
- No additional boosters accumulate at maximum stock.
- Generation resumes after stock decreases.
- If stock was full, a fresh 15-minute cycle begins
  when a booster is consumed.
- If stock was below maximum, preserve the remaining
  time until the next generation.
- Newly registered players start with 0 passive boosters.

### Important

Passive boosters are generic.

Players choose the sport when opening them.

Example:

A player has 7 passive boosters.

The player can open:
- 3 Football boosters
- 2 Basketball boosters
- 2 Tennis boosters

Each opening consumes one passive booster.

### Stock examples

After 15 minutes:
1/10

After 1 hour:
4/10

After 2 hours 30 minutes:
10/10

After 24 hours without activity:
10/10

If a player consumes 5 boosters while at maximum stock:

Stock becomes 5/10.

A new generation cycle begins.

### Backend implementation

Do not create an individual cron job per user.

Calculate accumulated boosters lazily using
server-side timestamps.

Recommended fields:

- userId
- stock
- nextGenerationAt
- updatedAt

Use the database as the authoritative state.

Use atomic transactions.

Prevent concurrent double claims.

Never trust the client's clock.

The frontend countdown is informational only.

### API

GET /api/boosters/passive

Response example:

{
"stock": 7,
"maxStock": 10,
"intervalSeconds": 900,
"nextGenerationAt": "2026-10-09T13:15:00Z"
}

Use the configured interval and server timestamps
when computing the real response.

---

## 12. Booster Interface

The booster interface must display:

- Available passive boosters
- Maximum stock
- Time until next booster
- Selected sport
- Booster artwork
- Opening button
- Opening animation
- Revealed cards

Example:

BOOSTERS GRATUITS

7 / 10

Prochain booster :
08:42

+1 booster toutes les 15 minutes

[CHOISIR UN SPORT]

[OUVRIR UN BOOSTER]

When stock is full, display:

Stock plein — 10/10

When stock is empty, disable opening.

Use smooth animations.

Support reduced-motion accessibility settings.

---

## 13. Player Collection

Players can view all owned card instances.

### Filters

- Sport
- Rarity
- Country
- Athlete
- Team
- Edition
- Collection status

### Sorting

- Rarity
- Prestige score
- Market value
- Acquisition date
- Athlete name

### Collection view

Display cards in a responsive grid.

Support pagination.

Show duplicate counts.

Allow filtering by missing editions.

### Athlete encyclopedia

Every athlete has a detail page.

Possible information:

- Biography
- Nationality
- Sport
- Team
- Career statistics
- Achievements
- Available editions

Detailed collectible information may be locked
until the player has obtained the relevant card.

Store discovery history separately from ownership.

Selling a card must not erase historical discovery.

---

## 14. Virtual Economy

The game uses an internal virtual currency.

All wallet balances must use integers.

Never use floating-point arithmetic for balances.

### Wallet

Each player has a wallet.

The wallet stores:

- Current balance
- Lifetime earnings
- Lifetime spending

Maintain a transaction ledger.

### Transaction types

- INITIAL_BALANCE
- REWARD
- BANK_SALE
- MARKETPLACE_SALE
- MARKETPLACE_PURCHASE
- BOOSTER_PURCHASE
- ADMIN_ADJUSTMENT

All balance changes must be recorded.

### Security

Never allow negative balances.

Never trust balances sent by the frontend.

Wallet operations must be transactional.

Use idempotency protections.

---

## 15. Bank Resale

Players can sell card instances to the game bank.

The bank pays a configurable percentage
of the card's base value.

Example:

Base value: 1000 coins

Bank resale percentage: 60%

Player receives: 600 coins

These values must remain configurable.

### Resale process

1. Verify ownership.
2. Verify card is not listed on the marketplace.
3. Calculate resale price.
4. Remove ownership.
5. Credit player wallet.
6. Record transaction.

For the MVP, bank-resold instances are retired.

They no longer appear in the player's collection.

Bank resale does not reduce the historical
minted supply of limited editions.

Do not re-mint retired limited instances.

All operations must be atomic.

---

## 16. Player Marketplace

Players may sell cards to other players.

### Features

- Create listing
- Set selling price
- Cancel listing
- Browse listings
- Filter by rarity
- Filter by sport
- Search athletes
- Purchase cards
- View transaction history

### Business rules

A player can only list cards they own.

A card can have only one active listing.

Listed cards cannot be sold to the bank.

A player cannot purchase their own listing.

Purchases must transfer ownership atomically.

### Purchase transaction

1. Verify active listing.
2. Verify buyer balance.
3. Lock or conditionally reserve listing.
4. Debit buyer.
5. Credit seller.
6. Transfer card ownership.
7. Close listing.
8. Record transaction.

Prevent:

- Double purchases
- Negative balances
- Duplicate active listings
- Unauthorized transfers
- Concurrent ownership conflicts

Use PostgreSQL transactions.

---

## 17. Administration

Administrators require a protected dashboard.

### Athlete management

- View imported athletes
- Search athletes
- Edit athlete data
- Override prestige scores
- Manage images
- Disable athletes

### Sports management

- View sports
- Enable sports
- Disable sports
- Translate display names

### Card management

- Create editions
- Configure rarity
- Configure supply
- Activate editions
- Disable editions

### Booster management

- Create booster types
- Configure eligible sports
- Configure probabilities
- Configure card counts
- Configure events

### Economy management

- Configure starting balance
- Configure resale percentages
- Configure reward amounts

### Analytics

Display:

- Total users
- Total athletes
- Total editions
- Total minted cards
- Cards by rarity
- Passive boosters generated
- Boosters opened
- Marketplace transactions

All administrative changes must be authorized.

Record sensitive configuration changes.

---

## 18. API Conventions

Use Next.js Route Handlers.

### Athletes

GET /api/athletes
GET /api/athletes/:id

### Sports

GET /api/sports
GET /api/sports/:id

### Cards

GET /api/cards
GET /api/cards/:id

### Authentication

Use the configured Auth.js routes.

### Player

GET /api/me
GET /api/me/cards
GET /api/me/wallet

### Boosters

GET /api/boosters
GET /api/boosters/passive
POST /api/boosters/open
GET /api/boosters/history

### Marketplace

GET /api/marketplace
POST /api/marketplace/listings
DELETE /api/marketplace/listings/:id
POST /api/marketplace/listings/:id/buy

### Admin

GET /api/admin/stats
GET /api/admin/imports
POST /api/admin/imports
PATCH /api/admin/athletes/:id
PATCH /api/admin/editions/:id

### API requirements

Validate input using Zod.

Use consistent response structures.

Apply authentication checks.

Apply authorization checks.

Implement rate limiting.

Use pagination for large collections.

Never expose internal secrets.

---

## 19. Frontend Design

The interface must feel like a modern premium TCG.

### Visual direction

- Dark modern interface
- Strong card identity
- High-quality typography
- Clear rarity hierarchy
- Smooth booster animations
- Responsive layouts
- Consistent spacing
- Accessible controls

### Rarity colors

COMMON:
Neutral gray

UNCOMMON:
Green

RARE:
Blue

EPIC:
Purple

LEGENDARY:
Gold

MYTHIC:
Red

Use consistent design tokens.

### Card design

A card should prominently display:

- Athlete image
- Name
- Sport
- Nationality
- Rarity
- Edition name
- Prestige score

Additional information should remain readable
without overcrowding the card.

### Mobile support

The application must work on:

- Desktop
- Tablet
- Mobile

Design mobile layouts intentionally.

Do not simply shrink desktop interfaces.

---

## 20. Security Requirements

Never trust client-side values for:

- Wallet balances
- Card ownership
- Booster stock
- Booster probabilities
- Booster results
- Market transaction amounts
- Generation timers
- Rarity rolls

All critical game logic must execute server-side.

### Mandatory protections

- Secure authentication
- Role-based authorization
- Zod validation
- Rate limiting
- Atomic database transactions
- Idempotency for critical operations
- Secure randomness
- Input sanitization where appropriate
- CSRF protections where applicable

Never expose API keys.

Never commit environment secrets.

Never allow the frontend to mint cards directly.

---

## 21. Testing Requirements

Use Vitest for domain logic.

Use integration tests for database transactions.

Use Playwright for essential user flows.

### Required tests

#### Athletes

- Import an athlete.
- Deduplicate external records.
- Map sports correctly.
- Preserve administrator overrides.

#### Cards

- Create card editions.
- Mint unlimited editions.
- Mint limited editions.
- Prevent supply overflow.
- Assign ownership correctly.
- Allow duplicate editions.

#### Boosters

- Validate configured probabilities.
- Select correct sport.
- Prevent invalid openings.
- Handle empty pools.
- Prevent duplicate consumption.
- Prevent concurrent supply overflow.

#### Passive generation

- Generate one booster after 15 minutes.
- Generate four boosters after one hour.
- Stop at ten boosters.
- Accumulate while offline.
- Resume after consumption.
- Preserve partial interval progress.
- Prevent concurrent double consumption.

#### Marketplace

- Create listing.
- Cancel listing.
- Purchase listing.
- Prevent double purchase.
- Prevent negative wallet balance.
- Transfer card ownership.
- Prevent purchasing own listing.

All economy-critical tests must pass.

---

## 22. Performance Requirements

Do not call TheSportsDB during booster openings.

Use PostgreSQL as the primary source of game data.

Cache stable athlete information when appropriate.

Paginate large queries.

Avoid N+1 database queries.

Index frequently queried fields.

Recommended indexes include:

- Athlete.sportId
- Athlete.name
- CardEdition.athleteId
- CardEdition.rarity
- CardInstance.ownerId
- MarketplaceListing.status
- MarketplaceListing.price

Review indexes based on actual query patterns.

Avoid unnecessary frontend data fetching.

---

## 23. Internationalization

The application language is French.

All interface labels must be French.

Examples:

"Collection"
"Boosters"
"Marché"
"Mon profil"
"Cartes disponibles"
"Prochain booster"
"Stock plein"
"Rareté"
"Valeur"

Use French locale formatting.

Dates:

fr-FR

Currency:

Virtual currency displayed consistently.

Use stable English identifiers internally.

Do not automatically translate athlete names.

Translate sports, positions and interface terminology
when reliable translations are available.

---

## 24. Development Workflow

Before implementing a feature:

1. Inspect the existing repository.
2. Read the relevant instructions.
3. Identify affected domain models.
4. Inspect existing database migrations.
5. Review related tests.
6. Identify security implications.

During development:

1. Implement small changes.
2. Respect existing architecture.
3. Separate UI and business logic.
4. Add validation.
5. Write tests for critical rules.
6. Avoid unrelated refactoring.

After implementation:

1. Run lint.
2. Run type checking.
3. Run relevant tests.
4. Review database migrations.
5. Verify security-sensitive operations.
6. Summarize changes in French.

Never modify unrelated functionality.

Never reset production data without explicit approval.

Do not perform destructive migrations automatically.

---

## 25. Codex Skills

Before starting a task, inspect the skills
available in the current environment.

Use relevant skills when available.

### Frontend and UI

Prefer:

- Impeccable
- Vercel React Best Practices
- Web Design Guidelines

Use them for:

- Interface design
- Component architecture
- Accessibility
- Responsive layouts
- React performance
- Visual consistency

### Backend and database

Use relevant available skills for:

- Next.js
- TypeScript
- Prisma
- PostgreSQL
- REST API design
- Authentication
- Security

### Testing

Use relevant available skills for:

- Playwright
- Vitest
- Integration testing
- Code review

Do not assume a skill exists.

Do not install unverified skills blindly.

Always review skill instructions before applying them.

Prioritize project instructions over generic suggestions.

---

## 26. Implementation Priorities

Implement features in the following order.

### Phase 1 — Foundation

- Initialize Next.js
- Configure TypeScript
- Configure Tailwind
- Configure shadcn/ui
- Configure PostgreSQL
- Configure Prisma
- Configure authentication
- Establish project architecture

### Phase 2 — Athlete data

- Implement TheSportsDB provider
- Import sports
- Import athletes
- Deduplicate data
- Enrich with Wikidata
- Create athlete models

### Phase 3 — Cards

- Implement prestige scores
- Implement rarity system
- Implement CardEdition
- Implement CardInstance
- Implement supply management
- Implement ownership

### Phase 4 — Boosters

- Implement booster types
- Implement weighted selection
- Implement secure card minting
- Implement passive generation
- Implement opening animations

### Phase 5 — Collection

- Implement collection page
- Implement filters
- Implement athlete encyclopedia
- Implement discovery tracking

### Phase 6 — Economy

- Implement wallet
- Implement bank resale
- Implement marketplace
- Implement transaction history

### Phase 7 — Administration

- Implement admin dashboard
- Implement athlete management
- Implement economy configuration
- Implement analytics

Do not implement advanced features before
the required foundational systems are stable.

---

## 27. Agent Communication

Respond to the developer in French.

When completing a task, provide:

1. Summary of changes
2. Files created or modified
3. Database migrations
4. Tests executed
5. Remaining limitations
6. Recommended next development step

Do not claim tests passed unless they were executed.

If a critical architectural decision is necessary,
explain the tradeoffs before implementation.

Preserve consistency with the existing project.

---

## 28. Non-Negotiable Rules

1. The application must be in French.

2. TheSportsDB is the primary athlete data source.

3. The game must support multiple sports.

4. An athlete can have multiple card editions.

5. Each edition has its own rarity.

6. Each edition can have unlimited or limited supply.

7. Multiple players can own copies of the same edition.

8. Each individual card instance has only one owner.

9. Duplicate cards are allowed.

10. Booster results are determined server-side.

11. Rarity probabilities must be configurable.

12. Passive boosters generate every 15 minutes.

13. Passive booster stock is capped at 10.

14. Passive generation works while offline.

15. Passive generation pauses at maximum stock.

16. Players choose the sport when opening passive boosters.

17. All economy operations must be transactional.

18. The marketplace must prevent double spending.

19. External API usage must respect rate limits.

20. Athlete images must respect licensing requirements.

21. The frontend must never control authoritative game state.

22. All critical domain logic must be tested.

23. Never introduce unnecessary dependencies.

24. Never modify unrelated functionality.

25. Always read this AGENTS.md before beginning a task.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


---

## 29. Exigences du TD POC

Les exigences du TD POC complètent ce document : consulter `docs/poc-conformite.md`, `CONTRIBUTING.md`, `GUIDELINES.md` et `docs/workflow.md` avant toute nouvelle phase.

- Conserver un README développeur expliquant contexte, fonctionnalité principale, installation et limites réelles du POC.
- Suivre GitHub Flow et SemVer; relier chaque branche/PR à un ticket.
- Utiliser GitHub Projects avec relations natives parent/sous-issue, au moins quatre EPICs et enfants frontend/backend pour chacun.
- Maintenir labels, priorités, estimations, board et cycle de vie des tickets avec DoR/DoD.
- Vérifier les automatisations réellement actives; ne jamais confondre un fichier local et une configuration distante.
- Prioriser la conformité du POC et le strict socle avant d’étendre le MVP.
- Renseigner les liens réels du dépôt et du Project dans la feuille de suivi lorsque les accès et la ligne du groupe sont établis.
- Ne pas présenter le rendu complet tant que les éléments externes manquants ne sont pas vérifiés.
