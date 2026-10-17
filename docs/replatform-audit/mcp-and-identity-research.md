# OpenAI/MCP and identity research

> **Product decision update:** Better Auth with Google-only web login is the preferred direction; ChatGPT follows unified web acceptance immediately. There are no existing users or credentials to migrate. Provider-import tests discussed below are therefore unnecessary for this release. See [the revised direction](revised-direction.md).

**Checked 30 September 2026.** These findings use current official OpenAI documentation and identity vendors' own documentation. This is a design investigation; no MCP server, plugin package, OAuth client or public submission was created. Recheck these sources before implementation and again before submission.

## 1. Transport and tool design

The current OpenAI documentation describes Plugins with MCP servers and optional UI, rather than the historical 2023 plugin/OpenAPI model. A remote server should expose a stable HTTPS endpoint using the documented MCP transport/SDK patterns; Streamable HTTP is the appropriate starting point. Public submission needs stable reachability; a development tunnel is not the production endpoint. Tools need clear schemas, bounded results and accurate read/write behavior. Optional UI is not a prerequisite for useful discovery. [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server).

**Explorers design:** mount `/mcp` beside HTTP initially, call the same application services, and start with the public search/profile/collection tools in the contract table. Do not expose a generic executor, SQL, arbitrary URLs or database CRUD. Add owner edits only after canonical identity and command idempotency work. The integration must remain useful if no UI is rendered.

## 2. Authentication and account linking

OpenAI documents OAuth authorization-code/PKCE, protected-resource metadata, authorization-server discovery and resource/audience validation. CIMD is preferred when supported; dynamic client registration and predefined registration remain alternatives. Thus DCR is not universally mandatory. Tool security declarations can indicate anonymous or OAuth access; protected operations also need correct authentication challenges. These declarations do not enforce permissions themselves. [OpenAI authentication guide](https://developers.openai.com/plugins/build/auth).

**Explorers design:** public tools require no account. Write/analytics tools resolve OAuth claims into the same user/account membership used by web. Do not accept current Music credentials as general OAuth tokens. Keep authentication metadata, issuer, scopes, audience and callback configuration under automated compatibility tests. Link multiple creator accounts through an explicit allowed account context; never infer an account from a tool argument or email address.

## 3. Confirmation, security and optional UI

Use explicit, truthful `readOnlyHint`, `destructiveHint` and `openWorldHint` values. Read-only search has no hidden writes; recommendation creation is a write even if reversible. Model-visible content is untrusted and must not become authority. Server-side policy and clear user intent remain necessary even when the host supplies confirmations. Least privilege, redacted logs, deletion/retention controls and injection defenses are part of the security design. [OpenAI security and privacy](https://developers.openai.com/plugins/guides/security-privacy), [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

Optional components can present recommendation cards, collection previews and edit summaries through the documented MCP Apps UI bridge, with OpenAI-specific extensions where needed. The reference includes `window.openai.sendFollowUpMessage` and `openExternal`: these operate from an existing component/conversation. They do not establish that an arbitrary external URL can inject prompt/context or select a linked account in ChatGPT. [OpenAI UI reference](https://developers.openai.com/plugins/reference).

**Explorers design:** keep `explorers.earth/<username>` canonical and fully useful on the web. An “Ask my recommendations” entry can offer installation/use instructions and a copyable creator-specific prompt, with an ordinary creator URL. Treat any future documented deep-link mechanism as optional enhancement. Never put bearer tokens, paid-guide content or private context into an outbound URL. This is a statement about evidence reviewed, not a claim that no future deep-link capability can exist.

## 4. Monetization and data limits

Current policy allows commerce only for physical goods; it prohibits selling digital content/services/subscriptions and promoting upgrades. Existing paid-account access is permitted. Informational plan links are different from checkout/upgrade links. Advertisements are prohibited. Permitted checkout uses the developer's domain; embedded third-party checkout is not allowed. Inputs should avoid raw location fields and full conversation history; precise user location must not be requested. [OpenAI plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

**Explorers implications:** Creator Pro and paid-guide purchases belong on the independent web product; the plugin proposal should only consume existing entitlements where policy permits. Do not assume a hotel-booking affiliate workflow qualifies for the physical-goods allowance—obtain specific confirmation before building transactional travel tools. Omit sponsored placement from the initial plugin. Destination discovery needs a reviewed geographic-resource/controlled-context design, not a request for the user's exact whereabouts.

Measure tool results returned separately from actual observed views, and do not infer purchases from a click. Keep telemetry narrowly scoped, disclosed and controllable. The architecture's event model is a proposed Explorers design, not a promise of ChatGPT-provided impression or conversion analytics.

## 5. Publishing and review

Current submission uses a packaged plugin ZIP and a verified developer identity. MCP review includes a stable endpoint, domain verification, scanned tools, **five positive and three negative test cases**, an accessible walkthrough and working reviewer access. Enter reviewer credentials in the secure dashboard rather than the package. Approval and publication are separate steps; review does not automatically make the plugin live. [OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission).

Proposed initial positive scenarios: find one creator, list their public books, fetch a public guide, search by supported destination/category, compare a bounded set of creators. Negative scenarios: request a private guide without access, attempt another creator's edit, and request an ambiguous entity that requires clarification. When writes are added, revise review cases to include account linking, edit preview, revision conflict and retry behavior. No demo-only or unfinished endpoint should be submitted.

## 6. Identity-provider assessment

| Option | Verified current capability | Explorers tradeoff and decision |
|---|---|---|
| Better Auth | Drizzle adapter; current MCP plugin built on OAuth provider with PKCE, resource binding, discovery and CIMD composition | Preferred open-source proof candidate following our discussion. Fits inside the existing TypeScript backend and PostgreSQL. We own updates, email, recovery, keys and availability; verify released package versions and actual ChatGPT compatibility |
| Auth0 | Vendor announced generally available Auth for MCP, including CIMD, resource support and delegated token-exchange capabilities | Managed alternative; federation/recovery lowers OAuth operations burden. Validate actual plan, cost, import constraints, logout/revocation and account-linking UX; vendor feature availability is not a completed integration |
| Supabase Auth | OAuth server documents code+PKCE and refresh-token flows; client-credentials/password grants are not supported by that OAuth server flow | Attractive if consolidating managed Postgres/auth; do not assume it solves service-to-service OAuth. Validate consent, registration, audience, revocation and existing credential import in the proof |
| Keycloak | Documentation lists resource indicators as unsupported and newer MCP versions as partially supported; CIMD experimental; audience-mapper workaround described | Self-hosting/control comes with patching, availability and compatibility ownership. A workaround needs end-to-end ChatGPT validation; not the default for this early-stage team |
| Existing Strapi auth extended in place | Current repository proves login and a custom Music bridge, not a standards-complete authorization server | Keep temporarily for migration; do not build a new OAuth server around it |

Sources: [Auth0 MCP availability](https://auth0.com/blog/auth0-auth-for-mcp-servers-generally-available/), [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [Keycloak MCP integration](https://www.keycloak.org/securing-apps/mcp-authz-server).

Better Auth sources: [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [MCP integration](https://better-auth.com/docs/plugins/mcp), [OAuth provider](https://better-auth.com/docs/plugins/oauth-provider). Its current MCP guide composes the MCP and CIMD plugins, and warns against also registering a separate OAuth-provider plugin on the same instance. The guide targets a newer protocol profile; do not assume its example's rejection of older protocols fits every OpenAI client. Pin compatible releases and prove the client's negotiated protocol/auth flow before selection. This research did not install or execute Better Auth.

The vendor recommendation is an architectural judgment, not a price comparison. Production user count, MAU mix, machine clients, region and recovery requirements were unavailable. Obtain a cost model and export/exit strategy before contracting.

### Required proof before provider selection

- Demonstrate anonymous discovery plus a real protected tool authorization-code/PKCE flow, discovery metadata and correct audience/scopes.
- Prove existing password/Google migration with source IDs retained. If password-hash export/import is unsupported, plan verified recovery or gradual migration; do not promise invisible password continuity.
- Exercise zero/multiple account mappings, suspended users, changed membership, refresh/revoke, key rotation, provider outage and socket closure.
- Prove web session/CSRF behavior and distinguish local logout, all-device logout and OAuth grant revocation.
- Confirm operational ownership, backup/export, retention, support, cost and separate machine authentication.

The safest first release remains public recommendation discovery backed by the same visibility policy as the web. Authenticated editing follows proven identity and application commands; monetization stays a separately reviewed scope.
