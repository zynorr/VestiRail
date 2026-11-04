import { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { useWallet } from "../context/WalletContext";
import { CONFIG, EXPLORER } from "../lib/config";
import { clearLabels, getAllLabels } from "../lib/labels";
import { formatDate, shortAddress } from "../lib/format";
import { Icon } from "../components/Icon";
import { Button, CopyAddress, Notice, Panel, PanelHead } from "../components/ui";

export function Settings() {
  const { workspace, refresh, lastSyncedAt } = useWorkspace();
  const { account, chainId, connect, connecting, ensureNetwork } = useWallet();
  const [labelsVersion, setLabelsVersion] = useState(0);
  const labels = getAllLabels();
  const entries = Object.entries(labels).sort((a, b) => Number(b[0]) - Number(a[0]));
  const wrongNetwork = chainId !== null && chainId !== CONFIG.chainId;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Management / Settings</p>
          <h1>Settings</h1>
          <p className="page-sub">
            Network, contract and local metadata for this workspace. Operational settings are
            deliberately limited: the contract is the source of truth and this client holds no
            privileged controls.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="refresh" onClick={() => void refresh()}>
            Sync now
          </Button>
        </div>
      </header>

      {wrongNetwork ? (
        <Notice
          tone="warn"
          title="Wallet is on a different network"
          action={
            <Button variant="secondary" size="sm" onClick={() => void ensureNetwork()}>
              Switch network
            </Button>
          }
        >
          The connected wallet reports chain {chainId}. Transactions require {CONFIG.chainName} (
          {CONFIG.chainId}).
        </Notice>
      ) : null}

      <div className="grid-2-even">
        <Panel>
          <PanelHead title="Network & contract" description="Read path used by this app" />
          <div className="panel-body">
            <dl className="data-list">
              <div className="data-row">
                <dt>Network</dt>
                <dd>{CONFIG.chainName}</dd>
              </div>
              <div className="data-row">
                <dt>Chain ID</dt>
                <dd className="mono-sm">{CONFIG.chainId}</dd>
              </div>
              <div className="data-row">
                <dt>RPC endpoint</dt>
                <dd className="mono-sm">rpc.bohr.life</dd>
              </div>
              <div className="data-row">
                <dt>VestingManager</dt>
                <dd>
                  <CopyAddress address={CONFIG.manager} chars={6} />
                </dd>
              </div>
              <div className="data-row">
                <dt>Deployment block</dt>
                <dd className="mono-sm">{CONFIG.deployBlock}</dd>
              </div>
              <div className="data-row">
                <dt>Explorer</dt>
                <dd>
                  <a className="inline-link" href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
                    BOTScan <Icon name="external" size={12} />
                  </a>
                </dd>
              </div>
              <div className="data-row">
                <dt>Refresh interval</dt>
                <dd>{CONFIG.refreshMs / 1000}s</dd>
              </div>
              <div className="data-row">
                <dt>Latest read</dt>
                <dd>
                  {lastSyncedAt
                    ? `${lastSyncedAt.toLocaleTimeString("en-GB", { hour12: false })} · block ${
                        workspace?.blockNumber ?? "—"
                      }`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Wallet session" description="Signing identity for this browser" />
          <div className="panel-body">
            {account ? (
              <dl className="data-list">
                <div className="data-row">
                  <dt>Account</dt>
                  <dd>
                    <CopyAddress address={account} chars={6} />
                  </dd>
                </div>
                <div className="data-row">
                  <dt>Reported chain</dt>
                  <dd className={wrongNetwork ? "mono-sm" : "mono-sm"}>
                    {chainId ?? "unknown"}
                    {wrongNetwork ? " · switch required" : ""}
                  </dd>
                </div>
                <div className="data-row">
                  <dt>Role</dt>
                  <dd>{account.toLowerCase() === CONFIG.deployer.toLowerCase() ? "Deployer" : "Beneficiary / operator"}</dd>
                </div>
                <div className="data-row">
                  <dt>Chain time</dt>
                  <dd>{workspace ? formatDate(workspace.chainNow) : "—"}</dd>
                </div>
              </dl>
            ) : (
              <div className="stack-16">
                <p className="breakdown-note">
                  No wallet is connected. Contract state is fully readable without one; signing a
                  claim or a schedule creation requires an injected wallet on BOT Chain Testnet.
                </p>
                <Button variant="primary" icon="wallet" onClick={() => void connect()} loading={connecting}>
                  Connect wallet
                </Button>
              </div>
            )}

            <div className="switch-row" style={{ marginTop: 6 }}>
              <div>
                <strong>Beneficiary portal</strong>
                <p>A simplified claim experience for recipients.</p>
              </div>
              <a className="inline-link" href="/portal">
                Open <Icon name="arrowRight" size={13} />
              </a>
            </div>
            <div className="switch-row">
              <div>
                <strong>Contract on BOTScan</strong>
                <p>Verify state independently of this interface.</p>
              </div>
              <a className="inline-link" href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
                Open <Icon name="external" size={12} />
              </a>
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHead
          title="Local schedule labels"
          description="Stored in this browser only. Never written on chain and never presented as contract data."
          actions={
            entries.length > 0 ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  clearLabels();
                  setLabelsVersion((value) => value + 1);
                }}
              >
                Clear local labels
              </Button>
            ) : null
          }
        />
        <div className="panel-body" key={labelsVersion}>
          {entries.length === 0 ? (
            <p className="breakdown-note">
              No local labels stored. Labels are added when you create a schedule or from its
              detail page, and remain on this device.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Schedule</th>
                    <th scope="col">Label</th>
                    <th scope="col">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(([id, entry]) => (
                    <tr key={id}>
                      <td>
                        <a className="inline-link" href={`/app/schedules/${id}`}>
                          #{id}
                        </a>
                      </td>
                      <td>{entry.label || "—"}</td>
                      <td className="muted">{entry.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="breakdown-note" style={{ marginTop: 12 }}>
            Local labels are the only off-chain records VestiRail keeps. Clearing them does not
            touch any contract state or beneficiary allocation.
          </p>
        </div>
      </Panel>

      <div className="grid-2-even">
        <Panel>
          <PanelHead title="Data integrity" description="How this client behaves when reads fail" />
          <div className="panel-body stack">
            <p className="breakdown-note">
              Contract reads are authoritative and refreshed every {CONFIG.refreshMs / 1000} seconds.
              If an RPC call fails, the last successful values remain visible with a sync warning
              and a retry action; the interface never substitutes zero for unknown data.
            </p>
            <p className="breakdown-note">
              Event history is optional. When logs are unavailable, claim history and cumulative
              claimed charts are hidden rather than reconstructed from local state.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Deployment reference" description="Support and verification" />
          <div className="panel-body">
            <dl className="data-list">
              <div className="data-row">
                <dt>Manager</dt>
                <dd className="mono-sm">{shortAddress(CONFIG.manager, 6)}</dd>
              </div>
              <div className="data-row">
                <dt>Demo token</dt>
                <dd>
                  <CopyAddress address={CONFIG.demoToken.address} chars={5} />
                </dd>
              </div>
              <div className="data-row">
                <dt>Faucet</dt>
                <dd>
                  <a className="inline-link" href="https://faucet.botchain.ai/basic" target="_blank" rel="noreferrer">
                    faucet.botchain.ai <Icon name="external" size={12} />
                  </a>
                </dd>
              </div>
              <div className="data-row">
                <dt>Contract source</dt>
                <dd>Not verified on BOTScan (no API key)</dd>
              </div>
            </dl>
          </div>
        </Panel>
      </div>
    </div>
  );
}
