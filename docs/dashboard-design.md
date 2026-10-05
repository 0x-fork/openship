# Dashboard design

Use this guide for dashboard UI work. The dashboard uses layered surfaces, compact controls,
and a consistent type hierarchy across light, dim, and dark themes.

## Surfaces and controls

Use semantic classes from [theme.css](../apps/dashboard/src/styles/theme.css). The nested-card
rules in [globals.css](../apps/dashboard/src/app/globals.css) supply the theme-specific layering.
Keep palette definitions there instead of introducing page-specific colors.

| Element           | Treatment                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Page              | `bg-background`, using `PageContainer`                                                            |
| Section card      | `rounded-2xl bg-card p-5`, no decorative outline                                                  |
| Nested route card | `rounded-xl bg-card p-4`, no decorative outline                                                   |
| Text input        | Shared `Input` with `variant="filled"`; recessed `bg-background`                                  |
| Form dropdown     | Shared `CustomSelect` with `variant="filled"` and `triggerClassName="bg-muted/60 hover:bg-muted"` |
| Supporting text   | `text-muted-foreground`                                                                           |

Nested `bg-card` surfaces adapt through the shared CSS: light uses a subtle gray fill, while
dim and dark lift the inner surface. Form dropdowns use a lighter surface than text inputs;
the trigger override above is intentional because `filled` alone uses the input background.

Keep visible keyboard focus, error indicators, meaningful selection outlines, and useful dividers.
Borderless cards do not remove those functional indicators. Menus should use the shared dropdown
component's existing positioning, keyboard behavior, and menu surface.

Reuse [Input](../apps/dashboard/src/components/ui/input.tsx),
[CustomSelect](../apps/dashboard/src/components/ui/CustomSelect.tsx), and
[Button](../apps/dashboard/src/components/ui/button.tsx) instead of copying their implementations.

## Layout and density

- Use [PageContainer](../apps/dashboard/src/components/ui/PageContainer.tsx) for its existing
  1600px page limit and responsive padding. Avoid a second page-width cap inside it.
- Project and deployment configuration pages use a 340px action sidebar when there is room,
  then stack on smaller containers. Catalog installs keep their destination and action together.
  Source deployments use the same destination summary above configuration and target-settings
  screen in Cloud and self-hosted mode; do not add a separate destination panel to the sidebar.
- Connected and managed destinations use the same searchable server rows; managed rows show
  project count and purchased capacity in place of an SSH address. Keep the add-server action
  inside the multi-server menu and beside the single-server summary.
- Add Server keeps the connected/managed choice stacked in the right sidebar above setup
  guidance. On narrow screens, place that same choice before the form and guidance after it.
  Reuse the shared acquisition picker in both setup modes and dialogs.
  Selecting Get a managed server on `/servers/new` opens Billing's explicit new-server
  purchase. Keep inline destination dialogs in place so they preserve the deployment form.
  Cloud Add server opens plan selection first. Reuse the same plan and Custom purchase
  component in Billing, managed server setup and destination dialogs. Create the server
  with its default name only after a plan is chosen, then use the shared scoped checkout.
- Destination settings use the normal page layout: server selection first, then visible
  runtime, resource and rollback sections, with a 340px preview/Continue sidebar. Keep the
  same layout in Cloud and self-hosted mode; do not hide it in an Advanced accordion.
- Machine power defaults to the full available server capacity. Project settings and
  deployment setup share the resource editor and tier labels. Optional limits apply to
  containers; the managed server's purchased allocation stays separate.
  In destination settings, offer Full capacity and Customized as peer selection cards;
  Customized keeps the presets visible below. Keep a Back action in the page header.
- Destination, runtime and resource choices share [OptionCard](../apps/dashboard/src/components/shared/OptionCard.tsx),
  including its selected border and radio marker. Do not introduce a separate switch style.
- Base grids on the available container width so expanded navigation does not squeeze fields.
  Routing cards use two columns when their controls fit comfortably and one column otherwise.
- Keep section spacing consistent (`gap-6` between main columns, `space-y-4` for sidebar items).
  Match action sizes within the same flow. The install action is 44px tall; shared buttons retain
  their established sizes (the default `Button` is 40px).
- A destination with one existing server uses a compact summary row; multiple servers use
  the shared picker. Keep the create-server action visible in both cases. Cloud deployments
  can reuse a server's plan or create a separate server and subscription from the same flow.
- Import discovery defaults to Cards, with the shared topology canvas as an optional view.
  Each Compose project has its own section and canvas; do not add another parent node around
  its services. Recovered Openship projects belong in the same selector; their recovery action
  and naming live in the sidebar. Selection uses the shared OptionCard surface and border.
  Discovery cards use two lines: service name with the shared status ring and selection
  control, then the image and volume count. Keep Add project beside the project name and
  show it only after selecting services, while unassigned services remain.
  Expand additional groups on demand. Selection and names survive view and step changes.
  Only draw discovered dependencies; keep scan graphs in memory without saved configuration.
- Import progress and discovery notices stay in the right sidebar. Keep scan settings in the
  shared compact menu beside scan controls. The repository summary uses the same filled card,
  inputs and dropdowns as the other steps, with concise guidance.
- Import routing uses two columns when the container has room, with a compact summary on the
  right. Expanded service controls stay in their column; collapsed neighbors keep their own
  height. Put compact Expand all / Collapse all actions above the service grid. Show detected
  domains and incomplete routes immediately, and reuse the domain, volume and environment
  editors. Routing choices are Custom, Free and Internal only, using the shared routing labels.
  Detected routes appear under Custom and retain their original import behavior until edited.
  Destination and transfer review have a final step for both same-server and cross-server
  imports. The page and modal share the whole preparation layout and controls.
- The Cloud sidebar orders its sections as Main, Settings, then Infrastructure.
  Self-hosted instances keep Infrastructure before Settings, including when connected to Cloud.
- Projects and catalog Apps have separate top-level sidebar entries and lists, backed by the
  same project data and status handling. Apps uses a compact installed list with Home's
  app illustration and a link to the full catalog alongside it. The illustration's icons
  link to available catalog apps; keep their targets stable and do not repeat them in a
  second suggestion list. Its empty state shows connected app logos and popular install shortcuts.
  Keep Home's project list and the sidebar counts separate too.
- Cloud's New Project choices are Apps, GitHub, Git URL and Import existing project.
  Folder import and the Browse Templates shortcut are available only on self-hosted instances.
- Credit warnings belong in Billing's overview for the selected server. Reuse its loaded
  billing state and scoped links; keep the notice inline. Monthly servers have no compute
  credit warnings. Other pages do not mount a credit tray or poll all server balances.
- Plan comparisons lead with CPU, memory, storage and service/project limits. Keep build
  time separate from runtime capacity; show minutes only when the offer defines a time
  allowance. Summarize monthly coverage and shared capacity in the common checklist
  below the comparison, alongside shared capabilities. Keep additional transfer, backup
  and storage terms in a compact disclosure. Follow this with the catalog's Enterprise
  contact card; do not repeat these details inside every plan or in a separate text card.
- Cloud billing keeps its header and tabs mounted when switching servers. List managed
  servers in the right sidebar on usage and history tabs, reusing the shared destination rows.
  One server is a summary; several servers switch billing directly from the visible list.
  Keep one Get server action in the page header across billing tabs; the sidebar only
  selects the server being inspected. Plans uses the full page width with the shared
  compact server picker beside that action. Show its saved subscription and capacity below
  the tabs; an inactive subscription uses a short inline notice. New purchases use the plan introduction
  as the page title and description. Keep Plans / Custom beside Back to billing in the
  header, using matching 40px controls. Purchasing does not require a server-name field.
  An existing server without a plan keeps the server selector, including when every
  server is unpaid. Only an explicit new-server purchase replaces it with Back to billing.
  Do not repeat the introduction below the page heading. Default to relevant upgrades; offer
  Other plans deliberately for lower-cost changes and Custom when no larger preset fits.
  Do not call today's catalog terms the current plan if they differ from the saved purchase,
  or offer a preset that would shrink an existing disk. New-server purchases have their own
  explicit entry and never inherit the selected server's billing scope.
  Unscoped billing opens an existing subscription directly; never
  auto-switch a checkout return or an explicitly selected server. New customers see only
  Monthly server and Pay as you go in the existing top tab bar, without empty billing-history
  tabs. Reuse the same purchase controls in server setup and destination dialogs. Switching
  these views keeps resource inputs and never starts a purchase. The page's purchase
  tabs sit directly above the plan cards. Standalone setup and destination dialogs reuse
  the same Plans / Custom control beside their tabs, without a separate page header. Until a usage
  offer is supported, show its unavailable state without invented rates or a checkout action.
  Keep normal billing navigation for existing subscriptions, allocated servers and credit history, including stopped or
  canceled servers. Show current plan, renewal date or inactive subscription state for
  existing servers; never replace those with a first-purchase promotion.
  In-app credit alerts
  link directly to the scoped billing tab; only a genuine organization change needs
  authorization and a context reload.
  Payments and invoices share one tab and the existing scoped Stripe portal. Show Top-ups
  only when the billing API enables them for the selected server; the purchase-view choice
  must never override paid terms or provider entitlement.
- Monthly servers show purchased resources, paid-through coverage and measured CPU time;
  they have no compute-credit donut, exhaustion alert or credit top-up action. Keep optional
  managed proxy transfer and retained-storage charges distinct from compute coverage, with
  details in a compact disclosure. Existing metered subscriptions retain their credit view.
  Prepaid PAYG shows package amounts beside their credit value, using the provider's
  conversion and published resource rates. Put the Openship resource tiers in compact
  shared tabs above the configurator,
  with configured resources against the selected tier's aggregate CPU, RAM, disk and
  server-count limits. Show the cumulative credit-purchase threshold beside the tabs
  and the selected package's qualifying tier in the credit card. These are pool ceilings,
  not monthly subscriptions or a copy of the reseller owner's Oblien plan. Spending
  credits never lowers a tier. Keep credit-package and resource-tier selections separate;
  changing either must preserve resource inputs. An oversized configuration should show
  which limits are exceeded and offer the smallest available tier that fits, without
  silently resizing the user's servers. The catalog and unlock display remain a preview
  until verified customer funding and runtime entitlement are connected.
  Reuse the monthly resource editor for the interactive estimate; PAYG prices come
  directly from usage rates and do not depend on
  monthly-plan quotes or ceilings. Keep the pricing preview until customer-funded
  purchases are supported. A shared balance is funding,
  not a multiplied resource pool; estimates for several hosts must spend that balance
  once. Use three columns when space permits: the resource editor, readable credit
  package rows in the middle, and the 340px estimate card on the right. Give packages
  280–320px and let the resource editor use the remaining space. Stack the
  packages below resources at intermediate widths, then stack all sections on mobile.
  Keep one compact purchase bar visible at the bottom while configuring resources;
  use a translucent popover surface with backdrop blur while keeping its text readable.
  Lead with estimated dollars per hour and the matching credits per hour, with
  average CPU activity and all-host scope beside them. Keep the CPU, RAM and storage
  hourly breakdown visible. Do not turn a full-month projection into a purchase
  requirement or suggest a larger deposit to cover it. Balance duration belongs in
  an optional disclosure and follows prepaid funds divided by resource usage cost;
  reserved RAM and storage stay included at full and idle CPU. A monthly spending
  ceiling requires an enforceable provider quote, not a UI-derived promise.
  Show CPU-hours as allocated vCPUs multiplied by average activity and elapsed time;
  label time online as elapsed time. Show resource-hours and their costs under a clear
  per-elapsed-hour heading, including all selected hosts. Distinguish active CPU from
  reserved RAM and retained storage. Keep checkout unavailable until customer-funded purchases are
  supported. Do not expose reseller wallet balances or call hypothetical comparisons
  recorded savings.
- Custom resources sit beside the preset plan choice. Keep CPU, RAM and disk controls
  with a compact monthly total, wait for a matching server quote before enabling
  checkout, and expose bundle pricing details on demand. Applying a paid resource
  change reuses the server's affected-project review and restart confirmation.
- Existing subscriptions use a compact plan-change review, with provider prices,
  amount due now, effective date and affected projects. Keep these details in the
  scrollable body and use the shared server resize summary. Upgrades activate
  after payment; downgrades wait for paid renewal. Keep pending payment and
  cancellation actions in the selected server's billing card, preserve retry
  identity after uncertain responses, and never replace the page with a loader.
- Checkout returns verify payment, paid coverage and managed-server readiness separately.
  Show the subscription welcome only when setup is complete. Keep preparation and failure
  notices compact and above the billing columns, with a recheck action and a link to the existing server Activity tab
  for logs and retry. A paid setup failure must never direct the customer to pay again.
- Plan cards respond to their container: one column on phones, two at intermediate widths,
  and four when readable. Offer links to each plan above a stacked comparison; never rely
  on hidden horizontal overflow to reveal additional plans.
- Deployment plan dialogs use compact title and action rows. Keep explanations in the
  scrollable content so the plans receive most of the available viewport height, including
  on short screens. Keep actions side by side on phones, allowing long labels to wrap.
- The plans comparison (`/billing/plans`) and Scale canvas open with the desktop sidebar
  collapsed. Keep the toggle available, restore the normal preference on leaving, and
  keep manual expansion independent between these sections. Mobile navigation opens fully.

## Typography and copy

Use the existing Gellix / SF Arabic font stack and semantic text colors. `text-sm` is 14px;
the dashboard overrides `text-xs` to **13px**, with a 20px line height.
Use `text-sm` for field labels, controls, and primary list information; use `text-xs` for hints
and supporting metadata. Match nearby page headings instead of introducing a new size scale.

Use **Domains & routing** for sections covering domains, published ports, and internal access. Use
**Domains** when the section only manages hostnames. Put shared UI copy in the locale dictionaries.
Keep hints concise and explain choices where they help the user decide.

Catalog category filters match the Library's tabs: compact `text-sm` labels with `px-4 py-2`,
`rounded-lg`, and a filled `bg-foreground text-background` selected state. Inactive choices use
muted text and a subtle hover fill, with no decorative border around each option. Preserve
keyboard focus and expose the selected filter with `aria-pressed`.

Use the shared icon library and the [icon guide](client-icons.md). Avoid decorative icons that
repeat an adjacent label or add clutter to a compact row.

## Catalog forms

Use [AppSettingsForm](../apps/dashboard/src/components/app-settings/AppSettingsForm.tsx) for
install and installed-app settings. Templates define fields and optional layout hints; the
dashboard owns styling. Keep grouping and column choices in catalog JSON instead of checking
app ids in React. A future preview should use this same renderer.

The [catalog reference](../apps/web/content/docs/reference/app-catalog.mdx#form-layout) documents
`installLayout`, group `columns`, and field `fullWidth`. Preserve value state, visibility rules,
validation, and draft behavior when changing presentation.

App routing defaults follow endpoint intent, independently of the deployment target. Public web
UIs and APIs start with domain routing; raw database ports start internal unless the catalog
explicitly says otherwise. Honor `defaultMode` and `allowedModes`, and preserve saved choices.
Cloud availability selects free versus custom domains; it does not decide whether a UI is routed.

## Checking a change

Inspect light, dim, and dark themes; narrow and wide containers; and expanded and collapsed
navigation. Check keyboard focus, open dropdowns, long labels, and RTL when the layout changes.
Use focused behavior tests for changes to field selection, validation, or payloads. A copy or
spacing adjustment needs visual verification, not a test that asserts a CSS class string.
