import { useMemo } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { CONFIG, EXPLORER, NATIVE } from "../lib/config";
import { totalsByToken } from "../lib/derive";
import { formatAmount, shortAddress } from "../lib/format";
import { Icon } from "../components/Icon";
import { Button, CopyAddress, EmptyState, Panel, PanelHead } from "../components/ui";

export function Tokens() {
  const { workspace, loading, refresh } = useWorkspace();
  const schedules = workspace?.schedules ?? [];
  const totals = useMemo(() => totalsByToken(schedules), [schedules]);

  const registry = useMemo(() => {
    const entries = [...(workspace?.tokens ?? [])];
    if (!entries.some((token) => token.native)) {
      entries.unshift({
        address: NATIVE,
        symbol: "BOT",
        name: "BOT (native)",
        decimals: 18,
        native: true,
        supported: true,
      });
    }
    return entries;
  }, [workspace]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Management / Token registry</p>
          <h1>Token registry</h1>
          <p className="page-sub">
            Tokens are discovered from the schedules the contract holds. VestiRail reads name,
            symbol and decimals directly from each contract; this registry is a view, not a
            separate allowlist.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="refresh" onClick={() => void refresh()}>
            Refresh registry
          </Button>
        </div>
      </header>

      <Panel>
        <PanelHead
          title="Recognised assets"
          description={`${registry.length} token${registry.length === 1 ? "" : "s"} referenced by schedules`}
          actions={<span className="badge badge-brand">BOT Chain Testnet</span>}
        />
        {loading && !workspace ? (
          <div className="panel-body">
            <EmptyState icon="token" title="Loading tokens" description="Resolving token metadata from the contract." />
          </div>
        ) : registry.length === 0 ? (
          <EmptyState
            icon="token"
            title="No tokens yet"
            description="A token appears here once it is used by a vesting schedule."
          />
        ) : (
          registry.map((token) => {
            const entry = totals.find(
              (candidate) => candidate.token.address.toLowerCase() === token.address.toLowerCase(),
            );
            const count = schedules.filter(
              (schedule) => schedule.token.address.toLowerCase() === token.address.toLowerCase(),
            ).length;
            return (
              <div className="registry-card" key={token.address}>
                <div className="registry-main">
                  <span className="registry-mark" aria-hidden="true">
                    {token.symbol.slice(0, 3)}
                  </span>
                  <div className="registry-text">
                    <strong>
                      {token.name} <span className="muted">· {token.symbol}</span>
                    </strong>
                    <span>
                      <CopyAddress address={token.address} chars={6} />
                    </span>
                  </div>
                </div>
                <div className="badge-row">
                  <span className="badge badge-neutral">{token.decimals} decimals</span>
                  {token.native ? <span className="badge badge-info">Native</span> : null}
                  {!token.supported ? <span className="badge badge-warn">Metadata unavailable</span> : null}
                  <span className="badge badge-neutral">{count} schedules</span>
                  <span className="mono-sm">
                    {entry
                      ? `${formatAmount(entry.allocated, token.decimals)} allocated`
                      : "No allocation"}
                  </span>
                  <a
                    className="icon-btn"
                    href={EXPLORER.address(token.address)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View ${token.symbol} on BOTScan`}
                  >
                    <Icon name="external" size={15} />
                  </a>
                </div>
              </div>
            );
          })
        )}
      </Panel>

      <div className="grid-2-even">
        <Panel>
          <PanelHead title="How discovery works" description="Read-only by design" />
          <div className="panel-body stack">
            <p className="breakdown-note">
              VestiRail calls <span className="mono-sm">symbol()</span>,{" "}
              <span className="mono-sm">name()</span> and <span className="mono-sm">decimals()</span>{" "}
              on every token address referenced by a schedule. There is no registry transaction:
              adding an asset to the product means creating a schedule with it, and the contract
              itself validates the token.
            </p>
            <p className="breakdown-note">
              Unsupported or non-standard tokens appear with a warning rather than invented
              metadata. Native BOT is represented by the zero address, exactly as the contract
              stores it.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Funding requirements" description="What operators must hold" />
          <div className="panel-body">
            <dl className="data-list">
              <div className="data-row">
                <dt>ERC-20 schedules</dt>
                <dd>Token balance plus BOT for gas</dd>
              </div>
              <div className="data-row">
                <dt>Native BOT schedules</dt>
                <dd>Allocation plus gas in the same wallet</dd>
              </div>
              <div className="data-row">
                <dt>Approval</dt>
                <dd>Exact allowance is requested per batch</dd>
              </div>
              <div className="data-row">
                <dt>Beneficiary</dt>
                <dd>Needs only gas to claim</dd>
              </div>
              <div className="data-row">
                <dt>Manager</dt>
                <dd className="mono-sm">{shortAddress(CONFIG.manager, 6)}</dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>
    </div>
  );
}
