# AI Engineering Operating Standard 2026

> A practical, senior-level engineering standard for building secure, maintainable, high-performance software with AI assistance.
>
> Use this file as a project-level AI/developer instruction file. If you use Claude Code, rename or copy this file to `CLAUDE.md`. If you use multiple AI agents, keep it as `AGENTS.md` or `ENGINEERING_STANDARD.md`.

---

## 0. Purpose

This document defines how software should be planned, built, reviewed, tested, shipped, and maintained.

It is designed for serious full-stack, mobile, and AI-assisted development in 2026. It favors:

- Correctness over speed
- Simplicity over cleverness
- Security over convenience
- Maintainability over short-term hacks
- Explicit tradeoffs over hidden assumptions
- Measured performance over vibes
- Human judgment over blind rules

This is not a motivational document. It is an operating system for engineering work.

---

## 1. Non-Negotiable Engineering Principles

### 1.1 Correctness First

A fast wrong solution is still a failure.

Before optimizing for speed, elegance, or developer experience, make sure the system does the correct thing under normal, edge, and failure conditions.

Every implementation should answer:

- What should happen?
- What can go wrong?
- How do we know it works?
- How do we know when it breaks?
- Can a future developer understand this without asking the original author?

### 1.2 Simplicity Is a Feature

Prefer the simplest design that satisfies the real requirements.

Avoid architecture that exists only because it looks senior. Complexity must be earned.

Good simplicity means:

- Fewer moving parts
- Fewer dependencies
- Clear boundaries
- Predictable behavior
- Easy local development
- Easy rollback
- Easy debugging

Bad simplicity means:

- Ignoring edge cases
- Hiding complexity in utilities
- Skipping validation
- Mixing unrelated responsibilities
- Making future changes dangerous

### 1.3 No Surprises

Code should behave the way a careful reader expects.

Avoid:

- Hidden side effects
- Global mutable state
- Magic naming conventions
- Implicit data transformations
- Silent error swallowing
- "It works because the framework does something special"

If behavior is non-obvious, document the reason.

### 1.4 Own the Outcome

Do not only complete the ticket. Own the user outcome.

A task is not done when code compiles. A task is done when:

- The user problem is solved
- The solution is tested
- The failure modes are handled
- The performance impact is acceptable
- The security impact is reviewed
- The change is documented where needed
- A future developer can maintain it

### 1.5 Minimal Footprint

Touch the smallest safe surface area.

Do not refactor adjacent code, rename files, reformat large areas, remove comments, delete "unused" code, or change architecture unless the task requires it.

Small, surgical diffs are easier to review and safer to ship.

---

## 2. AI-Assisted Development Rules

AI can accelerate engineering. It can also confidently create broken systems.

The AI assistant must behave like a careful senior engineer, not a code generator.

### 2.1 Before Starting Work

For non-trivial tasks, state:

```text
ASSUMPTIONS
1. ...
2. ...

PLAN
1. ...
2. ...
3. ...

RISKS
1. ...
```

Then proceed unless the human redirects.

For simple tasks, skip ceremony and execute directly.

### 2.2 When Requirements Are Ambiguous

Do not silently invent requirements.

If the ambiguity can materially change the implementation, ask one targeted question.

If the task can still be safely advanced, proceed with a clearly stated assumption.

Bad:

```text
I'll just assume authentication means email/password.
```

Good:

```text
Assuming authentication means email/password for now. I will isolate the auth provider behind an adapter so Clerk, Better Auth, or OAuth can be swapped later.
```

### 2.3 When to Push Back

Push back when the requested approach creates clear risk.

Push back on:

- Security shortcuts
- Data loss risk
- Unnecessary rewrites
- Unmaintainable abstractions
- Premature microservices
- Over-engineered simple features
- Under-engineered critical systems
- Performance claims without measurement
- UI changes that hurt accessibility
- Changes that hide bugs instead of fixing them

Use this format:

```text
CONCERN
...

WHY IT MATTERS
...

BETTER OPTION
...
```

### 2.4 After Making Changes

Summarize changes like this:

```text
CHANGES MADE
- file: what changed and why

VALIDATION
- command run
- test result
- manual check

INTENTIONALLY UNTOUCHED
- file/area: reason

RISKS / FOLLOW-UP
- ...
```

Never claim success without evidence.

### 2.5 Confusion Protocol

When the system, requirements, or code contradict each other:

1. Stop expanding the change.
2. Name the exact contradiction.
3. Explain the tradeoff.
4. Propose the safest next move.
5. Continue only when safe, or ask for direction.

### 2.6 No Fake Certainty

Never say:

- "This definitely fixes it" unless verified
- "This is production-ready" unless tested
- "There are no bugs" unless the claim is scoped
- "Best practice" without context
- "Modern" without naming why

Prefer:

- "This should fix the issue because..."
- "Verified with..."
- "The remaining risk is..."
- "For this project, the better tradeoff is..."

---

## 3. Project Start Standard

### 3.1 Required Discovery

Before building a new serious project, answer:

- What problem are we solving?
- Who are the users?
- What is the primary user journey?
- What must work on day one?
- What can wait?
- What does success look like in 6 months?
- What would make this project fail?
- What are the performance requirements?
- What are the security/privacy requirements?
- What data is stored?
- Who can access that data?
- What are the compliance or platform constraints?
- What must be measurable after launch?

### 3.2 Spec Before Serious Code

For non-trivial features, create or update:

```text
docs/spec.md
```

Minimum content:

```markdown
# Feature Spec: [Name]

## Problem
...

## Users
...

## Goals
...

## Non-Goals
...

## User Stories
...

## Data Model
...

## API Contract
...

## UI States
- Loading
- Empty
- Success
- Error
- Permission denied

## Edge Cases
...

## Security Considerations
...

## Performance Considerations
...

## Rollout Plan
...

## Test Plan
...
```

For tiny bug fixes, a full spec is not required. Update the issue, PR description, or `tasks/todo.md`.

### 3.3 Decision Log

Every project should maintain:

```text
docs/decisions.md
```

Use Architecture Decision Records for meaningful choices:

```markdown
# ADR-001: Use PostgreSQL as Primary Database

## Status
Accepted

## Context
...

## Decision
...

## Consequences
...

## Alternatives Considered
...
```

---

## 4. Default 2026 Full-Stack Stack

The stack is a default, not a religion. Change it when the product requires it.

### 4.1 Web Application Defaults

```text
Framework:       Next.js App Router
Language:        TypeScript strict mode
UI:              React 19+
Styling:         Tailwind CSS v4+ with CSS variables
Components:      shadcn/ui or project-owned primitives
Server state:    TanStack Query v5
Client state:    Zustand or React state
Forms:           React Hook Form + Zod
Validation:      Zod, Valibot, or Standard Schema-compatible validation
Testing:         Vitest + Testing Library + Playwright
API mocking:     MSW
Charts:          Recharts, Tremor, or lightweight charting when needed
Animations:      CSS first, Framer Motion only when justified
Package manager: pnpm via Corepack
Runtime:         Node.js active LTS
Hosting:         Cloudflare Pages is always in scope for frontend/full-stack deployment
Edge runtime:    Cloudflare Pages Functions / Workers when edge execution is useful
```

### 4.2 Backend Defaults

```text
Runtime:         Node.js active LTS
API:             Route Handlers, tRPC, GraphQL, or REST with OpenAPI
Database:        PostgreSQL by default
Cloudflare DB:   Cloudflare D1 / Cloudflare database must always be considered when the project fits edge/serverless data needs
ORM:             Drizzle or Prisma based on team needs
Cache:           Redis / Upstash when caching is actually needed
Edge platform:   Cloudflare Workers / Pages Functions are first-class backend options when appropriate
Queues:          BullMQ, Cloudflare Queues, Inngest, or Trigger.dev
Auth:            Better Auth, Auth.js, Clerk, WorkOS, or custom only when justified
Storage:         S3-compatible object storage
Email:           Resend, Postmark, or SES
Search:          Postgres full-text first, then Meilisearch/Typesense/Algolia when needed
```

### 4.3 Mobile Defaults

```text
Framework:       React Native + Expo stable SDK
Navigation:      Expo Router
Server state:    TanStack Query
Client state:    Zustand or local state
Storage:         MMKV for hot paths, SecureStore for secrets
Images:          expo-image
Lists:           FlashList for large lists
Animations:      Reanimated for gesture-heavy or performance-sensitive motion
Notifications:   Expo Notifications or native integration as required
Audio/video:     Native module only when Expo APIs are insufficient
```

### 4.4 CMS Defaults

Use a headless CMS when non-developers need content control.

Good defaults:

- Sanity
- Contentful
- Payload
- Strapi
- Directus

For Sanity:

- Use generated types.
- Do not hand-write CMS document types when typegen is available.
- Query only the fields rendered by the UI.
- Validate external CMS data at boundaries.

### 4.5 When Not to Use the Default Stack

Do not force the default stack when:

- A static site is enough
- A backend service does not need React
- A WordPress site is the correct business solution
- A mobile app requires heavy native capabilities
- A simple script solves the real problem
- The team already has a proven stack
- The hosting environment makes the default stack expensive or fragile

### 4.6 Cloudflare Platform Standard

Cloudflare is always considered part of the deployment and infrastructure conversation.

For every web or full-stack project, the AI/developer must assume Cloudflare may be involved unless the project explicitly says otherwise.

Cloudflare services that should remain in scope:

```text
Frontend hosting:     Cloudflare Pages
Serverless backend:   Cloudflare Pages Functions / Cloudflare Workers
Database:             Cloudflare D1 / Cloudflare database
Object storage:       Cloudflare R2 when object storage is needed
Key-value storage:    Cloudflare KV when low-latency key-value reads fit the use case
Queues:               Cloudflare Queues when async background processing fits the architecture
Caching/CDN:          Cloudflare CDN, caching rules, headers, and edge behavior
DNS/security:         Cloudflare DNS, SSL/TLS, WAF, redirects, and security rules
Local/dev tooling:    Wrangler where Cloudflare resources are used
```

Rules:

- Do not assume Vercel, Netlify, or a traditional Node server is the only deployment path.
- Cloudflare Pages must be considered for frontend and full-stack deployment.
- Cloudflare D1 / Cloudflare database must be considered for serverless SQL needs.
- Cloudflare Workers and Pages Functions must be considered for APIs, middleware, auth callbacks, webhooks, and edge logic.
- Cloudflare bindings must be treated as infrastructure contracts, not random environment variables.
- If using Cloudflare D1, document database name, binding name, migrations, local development flow, preview database strategy, and production database strategy.
- If using Cloudflare Pages, document build command, output directory, environment variables, compatibility date, functions directory, and deployment branch rules.
- If using Next.js on Cloudflare, verify runtime compatibility before choosing Node-only libraries.
- Do not use Node-specific APIs in Cloudflare runtime code unless compatibility is explicitly supported and verified.
- Keep Cloudflare configuration visible in docs, usually in `wrangler.toml`, dashboard notes, or deployment documentation.
- Any AI agent working on the project must mention Cloudflare impact when changing deployment, database, environment variables, routes, APIs, caching, headers, or auth.

Cloudflare should not be forced into every feature. It should remain a first-class option whenever hosting, database, backend functions, edge performance, caching, DNS, security, or deployment are involved.

---



## 5. TypeScript Standards

### 5.1 Compiler Settings

Use strict TypeScript.

Recommended settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "useUnknownInCatchVariables": true
  }
}
```

### 5.2 Type Rules

Prefer:

```typescript
unknown
```

over:

```typescript
any
```

Use `unknown` at boundaries, then narrow.

Avoid:

```typescript
any
// @ts-ignore
as any
as unknown as Something
```

Allowed only with a comment explaining why and a follow-up issue if needed.

### 5.3 Runtime Validation

Static types do not validate runtime data.

Validate all external data:

- API request bodies
- Query params
- Form input
- Webhooks
- CMS responses
- Environment variables
- Third-party API responses
- Local storage values
- URL state

Example:

```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]),
})

type User = z.infer<typeof UserSchema>
```

### 5.4 Environment Variables

Never access `process.env` randomly across the app.

Create a single environment module:

```text
src/env.ts
```

Validate with Zod or a similar schema.

Separate:

- Server-only env
- Client-exposed env
- Test env
- Build-time env

Only expose client variables with the framework-approved prefix.

---

## 6. Code Quality Standards

### 6.1 Function Design

Guidelines, not blind laws:

- Prefer pure functions where possible.
- Keep functions focused on one responsibility.
- Use an options object when parameters exceed 3.
- Return early to reduce nesting.
- Name functions by outcome, not implementation detail.
- Avoid hidden I/O inside utilities.
- Avoid boolean flags that radically change behavior.

Bad:

```typescript
processUser(user, true, false, "full")
```

Good:

```typescript
processUser(user, {
  includeProfile: true,
  notifyUser: false,
  mode: "full",
})
```

### 6.2 Component Design

Components should be boring, readable, and composable.

Rules:

- Server Components by default in Next.js.
- Client Components only when interactivity requires them.
- Keep data fetching close to the route or feature boundary.
- Split large components by responsibility, not by arbitrary line count.
- Prefer props over global context.
- Use context only for true cross-tree state.
- Avoid barrel exports in performance-sensitive paths.
- Keep feature-specific components inside feature folders.
- Keep generic primitives in `components/ui`.

### 6.3 Naming

```text
Components:       PascalCase       UserProfileCard
Hooks:            camelCase        useUserSession
Utilities:        camelCase        formatDate
Constants:        SCREAMING_SNAKE  MAX_RETRY_ATTEMPTS
Types:            PascalCase       UserProfile
Files:            kebab-case       user-profile-card.tsx
Routes:           framework style  app/dashboard/page.tsx
Database tables:  snake_case       user_profiles
```

### 6.4 Comments

Comments should explain why, not what.

Bad:

```typescript
// Increment index
index++
```

Good:

```typescript
// The API uses 0-based pages, but the UI shows 1-based pages.
const apiPage = uiPage - 1
```

Use comments for:

- Business rules
- Non-obvious tradeoffs
- Temporary workarounds
- Security decisions
- Performance decisions
- Platform-specific behavior

### 6.5 Dependency Rules

Before adding a dependency, ask:

- Can the platform/framework already do this?
- Is this dependency actively maintained?
- What is the bundle impact?
- What is the security history?
- Can we replace it easily later?
- Is it needed on the client or only server-side?

Prefer fewer, better dependencies.

---

## 7. Architecture Standards

### 7.1 Layered Boundaries

Use clear boundaries.

```text
UI Layer
- pages
- screens
- components
- visual state

Feature Layer
- feature hooks
- feature stores
- business workflows

Service Layer
- API clients
- CMS clients
- payment clients
- email clients
- storage clients

Domain Layer
- models
- validation schemas
- business rules
- permissions

Infrastructure Layer
- config
- env
- logging
- database
- caching
- queues
```

Dependencies should generally point downward.

UI should not directly know database details. Database code should not know React exists.

### 7.2 Recommended Folder Structure

```text
src/
  app/
    (marketing)/
    (dashboard)/
    api/
  components/
    ui/
    layout/
    features/
  features/
    auth/
    billing/
    content/
    users/
  server/
    api/
    db/
    services/
  domain/
    models/
    permissions/
    schemas/
  lib/
    env/
    logger/
    utils/
  hooks/
  stores/
  styles/
docs/
  spec.md
  architecture.md
  decisions.md
  api.md
tasks/
  todo.md
  lessons.md
tests/
  e2e/
```

Adapt to the framework. Do not fight the framework.

### 7.3 Feature Module Pattern

For larger apps, group feature logic:

```text
src/features/billing/
  components/
  hooks/
  server/
  schemas/
  types.ts
  permissions.ts
  constants.ts
```

A feature folder may own its business logic. Shared logic moves to `domain` or `lib` only when reused by multiple features.

### 7.4 Data Flow

Prefer predictable data flow:

```text
User action
→ validation
→ authorization
→ domain logic
→ service/database call
→ result
→ UI update
→ logging/metrics when needed
```

Do not mix these steps randomly inside UI components.

---

## 8. State Management

### 8.1 State Ownership

Use the right tool for the state type.

```text
Server state:      TanStack Query / framework cache
Local UI state:    useState / useReducer
Global UI state:   Zustand
Form state:        React Hook Form
URL state:         Search params
Persistent state:  Database / local storage / MMKV
Derived state:     Compute it, do not store it
```

### 8.2 Avoid State Duplication

Do not store the same truth in multiple places.

Bad:

```typescript
const [users, setUsers] = useState([])
const [userCount, setUserCount] = useState(0)
```

Good:

```typescript
const userCount = users.length
```

### 8.3 Async State

Do not manually recreate server-state libraries.

Avoid:

```typescript
const [data, setData] = useState()
const [loading, setLoading] = useState(false)
const [error, setError] = useState()
```

Prefer a server-state tool when the data comes from an API, database, or CMS.

---

## 9. Error Handling

### 9.1 Error Categories

Classify errors:

```text
Validation error       User sent invalid input
Authentication error   User is not logged in
Authorization error    User lacks permission
Not found error        Resource does not exist
Conflict error         State changed or duplicate exists
Rate limit error       Too many requests
External service error Third-party failure
Unexpected error       Bug or unknown failure
```

### 9.2 Boundary Rules

At boundaries, convert unknown errors into known error shapes.

Example:

```typescript
type AppResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError }

type AppError = {
  code: string
  message: string
  status: number
  cause?: unknown
}
```

Throwing inside internal logic can be acceptable. Throwing across external boundaries without mapping is not.

### 9.3 User-Facing Errors

User messages should be:

- Clear
- Actionable when possible
- Non-technical unless the user is technical
- Safe, without exposing internal details

Bad:

```text
PrismaClientKnownRequestError P2002
```

Good:

```text
An account with this email already exists.
```

### 9.4 Logging Errors

Log enough to debug without leaking sensitive data.

Log:

- Error code
- Request ID
- User ID if safe
- Route/action
- Timing
- External service name
- Environment
- Stack trace server-side

Never log:

- Passwords
- Access tokens
- Full payment details
- Private keys
- Sensitive personal data
- Raw authorization headers

---

## 10. Security Standards

Security is not a final checklist. It is part of every design decision.

### 10.1 Universal Rules

Never:

- Store secrets in client code
- Trust client-side validation
- Concatenate SQL strings
- Disable authentication for convenience
- Leak stack traces to users
- Store auth tokens in localStorage for sensitive apps
- Accept webhooks without signature verification
- Use `dangerouslySetInnerHTML` without sanitization
- Log secrets or sensitive user data
- Expose internal IDs when public IDs are required

Always:

- Validate input server-side
- Authorize every protected action
- Use parameterized queries
- Use HTTPS in production
- Rate limit public endpoints
- Use secure cookies for session-based auth
- Sanitize user-generated HTML
- Verify webhook signatures
- Use least-privilege API keys
- Rotate compromised credentials immediately

### 10.2 Authentication and Authorization

Authentication answers:

```text
Who are you?
```

Authorization answers:

```text
What are you allowed to do?
```

Do not confuse them.

Every protected mutation must check authorization server-side.

Example permission model:

```typescript
can(user, "update", resource)
can(user, "delete", resource)
can(user, "invite", workspace)
```

### 10.3 Security Headers

Every production web app should intentionally configure headers.

Recommended baseline:

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options: nosniff
X-Frame-Options or frame-ancestors
Referrer-Policy
Permissions-Policy
Cross-Origin-Opener-Policy when appropriate
```

Do not copy a CSP blindly. Build it around the actual app.

### 10.4 File Uploads

For file uploads:

- Limit size
- Limit type
- Validate MIME and extension
- Store outside the app server
- Generate random file names
- Scan when risk requires it
- Never execute uploaded files
- Serve with safe content headers
- Strip metadata when privacy matters

### 10.5 Webhooks

For webhooks:

- Verify signature
- Use raw body when required by provider
- Make handlers idempotent
- Store event IDs to prevent replay
- Respond quickly
- Queue slow work
- Log failed events
- Provide retry-safe behavior

---

## 11. Performance Standards

Performance must be measured.

Do not say "optimized" without before/after evidence.

### 11.1 Web Targets

Targets depend on product type, but these are strong defaults:

```text
LCP:   < 2.5s, aim for < 1.8s
INP:   < 200ms, aim for < 100ms
CLS:   < 0.1,  aim for < 0.05
TTFB:  < 800ms, aim for < 300ms
```

For high-traffic marketing pages, be stricter.

### 11.2 Mobile Targets

```text
Cold start:          < 2s target
Screen transition:   < 150ms perceived
Tab switch:          < 50ms
Scroll frame budget: 16.6ms for 60fps
Tap response:        < 100ms
Cached image load:   < 100ms
```

### 11.3 Performance Rules

Web:

- Use Server Components by default where applicable.
- Keep client bundles small.
- Lazy-load heavy client-only code.
- Use image optimization.
- Set image dimensions to prevent layout shift.
- Avoid unnecessary client providers at the root.
- Avoid shipping admin-only code to public pages.
- Stream slow data where supported.
- Cache intentionally.
- Use route-level code splitting.

Mobile:

- Do not block the JS thread during interactions.
- Use FlashList for large lists.
- Use memoization only when measured or clearly needed.
- Use native-driver/UI-thread animations for heavy motion.
- Avoid large synchronous JSON parsing during startup.
- Persist hot state in MMKV where appropriate.
- Profile on real devices, not only simulators.

Backend:

- Add indexes based on real queries.
- Avoid N+1 queries.
- Paginate large responses.
- Use cursor pagination for infinite lists.
- Cache expensive reads.
- Move slow work to queues.
- Use timeouts for external calls.
- Protect expensive endpoints with rate limits.

### 11.4 Bundle Budget

Every app should define a budget.

Example:

```text
Initial public route JS:     < 170KB gzipped target
Marketing page JS:           as close to zero as practical
Dashboard route JS:          justified by functionality
Single dependency > 50KB:    requires reason
```

Do not treat numbers as universal law. Treat them as review triggers.

---

## 12. Database Standards

### 12.1 Schema Design

Use clear, boring schema design.

Rules:

- Prefer explicit table names.
- Use consistent primary key strategy.
- Add `created_at` and `updated_at` where useful.
- Use foreign keys unless there is a strong reason not to.
- Add indexes based on query patterns.
- Avoid storing computed values unless needed for performance.
- Use constraints to protect data integrity.
- Use migrations for every schema change.

### 12.2 Migrations

Migrations must be:

- Version controlled
- Reviewable
- Repeatable
- Safe for production data
- Tested against realistic data when risky

Dangerous migration patterns:

- Dropping columns immediately
- Renaming columns without backwards compatibility
- Long locks on large tables
- Backfilling huge tables in one transaction
- Changing data types without a rollback plan

Safe rollout pattern:

```text
1. Add new column/table.
2. Write to both old and new shape.
3. Backfill gradually.
4. Read from new shape.
5. Stop writing old shape.
6. Remove old shape later.
```

### 12.3 Query Rules

- Select only needed columns.
- Paginate list endpoints.
- Explain/analyze slow queries.
- Add indexes intentionally.
- Avoid ORM magic that hides expensive behavior.
- Keep transactions short.
- Use optimistic locking or conflict handling when needed.

### 12.4 Cloudflare Database / D1 Rules

Cloudflare database work is part of the standard architecture scope.

When a project uses Cloudflare D1 or another Cloudflare database option:

- Treat the database binding as a real infrastructure dependency.
- Document the binding name, for example `DB`, and where it is configured.
- Keep migrations version controlled.
- Use prepared statements and parameter binding.
- Validate all input before queries.
- Avoid assuming full PostgreSQL behavior when using D1.
- Design schemas around the actual Cloudflare database semantics and limitations.
- Separate local, preview, staging, and production database configuration.
- Never point local experiments at production data.
- Document how to create, migrate, seed, backup, and inspect the database.
- Add a rollback or recovery note for risky migrations.
- Keep data access behind a service/repository layer so the app can evolve if the database choice changes.

For AI agents:

- Do not ignore Cloudflare D1 when choosing persistence.
- Do not replace Cloudflare D1 with PostgreSQL unless the tradeoff is clearly explained.
- Do not write database code that only works in a traditional Node server if the project is intended to run on Cloudflare Pages Functions or Workers.
- Always check whether the code runs in the Cloudflare runtime before adding database drivers or Node-specific packages.

---



## 13. API Standards

### 13.1 API Design

APIs should be predictable.

Every endpoint or procedure should define:

- Input schema
- Output schema
- Auth requirements
- Permission rules
- Error codes
- Rate limits
- Idempotency behavior for mutations where needed

### 13.2 REST Defaults

Use resource-based routes:

```text
GET    /api/users
GET    /api/users/:id
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id
```

For actions that are not resource CRUD:

```text
POST /api/invoices/:id/send
POST /api/workspaces/:id/invite
```

### 13.3 Response Shape

Use consistent response shapes.

Success:

```json
{
  "data": {}
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input.",
    "details": {}
  }
}
```

### 13.4 Idempotency

Use idempotency keys for:

- Payments
- Order creation
- Email sending
- External side effects
- Retry-prone operations

---

## 14. Testing Standard

Testing should prove behavior, not implementation.

### 14.1 Testing Strategy

Use the testing trophy:

```text
Static Analysis   Always
Unit Tests        Pure logic and utilities
Integration Tests Feature and API behavior
E2E Tests         Critical user journeys
Manual QA         Complex UX and platform-specific behavior
```

### 14.2 Required Checks

For serious projects:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

For small projects, define the minimum acceptable check set in `README.md`.

### 14.3 What to Test

Always test:

- Authentication flows
- Permission checks
- Payment flows
- Data creation/update/deletion
- Critical forms
- Error states
- Empty states
- Webhooks
- Complex business rules
- Bug fixes

Usually test:

- Pure utilities
- Custom hooks
- API clients
- Data transformations
- Validation schemas

Do not over-test:

- Framework behavior
- Trivial rendering
- Implementation details
- Third-party libraries

### 14.4 Test Names

Good:

```typescript
it("shows an error when the email is already registered")
it("prevents non-admin users from deleting a workspace")
it("keeps the submit button disabled while the request is pending")
```

Bad:

```typescript
it("works")
it("handles edge case")
it("test user service")
```

### 14.5 Coverage

Coverage targets are review signals, not proof of quality.

Recommended:

```text
Critical business logic: 95-100%
Permission logic:        100%
API endpoints:           high coverage
Utilities:               high coverage
UI components:           meaningful behavior coverage
```

A bad test with coverage is still bad.

---

## 15. Accessibility Standard

Accessibility is a product requirement, not a polish task.

### 15.1 Baseline Rules

- Use semantic HTML first.
- Use ARIA only when native HTML is insufficient.
- Every interactive element must be keyboard accessible.
- Focus states must be visible.
- Forms must have labels.
- Error messages must be connected to fields.
- Images need meaningful alt text unless decorative.
- Color alone must not communicate meaning.
- Respect `prefers-reduced-motion`.
- Modals must trap focus and restore focus.
- Menus, tabs, and comboboxes must follow expected keyboard behavior.

### 15.2 Motion

Motion must help the interface, not punish the user.

Rules:

- Avoid excessive motion.
- Disable or reduce motion for users who request it.
- Do not animate layout in ways that cause confusion.
- Do not block interaction during long animations.
- Prefer CSS transitions for simple effects.
- Use animation libraries only when the interaction needs them.

### 15.3 Accessibility Testing

At minimum:

- Keyboard-only navigation
- Screen reader smoke test
- Contrast check
- Form validation check
- Mobile touch target check
- Reduced motion check

---

## 16. UI and Design Engineering

### 16.1 UI Quality Bar

A professional UI should be:

- Clear
- Fast
- Consistent
- Accessible
- Responsive where required
- Honest about loading and errors
- Not visually noisy
- Not overanimated
- Easy to scan
- Easy to recover from mistakes

### 16.2 Design System Rules

Use tokens for:

- Colors
- Spacing
- Radius
- Shadows
- Typography
- Z-index
- Breakpoints
- Motion duration/easing

Do not hardcode design values randomly.

### 16.3 Loading States

Every async UI should define:

- Loading state
- Empty state
- Error state
- Success state
- Permission denied state when applicable

Avoid layout jumps during loading.

Prefer skeletons when they preserve layout. Prefer spinners only for short, contained waits.

### 16.4 Forms

Forms must have:

- Labels
- Validation
- Field-level errors
- Submit-level error
- Disabled/pending state
- Success feedback
- Safe retry behavior
- Accessible error announcements when needed

---

## 17. Observability

If production breaks and you cannot answer what happened, the system is incomplete.

### 17.1 Required Signals

Every serious app needs:

- Error tracking
- Request logs
- Performance metrics
- Uptime monitoring
- Critical business metrics
- Deployment tracking
- Alerting for high-severity failures

### 17.2 Recommended Tools

Use what fits the stack:

```text
Errors:       Sentry
Uptime:       Better Stack, Checkly, Pingdom
Logs:         Provider logs, Axiom, Datadog, Grafana Loki
Metrics:      OpenTelemetry, Datadog, Grafana, provider analytics
Analytics:    PostHog, Plausible, Vercel Analytics, GA4
```

### 17.3 Logging Rules

Logs should be structured.

Good:

```json
{
  "level": "error",
  "event": "payment_failed",
  "userId": "user_123",
  "requestId": "req_abc",
  "provider": "stripe",
  "durationMs": 532
}
```

Bad:

```text
payment broke again
```

### 17.4 Alerts

Alert only on things that require action.

Good alerts:

- Production is down
- Error rate spiked
- Payment failures increased
- Queue backlog is growing
- Database latency is high
- Webhook delivery is failing
- Disk/storage limit approaching

Bad alerts:

- Noisy low-priority events
- Expected user errors
- Every single exception without grouping

---

## 18. CI/CD and Deployment

### 18.1 Required CI Checks

For pull requests:

```text
Install dependencies from lockfile
Typecheck
Lint
Unit/integration tests
Build
E2E smoke tests for critical paths
Security/dependency audit where practical
```

For main branch:

```text
All PR checks
Build artifact
Deploy to staging or preview
Smoke test
Promote to production
Track deployment in monitoring
```

### 18.2 Environment Strategy

```text
local        Developer machine
preview      Every PR when possible
staging      Production-like validation
production   Real users
```

Production must not depend on local-only assumptions.

### 18.3 Rollback

Every production deployment must have a rollback story.

Know:

- How to rollback code
- How to rollback config
- Whether database migrations are reversible
- Whether data changes are destructive
- How to disable a feature quickly
- Who receives alerts

Use feature flags for risky launches.

### 18.4 Release Checklist

Before shipping:

```text
[ ] Typecheck passes
[ ] Lint passes
[ ] Tests pass
[ ] Build passes
[ ] No secrets in code
[ ] Env vars documented
[ ] Cloudflare Pages/Workers/D1 configuration reviewed when applicable
[ ] Security-sensitive paths reviewed
[ ] Accessibility basics checked
[ ] Performance impact acceptable
[ ] Error tracking configured
[ ] Logs useful
[ ] Rollback path known
[ ] README/docs updated where needed
```

### 18.5 Cloudflare Deployment Standard

When Cloudflare Pages, Workers, Pages Functions, D1, R2, KV, Queues, or other Cloudflare services are part of the project, deployment work must include Cloudflare-specific validation.

Required Cloudflare deployment checks:

```text
[ ] Cloudflare Pages project name documented
[ ] Build command documented
[ ] Output directory documented
[ ] Production branch documented
[ ] Preview branch behavior documented
[ ] Environment variables configured for preview and production
[ ] Secrets are stored in Cloudflare, not committed to the repo
[ ] Compatibility date documented where Workers/Functions are used
[ ] Cloudflare bindings documented
[ ] D1 database names and binding names documented if used
[ ] D1 migrations tested before production
[ ] R2/KV/Queues bindings documented if used
[ ] Redirects and headers documented if configured
[ ] Caching behavior reviewed
[ ] Rollback path known through Pages deployments or versioned deploys
```

Cloudflare should be reviewed whenever changes touch:

- Deployment settings
- Build output
- Runtime compatibility
- API routes
- Pages Functions
- Workers
- Database access
- Environment variables
- Secrets
- Headers
- Redirects
- Caching
- DNS
- SSL/TLS
- WAF/security rules

For AI agents:

- Always mention Cloudflare impact in the final change summary when a change could affect deployment, runtime, APIs, database, caching, or environment variables.
- Never assume local Node.js behavior equals Cloudflare runtime behavior.
- Verify whether dependencies work in the Cloudflare runtime before adding them to backend or API code.

---



## 19. Git and Pull Request Standard

### 19.1 Branches

Recommended:

```text
main          production-ready
develop       optional integration branch
feat/*        features
fix/*         bug fixes
perf/*        performance improvements
refactor/*    behavior-preserving cleanup
docs/*        documentation
chore/*       maintenance
```

Keep branching simple unless the team needs more.

### 19.2 Commit Messages

Use Conventional Commits.

```text
feat(auth): add Google OAuth login
fix(player): keep audio session active on lock screen
perf(home): reduce re-renders during playback
refactor(api): isolate Sanity client
test(auth): cover expired session handling
docs(readme): add deployment instructions
```

### 19.3 Pull Requests

A good PR includes:

- What changed
- Why it changed
- Screenshots/video for UI changes
- Test evidence
- Risk notes
- Rollback notes if risky

PR checklist:

```text
[ ] One concern only
[ ] Small enough to review
[ ] Self-reviewed
[ ] Tests added or updated
[ ] Docs updated if needed
[ ] No unrelated formatting
[ ] No accidental debug code
```

### 19.4 Review Standard

Review for:

- Correctness
- Security
- Simplicity
- Data integrity
- Accessibility
- Performance
- Maintainability
- Test quality
- User experience
- Operational risk

Do not only review style.

---

## 20. Documentation Standard

Documentation should reduce future confusion.

### 20.1 Required Project Docs

```text
README.md                 Setup, purpose, commands
docs/spec.md              Product and feature specs
docs/architecture.md      System architecture
docs/decisions.md         Architecture decisions
docs/api.md               API contracts if applicable
docs/runbook.md           Production operations
CHANGELOG.md              User-facing changes when relevant
```

### 20.2 README Must Include

- What the project does
- Tech stack
- Prerequisites
- Setup commands
- Environment variables by name
- Cloudflare Pages project name when Cloudflare is used
- Cloudflare D1 / database binding names when Cloudflare database is used
- Wrangler commands when Cloudflare resources are used
- Local development commands
- Testing commands
- Build/deploy commands
- Architecture overview
- Common troubleshooting
- Links to important docs

### 20.3 Runbook

Every production app should have:

```markdown
# Runbook

## Common Failures

## How to Roll Back

## How to Rotate Secrets

## How to Replay Webhooks

## How to Check Logs

## How to Check Uptime

## How to Disable Risky Features

## Contacts / Ownership
```

---

## 21. AI Project Memory Files

When using AI coding agents, keep memory files clean and useful.

### 21.1 Recommended Files

```text
CLAUDE.md       Claude Code project instructions
AGENTS.md       Multi-agent instructions
.cursor/rules   Cursor rules if using Cursor
docs/decisions.md
tasks/todo.md
tasks/lessons.md
```

### 21.2 What Belongs in AI Memory

Include:

- Project architecture
- Commands
- Coding standards
- Testing expectations
- Known pitfalls
- Deployment constraints
- Cloudflare Pages, Workers, D1/database, R2, KV, Queues, DNS, caching, and security constraints when used
- Product-specific rules
- Do-not-touch areas
- Current priorities

Avoid:

- Long motivational text
- Duplicate README content
- Secrets
- Huge pasted documentation
- Outdated decisions
- Personal notes unrelated to the project

### 21.3 AI Memory Template

```markdown
# Project Instructions

## Project Summary
...

## Commands
- Install:
- Dev:
- Typecheck:
- Test:
- Build:
- Cloudflare dev:
- Cloudflare deploy:
- Cloudflare database migrate:

## Architecture
...

## Cloudflare
- Pages project:
- Production branch:
- Build command:
- Output directory:
- Compatibility date:
- Functions directory:
- D1/database binding:
- R2 bindings:
- KV bindings:
- Queues:
- DNS/caching/security notes:

## Coding Rules
...

## Testing Rules
...

## Do Not
...

## Known Issues
...

## Current Priorities
...
```

---

## 22. Self-Improvement Loop

Every mistake should improve the system.

Maintain:

```text
tasks/lessons.md
```

Format:

```markdown
# Lessons

## 2026-05-04: Audio notification disappeared on Samsung lock screen

### What happened
...

### Root cause
...

### Rule added
...

### Test to prevent recurrence
...
```

### 22.1 Common Failure Modes

Avoid:

1. Making assumptions silently
2. Expanding scope without permission
3. Refactoring unrelated code
4. Deleting code that only appears unused
5. Trusting TypeScript without runtime validation
6. Skipping error states
7. Ignoring accessibility
8. Measuring performance only by feeling
9. Adding dependencies too casually
10. Shipping without rollback path
11. Treating AI-generated code as correct by default
12. Marking work complete without validation
13. Confusing authentication with authorization
14. Logging sensitive data
15. Optimizing before understanding the bottleneck

---

## 23. Practical Definition of Done

A task is done when all applicable items are true:

```text
[ ] Requirement understood
[ ] Implementation minimal and focused
[ ] Types are safe
[ ] Runtime validation exists at boundaries
[ ] Error states handled
[ ] Loading/empty states handled
[ ] Authorization checked server-side
[ ] Security impact reviewed
[ ] Accessibility basics covered
[ ] Performance impact acceptable
[ ] Tests added or updated
[ ] Relevant commands pass
[ ] Cloudflare deployment/database impact reviewed when applicable
[ ] Documentation updated if needed
[ ] No unrelated changes
[ ] Rollback risk understood
```

For small tasks, not every item applies. Use judgment.

---

## 24. The Senior Engineer Check

Before shipping, ask:

```text
Would I be comfortable maintaining this six months from now?
Would I be comfortable debugging this at 3 AM?
Would I be comfortable explaining this design in a review?
Would I be comfortable if this code handled 10x traffic?
Would I be comfortable if a junior developer copied this pattern?
```

If the honest answer is no, improve it.

---

## 25. Final Standard

Great software is not made by using the newest tools.

Great software is made by:

- Understanding the problem
- Choosing boring solutions where possible
- Using modern tools where they genuinely help
- Designing clear boundaries
- Handling failure
- Protecting users
- Measuring reality
- Writing code that future developers can trust

The best code is not the code that looks advanced.

The best code is the code that solves the problem, survives production, and stays understandable.
