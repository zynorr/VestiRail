import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { CONFIG, EXPLORER } from "../lib/config";
import { nextUnlock, scheduleStatus, totalsByToken } from "../lib/derive";
import { formatAmount, formatDateTime, sameAddress, shortAddress } from "../lib/format";
import { getLabel } from "../lib/labels";
import type { Schedule } from "../lib/types";
import { ClaimPanel } from "../components/ClaimPanel";
import { Icon } from "../components/Icon";
import { UnlockCurve } from "../components/UnlockCurve";
import { VestingTimeline } from "../components/VestingTimeline";
import {
  Button,
  CopyAddress,
  EmptyState,
  Modal,
  Notice,
  Panel,
  PanelHead,
  StatusBadge,
} from "../components/ui";

const DAY = 86_400n;

export function Portal() {
  const { account, connect, connecting, error: walletError, clearError } = useWallet();
  const { workspace, loading, error, refresh } = useWorkspace();
  const [claimTarget, setClaimTarget] = useState<Schedule | null>(null);

  const schedules = useMemo(
    () =>
      workspace?.schedules.filter((schedule) => sameAddress(schedule.beneficiary, account)) ?? [],
    [workspace, account],
  );
  const now = workspace?.chainNow ?? 0n;
  const totals = useMemo(() => totalsByToken(schedules), [schedules]);
  const claimable = schedules.reduce((sum, schedule) => sum + schedule.claimable, 0n);
  const primary =
    schedules
      .filter((schedule) => schedule.claimable > 0n)
      .sort((a, b) => Number(b.claimable - a.claimable))[0] ??
    schedules
      .slice()
      .sort((a, b) => Number(a.endedAt - b.endedAt))[0] ??
    null;

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <Link to="/" className="brand-link" aria-label="VestiRail home">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-word">
            VestiRail
            <small>Beneficiary portal</small>
          </span>
        </Link>
        <div className="topbar-right">
          <span className="network-pill">
            <i className="network-dot" />
            {CONFIG.chainName}
          </span>
          {account ? (
            <span className="badge badge-brand" title={account}>
              {shortAddress(account, 5)}
            </span>
          ) : (
            <Button variant="primary" size="sm" icon="wallet" onClick={() => void connect()} loading={connecting}>
              Connect wallet
            </Button>
          )}
        </div>
      </header>

      <main className="portal-main">
        <div className="portal-hero">
          <p className="eyebrow">Your allocation</p>
          <h1>Your Tokens. Your Unlock Schedule.</h1>
          <p>
            See exactly what has vested, what you can claim now and when the next release becomes
            available. Every figure is read from the VestingManager contract on BOT Chain.
          </p>
        </div>

        {walletError ? (
          <Notice
            tone="error"
            title="Wallet"
            action={
              <Button variant="secondary" size="sm" onClick={clearError}>
                Dismiss
              </Button>
            }
          >
            {walletError}
          </Notice>
        ) : null}

        {error ? (
          <Notice
            tone="warn"
            title="Could not refresh your allocation"
            action={
              <Button variant="secondary" size="sm" onClick={() => void refresh()}>
                Retry
              </Button>
            }
          >
            {error}
          </Notice>
        ) : null}

        {!account ? (
          <Panel>
            <div className="panel-body stack-16" style={{ textAlign: "center", alignItems: "center", padding: "40px 24px" }}>
              <span className="empty-icon" aria-hidden="true">
                <Icon name="wallet" size={22} />
              </span>
              <h2 className="panel-title">Connect the wallet that received the allocation</h2>
              <p className="page-sub" style={{ maxWidth: 480 }}>
                VestiRail reads schedules for the connected address only. Connecting never moves
                tokens; claiming is a separate transaction you approve in your wallet.
              </p>
              <Button variant="primary" icon="wallet" onClick={() => void connect()} loading={connecting}>
                Connect wallet
              </Button>
              <p className="figure-hint">
                New to BOT Chain? The{" "}
                <a className="inline-link" href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">
                  testnet faucet <Icon name="external" size={11} />
                </a>{" "}
                provides gas for claims.
              </p>
            </div>
          </Panel>
        ) : loading && !workspace ? (
          <Panel>
            <div className="panel-body">
              <EmptyState icon="clock" title="Reading your schedules" description="Querying the VestingManager for this wallet." />
            </div>
          </Panel>
        ) : schedules.length === 0 ? (
          <Panel>
            <EmptyState
              icon="beneficiaries"
              title="No allocations found for this wallet"
              description={`${shortAddress(account, 6)} has no vesting schedules in the deployed contract. If an operator allocated to a different address, connect that wallet instead.`}
              action={
                <Button variant="secondary" icon="refresh" onClick={() => void refresh()}>
                  Check again
                </Button>
              }
            />
          </Panel>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-label">Total allocated</span>
                <span className="stat-values">
                  {totals.map((entry) => (
                    <span className="stat-value" key={entry.token.symbol}>
                      {formatAmount(entry.allocated, entry.token.decimals)}{" "}
                      <span className="stat-unit">{entry.token.symbol}</span>
                    </span>
                  ))}
                </span>
                <span className="stat-hint">
                  {schedules.length} schedule{schedules.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Claimed so far</span>
                <span className="stat-values">
                  {totals.map((entry) => (
                    <span className="stat-value" key={entry.token.symbol}>
                      {formatAmount(entry.claimed, entry.token.decimals)}{" "}
                      <span className="stat-unit">{entry.token.symbol}</span>
                    </span>
                  ))}
                </span>
                <span className="stat-hint">Paid to this wallet on chain</span>
              </div>
              <div className="stat-tile stat-emphasis">
                <span className="stat-label">Available to claim</span>
                <span className="stat-values">
                  {totals.map((entry) => (
                    <span className="stat-value" key={entry.token.symbol}>
                      {formatAmount(entry.claimable, entry.token.decimals)}{" "}
                      <span className="stat-unit">{entry.token.symbol}</span>
                    </span>
                  ))}
                </span>
                <span className="stat-hint">
                  {claimable > 0n ? "Ready now — claim below" : "Nothing claimable yet"}
                </span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Remaining locked</span>
                <span className="stat-values">
                  {totals.map((entry) => (
                    <span className="stat-value" key={entry.token.symbol}>
                      {formatAmount(entry.locked, entry.token.decimals)}{" "}
                      <span className="stat-unit">{entry.token.symbol}</span>
                    </span>
                  ))}
                </span>
                <span className="stat-hint">Vests according to each schedule</span>
              </div>
            </div>

            <div className="portal-grid">
              <div className="stack-16">
                {primary ? (
                  <Panel>
                    <PanelHead
                      title={getLabel(primary.id.toString())?.label ?? `Schedule #${primary.id}`}
                      description={`${primary.token.name} · fully vested ${formatDateTime(primary.endedAt)}`}
                      actions={<StatusBadge status={scheduleStatus(primary, now)} />}
                    />
                    <div className="panel-body">
                      <VestingTimeline schedule={primary} now={now} compact />
                      <div style={{ marginTop: 16 }}>
                        <UnlockCurve
                          items={[primary]}
                          events={workspace?.events ?? []}
                          tokenAddress={primary.token.address}
                          from={primary.start - 5n * DAY}
                          to={primary.endedAt + 5n * DAY}
                          now={now}
                          height={190}
                          symbol={primary.token.symbol}
                          decimals={primary.token.decimals}
                          showClaimed={workspace?.logsAvailable ?? false}
                        />
                      </div>
                    </div>
                  </Panel>
                ) : null}

                <Panel>
                  <PanelHead
                    title="All your schedules"
                    description="Each schedule unlocks independently."
                    actions={
                      <Link className="inline-link" to="/app/schedules">
                        Full detail <Icon name="arrowRight" size={13} />
                      </Link>
                    }
                  />
                  {schedules.map((schedule) => {
                    const unlock = nextUnlock(schedule, now);
                    return (
                      <div className="portal-schedule" key={schedule.id.toString()}>
                        <div className="portal-schedule-main">
                          <strong>
                            #{schedule.id.toString()} · {schedule.token.symbol}
                          </strong>
                          <span>
                            {getLabel(schedule.id.toString())?.label ?? "Vesting schedule"} ·{" "}
                            {formatAmount(schedule.total, schedule.token.decimals)}{" "}
                            {schedule.token.symbol}
                          </span>
                          <span>
                            {unlock
                              ? `Next ${formatAmount(unlock.amount, schedule.token.decimals)} on ${formatDateTime(unlock.at)}`
                              : "Fully claimed"}
                          </span>
                        </div>
                        <div className="portal-schedule-side">
                          <span>
                            {formatAmount(schedule.claimable, schedule.token.decimals)}{" "}
                            {schedule.token.symbol} claimable
                          </span>
                          <div className="row" style={{ gap: 6 }}>
                            <Link to={`/app/schedules/${schedule.id}`}>
                              <Button variant="secondary" size="sm">
                                Details
                              </Button>
                            </Link>
                            <Button
                              variant={schedule.claimable > 0n ? "primary" : "secondary"}
                              size="sm"
                              onClick={() => setClaimTarget(schedule)}
                              disabled={schedule.claimable === 0n}
                            >
                              {schedule.claimable > 0n ? "Claim" : "Locked"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </Panel>
              </div>

              <div className="stack-16">
                {schedules
                  .filter((schedule) => schedule.claimable > 0n)
                  .slice(0, 1)
                  .map((schedule) => (
                    <ClaimPanel key={schedule.id.toString()} schedule={schedule} />
                  ))}

                {claimable === 0n ? (
                  <Panel>
                    <PanelHead title="Nothing to claim right now" description="Your allocation is still vesting." />
                    <div className="panel-body stack">
                      {schedules
                        .map((schedule) => ({ schedule, unlock: nextUnlock(schedule, now) }))
                        .filter((entry) => entry.unlock !== null)
                        .slice(0, 3)
                        .map(({ schedule, unlock }) => (
                          <div className="data-row" key={schedule.id.toString()}>
                            <dt>#{schedule.id.toString()}</dt>
                            <dd>
                              {unlock ? formatDateTime(unlock.at) : "—"}
                              <span className="cell-sub">
                                {unlock
                                  ? `${formatAmount(unlock.amount, schedule.token.decimals)} ${schedule.token.symbol}`
                                  : ""}
                              </span>
                            </dd>
                          </div>
                        ))}
                      <p className="breakdown-note">
                        Claiming becomes available at the cliff, or as tokens vest if you are past
                        it. The claim button activates automatically once the contract reports a
                        vested balance.
                      </p>
                    </div>
                  </Panel>
                ) : null}

                <Panel>
                  <PanelHead title="Where this comes from" description="Verify independently" />
                  <div className="panel-body">
                    <dl className="data-list">
                      <div className="data-row">
                        <dt>Your wallet</dt>
                        <dd>
                          <CopyAddress address={account} chars={5} />
                        </dd>
                      </div>
                      <div className="data-row">
                        <dt>VestingManager</dt>
                        <dd>
                          <CopyAddress address={CONFIG.manager} chars={5} />
                        </dd>
                      </div>
                      <div className="data-row">
                        <dt>Network</dt>
                        <dd>{CONFIG.chainName}</dd>
                      </div>
                      <div className="data-row">
                        <dt>Contract state</dt>
                        <dd>Block {workspace?.blockNumber ?? "—"}</dd>
                      </div>
                      <div className="data-row">
                        <dt>Explorer</dt>
                        <dd>
                          <a className="inline-link" href={EXPLORER.address(account)} target="_blank" rel="noreferrer">
                            Your account <Icon name="external" size={11} />
                          </a>
                        </dd>
                      </div>
                    </dl>
                    <p className="breakdown-note">
                      VestiRail never takes custody. Claimed tokens are transferred by the contract
                      directly to your wallet. You pay only the network fee for a claim.
                    </p>
                  </div>
                </Panel>
              </div>
            </div>
          </>
        )}

        <footer className="panel-footer" style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }}>
          <span>
            VestiRail · Token allocation management on {CONFIG.chainName}
          </span>
          <span className="row" style={{ gap: 14 }}>
            <Link className="inline-link" to="/">
              About VestiRail
            </Link>
            <a className="inline-link" href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
              Contract <Icon name="external" size={11} />
            </a>
          </span>
        </footer>
      </main>

      <Modal
        open={claimTarget !== null}
        onClose={() => setClaimTarget(null)}
        title={claimTarget ? `Claim from schedule #${claimTarget.id}` : "Claim"}
      >
        {claimTarget ? (
          <div className="stack-16">
            <p className="breakdown-note">
              This claims everything currently vested and unclaimed in schedule #
              {claimTarget.id.toString()}. The contract calculates the amount; the estimate below
              is read live.
            </p>
            <ClaimPanel
              schedule={claimTarget}
              onClaimed={() => setClaimTarget(null)}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
