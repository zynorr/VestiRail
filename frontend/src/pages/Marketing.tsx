import { Link } from "react-router-dom";
import "./../styles/marketing.css";
import { CONFIG, EXPLORER } from "../lib/config";
import { Icon } from "../components/Icon";

const navItems = [
  { href: "#product", label: "Platform" },
  { href: "#how-it-works", label: "How vesting works" },
  { href: "#beneficiaries", label: "For beneficiaries" },
  { href: "#security", label: "Transparency" },
  { href: "#faq", label: "FAQ" },
];

const faqs = [
  {
    q: "Can an operator revoke or edit a schedule?",
    a: "No. The deployed manager has no owner, no revocation, no sweep and no upgrade proxy. Once a schedule is funded, its beneficiary, token, start, cliff, duration and amount are fixed. VestiRail has no privileged control over it either.",
  },
  {
    q: "When can a beneficiary claim?",
    a: "Only at or after start + cliff. From that point the beneficiary can claim the vested amount minus whatever was already claimed. A claim reverts with NothingToClaim when the difference is zero, so duplicate claims are impossible.",
  },
  {
    q: "What happens exactly at the cliff?",
    a: "Accrual begins at the start date, not at the cliff. At start + cliff, the vested amount is total × cliffDuration / duration. A one-year cliff on a four-year schedule releases 25% at the cliff, then vests linearly.",
  },
  {
    q: "Which tokens are supported?",
    a: "Native BOT and standard ERC-20 tokens. Native funding must equal the batch total exactly. ERC-20 funding is verified by measuring the manager's balance change, so fee-on-transfer tokens are rejected rather than creating an unfunded liability.",
  },
  {
    q: "Who pays gas?",
    a: "The funder pays gas to create and fund schedules. The beneficiary pays gas only for their own claims — the contract transfers the vested tokens directly to their wallet.",
  },
  {
    q: "What does VestiRail store off chain?",
    a: "Only optional local schedule labels and references in your browser. Allocations, unlocks, claims and metrics are read from the contract. When the RPC or event log is unavailable, the interface says so instead of guessing.",
  },
];

function Brand() {
  return (
    <span className="brand-link">
      <span className="brand-mark" aria-hidden="true">
        <span />
      </span>
      <span className="brand-word">
        VestiRail
        <small>Token allocation OS</small>
      </span>
    </span>
  );
}

function ProductFrame() {
  return (
    <div className="mkt-frame">
      <div className="frame-bar">
        <span className="frame-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="frame-title">VestiRail · Token Operations</span>
        <span className="sample-tag">Sample data</span>
      </div>
      <div className="frame-body">
        <div className="frame-head">
          <div>
            <span className="frame-eyebrow">Overview</span>
            <strong>Vesting schedules</strong>
          </div>
          <span className="frame-chip">BOT Chain</span>
        </div>

        <div className="frame-metrics">
          <div>
            <span>Total allocated</span>
            <strong>12,500,000 <em>VBOT</em></strong>
          </div>
          <div>
            <span>Released</span>
            <strong>3,248,750 <em>VBOT</em></strong>
          </div>
          <div className="is-accent">
            <span>Available to claim</span>
            <strong>184,250 <em>VBOT</em></strong>
          </div>
        </div>

        <div className="frame-chart">
          <div className="frame-chart-top">
            <span>Cumulative vesting</span>
            <span className="frame-legend">
              <i /> Vested <i className="claimed" /> Claimed
            </span>
          </div>
          <svg viewBox="0 0 420 138" role="img" aria-label="Illustrative vesting curve">
            <defs>
              <linearGradient id="mkt-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#167a55" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#167a55" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {[26, 62, 98].map((y) => (
              <line key={y} x1="8" x2="412" y1={y} y2={y} stroke="#eef1ee" />
            ))}
            <path d="M8,122 L104,122 L322,30 L412,30 L412,122 Z" fill="url(#mkt-fill)" />
            <path d="M8,122 L104,122 L322,30 L412,30" fill="none" stroke="#167a55" strokeWidth="2" />
            <path d="M8,126 L104,126 L240,116 L322,74 L412,70" fill="none" stroke="#17211f" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="4 4" />
            <line x1="104" y1="16" x2="104" y2="126" stroke="#d3ddd6" strokeDasharray="3 3" />
            <line x1="244" y1="16" x2="244" y2="126" stroke="#d3ddd6" strokeDasharray="3 3" />
            <text x="104" y="12" fontSize="8" fill="#718078" fontFamily="monospace">CLIFF</text>
            <text x="248" y="12" fontSize="8" fill="#718078" fontFamily="monospace">NOW</text>
            <text x="8" y="135" fontSize="8" fill="#8d9a92" fontFamily="monospace">START</text>
            <text x="360" y="135" fontSize="8" fill="#8d9a92" fontFamily="monospace">4 YEARS</text>
          </svg>
        </div>

        <div className="frame-rows">
          <div className="frame-row">
            <span className="frame-avatar">CC</span>
            <div>
              <strong>Core contributor</strong>
              <span>0x7D4f…069F · Cliff + linear</span>
            </div>
            <div className="frame-row-amount">
              <strong>4,000,000</strong>
              <span className="frame-status is-claimable">Claimable</span>
            </div>
          </div>
          <div className="frame-row">
            <span className="frame-avatar">IN</span>
            <div>
              <strong>Seed investor</strong>
              <span>0x15C4…a24F · 12 month cliff</span>
            </div>
            <div className="frame-row-amount">
              <strong>6,500,000</strong>
              <span className="frame-status">Active</span>
            </div>
          </div>
          <div className="frame-row">
            <span className="frame-avatar">AD</span>
            <div>
              <strong>Advisor</strong>
              <span>0x91aB…72cD · 6 month cliff</span>
            </div>
            <div className="frame-row-amount">
              <strong>2,000,000</strong>
              <span className="frame-status">Upcoming</span>
            </div>
          </div>
        </div>
      </div>
      <p className="frame-note">
        Illustrative interface with sample values. Your workspace renders contract data only.
      </p>
    </div>
  );
}

export function Marketing() {
  return (
    <div className="mkt">
      <header className="mkt-header">
        <div className="mkt-container mkt-header-inner">
          <Link to="/" aria-label="VestiRail home" className="mkt-brand-link">
            <Brand />
          </Link>
          <nav className="mkt-nav" aria-label="Marketing">
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mkt-header-actions">
            <Link className="mkt-link" to="/portal">
              Beneficiary portal
            </Link>
            <Link to="/app" className="btn btn-primary btn-sm">
              Open workspace
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <details className="mkt-mobile">
            <summary aria-label="Open menu">
              <Icon name="menu" size={19} />
            </summary>
            <div className="mkt-mobile-menu">
              {navItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
              <Link to="/portal">Beneficiary portal</Link>
              <Link to="/app">Open workspace</Link>
            </div>
          </details>
        </div>
      </header>

      <main>
        <section className="mkt-hero">
          <div className="mkt-container hero-grid">
            <div className="hero-copy">
              <p className="mkt-eyebrow">Token vesting · BOT Chain</p>
              <h1>Token Vesting, Without the Complexity.</h1>
              <p className="hero-sub">
                Create transparent on-chain vesting schedules, manage token allocations and give
                every beneficiary a clear view of their unlock journey.
              </p>
              <div className="hero-actions">
                <Link to="/app/create" className="btn btn-primary btn-md">
                  Create a Vesting Schedule
                  <Icon name="arrowRight" size={15} />
                </Link>
                <a href="#product" className="btn btn-secondary btn-md">
                  Explore the Platform
                </a>
              </div>
              <ul className="hero-trust">
                <li>
                  <Icon name="shield" size={14} /> Immutable schedules
                </li>
                <li>
                  <Icon name="lock" size={14} /> No admin withdrawal
                </li>
                <li>
                  <Icon name="check" size={14} /> Contract-verified balances
                </li>
              </ul>
            </div>
            <ProductFrame />
          </div>
        </section>

        <section className="mkt-section" id="product">
          <div className="mkt-container">
            <div className="mkt-section-head">
              <p className="mkt-eyebrow">The platform</p>
              <h2>One register for every allocation.</h2>
              <p className="mkt-lede">
                VestiRail turns the vesting contract into an operating surface: a schedule
                register, a funding workflow and a beneficiary experience that share one source of
                truth.
              </p>
            </div>
            <div className="mkt-cols-3">
              <article className="mkt-feature">
                <span className="feature-num">01</span>
                <h3>Allocation control</h3>
                <p>
                  Draft team, investor and advisor allocations, set cliffs and durations, and fund
                  the exact amount the contract records. Review the unlock curve before signing.
                </p>
              </article>
              <article className="mkt-feature">
                <span className="feature-num">02</span>
                <h3>Operational visibility</h3>
                <p>
                  A live register of every schedule, beneficiary and release. Filter by status,
                  export the register, and see which allocations are claimable today.
                </p>
              </article>
              <article className="mkt-feature">
                <span className="feature-num">03</span>
                <h3>Beneficiary clarity</h3>
                <p>
                  Recipients connect a wallet and see their own allocation, unlock timeline and
                  claimable balance — with a claim flow that explains every state.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-dark" id="how-it-works">
          <div className="mkt-container mkt-dark-grid">
            <div>
              <p className="mkt-eyebrow is-light">How vesting works</p>
              <h2>Cliff plus linear. One formula, no surprises.</h2>
              <p className="mkt-lede is-light">
                The cliff gates claims; it does not move the accrual origin. A four-year schedule
                with a one-year cliff is 25% vested at the cliff, then releases linearly until the
                end date.
              </p>
              <div className="mkt-formula">
                vested = total × (now − start) ÷ duration
                <span>zero before start + cliff · total at start + duration</span>
              </div>
              <p className="mkt-fineprint">
                Integer division floors, exactly like the EVM. VestiRail uses the same formula
                module as its parity tests, so the curve you see is the curve the contract pays.
              </p>
            </div>
            <div className="mkt-track-card">
              <div className="mkt-track">
                <span className="mkt-track-fill" style={{ width: "62%" }} />
                <span className="mkt-track-cliff" style={{ left: "25%" }} />
                <span className="mkt-track-now" style={{ left: "62%" }} />
              </div>
              <div className="mkt-track-labels">
                <div>
                  <span>Start</span>
                  <strong>Accrual begins</strong>
                </div>
                <div>
                  <span>Cliff</span>
                  <strong>First claim</strong>
                </div>
                <div>
                  <span>Now</span>
                  <strong>Vested to date</strong>
                </div>
                <div>
                  <span>End</span>
                  <strong>100% vested</strong>
                </div>
              </div>
              <dl className="mkt-dark-data">
                <div>
                  <dt>Vested at cliff</dt>
                  <dd>25.00%</dd>
                </div>
                <div>
                  <dt>Vested today</dt>
                  <dd>62.00%</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>38.00%</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="creation">
          <div className="mkt-container mkt-split">
            <div>
              <p className="mkt-eyebrow">Schedule creation</p>
              <h2>A guided financial workflow, not a form.</h2>
              <p className="mkt-lede">
                Five deliberate steps with validation at each one: token, beneficiary, vesting
                terms, review and confirmation.
              </p>
              <ul className="mkt-checklist">
                <li>
                  <Icon name="check" size={14} /> Live unlock curve that updates with dates and
                  duration
                </li>
                <li>
                  <Icon name="check" size={14} /> Exact funding amount and gas estimate before
                  signing
                </li>
                <li>
                  <Icon name="check" size={14} /> Explicit confirmation states — never a fabricated
                  success
                </li>
                <li>
                  <Icon name="check" size={14} /> BOTScan link and the new schedule ID after the
                  receipt
                </li>
              </ul>
              <Link to="/app/create" className="inline-link">
                Open the creation workflow <Icon name="arrowRight" size={13} />
              </Link>
            </div>
            <div className="mkt-steps-card">
              <div className="mkt-steps-head">
                <span className="mkt-eyebrow">Create vesting schedule</span>
                <span className="step-counter">3 / 5</span>
              </div>
              <ol className="mkt-steps">
                {[
                  "Token",
                  "Beneficiary",
                  "Vesting terms",
                  "Review",
                  "Confirmation",
                ].map((title, index) => (
                  <li
                    key={title}
                    className={index < 2 ? "is-done" : index === 2 ? "is-current" : ""}
                  >
                    <span className="mkt-step-num">
                      {index < 2 ? <Icon name="check" size={10} /> : index + 1}
                    </span>
                    {title}
                  </li>
                ))}
              </ol>
              <div className="mkt-mini-form">
                <div className="mkt-mini-field">
                  <span>Start date</span>
                  <strong>01 Jan 2027 · 00:00 UTC</strong>
                </div>
                <div className="mkt-mini-row">
                  <div className="mkt-mini-field">
                    <span>Cliff</span>
                    <strong>12 months</strong>
                  </div>
                  <div className="mkt-mini-field">
                    <span>Duration</span>
                    <strong>48 months</strong>
                  </div>
                </div>
                <div className="mkt-mini-preview">
                  <span>First claimable at cliff</span>
                  <strong>1,000,000 VBOT</strong>
                  <span>25% of allocation, then linear</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mkt-section mkt-surface" id="beneficiaries">
          <div className="mkt-container mkt-split is-reverse">
            <div className="mkt-portal-card">
              <div className="mkt-portal-head">
                <span className="mkt-portal-brand">
                  <i className="brand-mark" aria-hidden="true">
                    <span />
                  </i>
                  Beneficiary portal
                </span>
                <span className="frame-chip">BOT Chain</span>
              </div>
              <p className="mkt-portal-label">Available to claim</p>
              <p className="mkt-portal-amount">
                84,375 <em>VBOT</em>
              </p>
              <p className="mkt-portal-sub">Next unlock 01 Jul 2027 · 31,250 VBOT</p>
              <button type="button" className="btn btn-primary btn-md" tabIndex={-1} aria-hidden="true">
                Claim 84,375 VBOT
              </button>
              <div className="mkt-portal-row">
                <span>Total allocated</span>
                <strong>1,000,000 VBOT</strong>
              </div>
              <div className="mkt-portal-row">
                <span>Claimed</span>
                <strong>250,000 VBOT</strong>
              </div>
              <div className="mkt-portal-row">
                <span>Remaining locked</span>
                <strong>665,625 VBOT</strong>
              </div>
              <p className="frame-note">Illustrative beneficiary view with sample values.</p>
            </div>
            <div>
              <p className="mkt-eyebrow">Beneficiary experience</p>
              <h2>Clarity for the people receiving the allocation.</h2>
              <p className="mkt-lede">
                Beneficiaries should not need to read a contract to understand their allocation.
                The portal answers four questions immediately: what was allocated, what has
                vested, what can be claimed, and when the next release arrives.
              </p>
              <ul className="mkt-checklist">
                <li>
                  <Icon name="check" size={14} /> A single claimable figure, with the next unlock
                  date when it is zero
                </li>
                <li>
                  <Icon name="check" size={14} /> Per-schedule timelines, never merged vesting
                  mathematics
                </li>
                <li>
                  <Icon name="check" size={14} /> Fee estimate and honest transaction states
                </li>
                <li>
                  <Icon name="check" size={14} /> The same contract on BOTScan for independent
                  verification
                </li>
              </ul>
              <Link to="/portal" className="inline-link">
                Open the beneficiary portal <Icon name="arrowRight" size={13} />
              </Link>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="bulk">
          <div className="mkt-container">
            <div className="mkt-section-head">
              <p className="mkt-eyebrow">Bulk allocations</p>
              <h2>Batch funding with validation in front of the contract.</h2>
              <p className="mkt-lede">
                Upload a CSV, inspect every row, resolve duplicates and invalid addresses, then
                fund in batches of up to {CONFIG.maxBatchSize}. Nothing invalid reaches the chain.
              </p>
            </div>
            <div className="mkt-split mkt-bulk-grid">
              <div className="mkt-bulk-table">
                <div className="mkt-bulk-head">
                  <span>Beneficiary</span>
                  <span>Allocation</span>
                  <span>Status</span>
                </div>
                {[
                  ["0x7D4f…069F", "250,000", "valid"],
                  ["0x15C4…a24F", "1,250,000", "valid"],
                  ["0x7D4f…069F", "90,000", "duplicate"],
                  ["not-an-address", "45,000", "invalid address"],
                  ["0x91aB…72cD", "—", "incomplete"],
                ].map(([address, amount, status], index) => (
                  <div className={`mkt-bulk-row ${status === "valid" ? "" : "is-bad"}`.trim()} key={index}>
                    <span className="mono">{address}</span>
                    <span className="mono">{amount}</span>
                    <span className={`mkt-bulk-status ${status === "valid" ? "is-ok" : "is-error"}`.trim()}>
                      {status}
                    </span>
                  </div>
                ))}
                <div className="mkt-bulk-foot">
                  <span>3 valid · 3 issues</span>
                  <span>412,000 VBOT required</span>
                </div>
              </div>
              <div>
                <ul className="mkt-checklist">
                  <li>
                    <Icon name="check" size={14} /> Drag-and-drop CSV with a downloadable template
                  </li>
                  <li>
                    <Icon name="check" size={14} /> Row-level errors for address, amount,
                    duplicates and missing fields
                  </li>
                  <li>
                    <Icon name="check" size={14} /> Batch limits surfaced before funding, with the
                    exact transaction count
                  </li>
                  <li>
                    <Icon name="check" size={14} /> Per-batch confirmation and transaction links
                  </li>
                </ul>
                <div className="mkt-callout">
                  <Icon name="shield" size={16} />
                  <span>
                    The CSV never leaves the browser. Only validated schedule inputs are sent to
                    the contract.
                  </span>
                </div>
                <Link to="/app/bulk" className="inline-link" style={{ marginTop: 14 }}>
                  Open bulk allocations <Icon name="arrowRight" size={13} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mkt-dark" id="security">
          <div className="mkt-container">
            <div className="mkt-section-head">
              <p className="mkt-eyebrow is-light">On-chain transparency</p>
              <h2>Every number has a source.</h2>
              <p className="mkt-lede is-light">
                VestiRail is a read-and-sign interface, not a custodian. Allocations, vesting and
                claims live in one immutable contract on BOT Chain.
              </p>
            </div>
            <div className="mkt-cols-4">
              <div className="mkt-fact">
                <span>Contract</span>
                <a href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
                  {CONFIG.manager.slice(0, 10)}…{CONFIG.manager.slice(-6)}
                  <Icon name="external" size={12} />
                </a>
              </div>
              <div className="mkt-fact">
                <span>Admin powers</span>
                <strong>None</strong>
              </div>
              <div className="mkt-fact">
                <span>Revocation</span>
                <strong>Not supported</strong>
              </div>
              <div className="mkt-fact">
                <span>Funding check</span>
                <strong>Exact, on chain</strong>
              </div>
            </div>
            <div className="mkt-security-copy">
              <ul className="mkt-checklist is-light">
                <li>
                  <Icon name="check" size={14} /> No owner, sweep, pause, upgrade proxy or admin
                  withdrawal exists in the contract.
                </li>
                <li>
                  <Icon name="check" size={14} /> Claims are paid by the contract directly to the
                  beneficiary; VestiRail never holds funds.
                </li>
                <li>
                  <Icon name="check" size={14} /> If the RPC fails, the interface shows a sync
                  warning and a retry — not zero balances or invented history.
                </li>
              </ul>
              <a href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                Verify the contract on BOTScan
                <Icon name="external" size={14} />
              </a>
            </div>
          </div>
        </section>

        <section className="mkt-section mkt-surface">
          <div className="mkt-container">
            <div className="mkt-section-head">
              <p className="mkt-eyebrow">Supported assets</p>
              <h2>Native BOT and standard ERC-20.</h2>
              <p className="mkt-lede">
                Each schedule tracks one asset. VestiRail reads metadata from the token itself and
                refuses to print values it cannot verify.
              </p>
            </div>
            <div className="mkt-token-grid">
              <article className="mkt-token-card">
                <div className="mkt-token-top">
                  <span className="mkt-token-mark">BOT</span>
                  <div>
                    <h3>Native BOT</h3>
                    <span className="mono">18 decimals · chain asset</span>
                  </div>
                </div>
                <p>
                  Funded with <span className="mono">msg.value</span>. One wei over or under the
                  batch total reverts, so the contract can never be funded short.
                </p>
              </article>
              <article className="mkt-token-card">
                <div className="mkt-token-top">
                  <span className="mkt-token-mark">20</span>
                  <div>
                    <h3>ERC-20 tokens</h3>
                    <span className="mono">Any standard decimals</span>
                  </div>
                </div>
                <p>
                  Funding is verified by the manager&apos;s balance change around{" "}
                  <span className="mono">transferFrom</span>. Fee-on-transfer tokens are rejected
                  instead of creating an unfunded liability.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mkt-section" id="faq">
          <div className="mkt-container mkt-faq-grid">
            <div>
              <p className="mkt-eyebrow">FAQ</p>
              <h2>Questions an operator should ask.</h2>
              <p className="mkt-lede">
                If something is not answered here, the contract and its event log are the
                authority.
              </p>
              <a
                className="inline-link"
                href={EXPLORER.address(CONFIG.manager)}
                target="_blank"
                rel="noreferrer"
              >
                Inspect the deployment <Icon name="external" size={12} />
              </a>
            </div>
            <div className="mkt-faq">
              {faqs.map((faq) => (
                <details key={faq.q}>
                  <summary>
                    {faq.q}
                    <span className="faq-plus" aria-hidden="true">
                      +
                    </span>
                  </summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mkt-section">
          <div className="mkt-container">
            <div className="mkt-cta">
              <p className="mkt-eyebrow is-light">Start with one schedule</p>
              <h2>Lock allocations. Release on schedule.</h2>
              <p>
                Set up your first on-chain vesting schedule, or open the workspace to inspect the
                live deployment before committing anything.
              </p>
              <div className="mkt-cta-actions">
                <Link to="/app/create" className="btn btn-cta btn-md">
                  Create a Vesting Schedule
                  <Icon name="arrowRight" size={15} />
                </Link>
                <Link to="/app" className="btn btn-ghost-cta btn-md">
                  Open the workspace
                </Link>
              </div>
              <p className="mkt-cta-note">Runs on BOT Chain Testnet · chain ID {CONFIG.chainId}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mkt-footer">
        <div className="mkt-container">
          <div className="mkt-footer-grid">
            <div>
              <Brand />
              <p className="mkt-footer-copy">
                Token vesting and allocation management for teams that need a verifiable release
                schedule.
              </p>
            </div>
            <div>
              <p className="mkt-footer-title">Product</p>
              <Link to="/app">Overview</Link>
              <Link to="/app/schedules">Vesting schedules</Link>
              <Link to="/app/bulk">Bulk allocations</Link>
              <Link to="/app/reports">Reports</Link>
            </div>
            <div>
              <p className="mkt-footer-title">Beneficiaries</p>
              <Link to="/portal">Claim portal</Link>
              <a href="#faq">Claiming FAQ</a>
              <a href="#how-it-works">Vesting formula</a>
            </div>
            <div>
              <p className="mkt-footer-title">Network</p>
              <a href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">
                Testnet faucet <Icon name="external" size={11} />
              </a>
              <a href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
                Contract <Icon name="external" size={11} />
              </a>
              <span className="mono">Chain {CONFIG.chainId}</span>
            </div>
          </div>
          <div className="mkt-footer-bottom">
            <span>© {new Date().getFullYear()} VestiRail. BOT Chain testnet deployment.</span>
            <span className="mono">
              {CONFIG.manager.slice(0, 8)}…{CONFIG.manager.slice(-6)}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
