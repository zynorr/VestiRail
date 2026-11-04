import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { CONFIG, EXPLORER } from "../lib/config";
import { sameAddress, shortAddress } from "../lib/format";
import { useWallet } from "../context/WalletContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { Icon, type IconName } from "./Icon";
import { Button, Notice } from "./ui";

type NavItem = { to: string; label: string; icon: IconName; end?: boolean };

const workspaceNav: NavItem[] = [
  { to: "/app", label: "Overview", icon: "overview", end: true },
  { to: "/app/schedules", label: "Vesting schedules", icon: "schedules" },
  { to: "/app/beneficiaries", label: "Beneficiaries", icon: "beneficiaries" },
  { to: "/app/bulk", label: "Bulk allocations", icon: "bulk" },
  { to: "/app/activity", label: "Activity", icon: "activity" },
  { to: "/app/reports", label: "Reports", icon: "reports" },
];

const managementNav: NavItem[] = [
  { to: "/app/create", label: "Create schedule", icon: "plus" },
  { to: "/app/tokens", label: "Token registry", icon: "token" },
  { to: "/app/settings", label: "Settings", icon: "settings" },
];

function SyncIndicator() {
  const { lastSyncedAt, refreshing, refresh, error } = useWorkspace();
  const [, force] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => force((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const seconds = lastSyncedAt ? Math.max(0, Math.round((Date.now() - lastSyncedAt.getTime()) / 1000)) : null;
  const label =
    error
      ? "Sync failed"
      : seconds === null
        ? "Syncing"
        : seconds < 15
          ? "Synced just now"
          : `Synced ${seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`} ago`;

  return (
    <button
      type="button"
      className="sync-indicator"
      onClick={() => void refresh()}
      title="Refresh contract state"
      aria-label={label}
    >
      <Icon name="refresh" size={14} className={refreshing ? "spin" : ""} />
      <span>{label}</span>
    </button>
  );
}

function WalletControl() {
  const { account, chainId, connecting, connect, ensureNetwork } = useWallet();
  const wrongNetwork = chainId !== null && chainId !== CONFIG.chainId;

  if (!account) {
    return (
      <Button variant="primary" size="sm" icon="wallet" onClick={() => void connect()} loading={connecting}>
        Connect wallet
      </Button>
    );
  }

  return (
    <details className="wallet-menu">
      <summary>
        <span className={`wallet-dot ${wrongNetwork ? "is-warn" : ""}`} />
        <span className="mono">{shortAddress(account)}</span>
        <Icon name="chevronDown" size={13} />
      </summary>
      <div className="wallet-popover">
        <div className="wallet-popover-head">
          <span className="muted">Connected account</span>
          <span className="mono">{shortAddress(account, 6)}</span>
        </div>
        <div className={`wallet-network ${wrongNetwork ? "is-warn" : ""}`}>
          <i className="wallet-dot" />
          {wrongNetwork ? `Network ${chainId} — switch required` : CONFIG.chainName}
        </div>
        <a
          className="wallet-item"
          href={EXPLORER.address(account)}
          target="_blank"
          rel="noreferrer"
        >
          View account <Icon name="external" size={13} />
        </a>
        <button className="wallet-item" type="button" onClick={() => void ensureNetwork()}>
          Switch to BOT Chain <Icon name="refresh" size={13} />
        </button>
        <Link className="wallet-item" to="/portal">
          Beneficiary portal <Icon name="arrowRight" size={13} />
        </Link>
      </div>
    </details>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { account, chainId, error: walletError, clearError } = useWallet();
  const { workspace } = useWorkspace();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const dueSoon = workspace?.schedules.filter((schedule) => schedule.claimable > 0n).length ?? 0;
  const wrongNetwork = chainId !== null && chainId !== CONFIG.chainId;

  const renderNav = (items: NavItem[]) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`.trim()}
      >
        <Icon name={item.icon} size={17} />
        <span>{item.label}</span>
        {item.to === "/app/schedules" && workspace ? (
          <span className="nav-count">{workspace.schedules.length}</span>
        ) : null}
        {item.to === "/app" && dueSoon > 0 ? <span className="nav-dot" /> : null}
      </NavLink>
    ));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <button
        className={`sidebar-scrim ${open ? "is-open" : ""}`.trim()}
        onClick={() => setOpen(false)}
        aria-label="Close navigation"
        tabIndex={-1}
      />

      <aside className={`sidebar ${open ? "is-open" : ""}`.trim()}>
        <div className="sidebar-brand">
          <Link to="/" className="brand-link" aria-label="VestiRail home">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span className="brand-word">
              VestiRail
              <small>Token allocation OS</small>
            </span>
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          <p className="nav-group">Workspace</p>
          {renderNav(workspaceNav)}
          <p className="nav-group">Management</p>
          {renderNav(managementNav)}
        </nav>

        <div className="sidebar-foot">
          <a className="nav-item nav-quiet" href="/#how-it-works">
            <Icon name="book" size={16} /> <span>Documentation</span>
          </a>
          <a className="nav-item nav-quiet" href="/#faq">
            <Icon name="help" size={16} /> <span>Help &amp; support</span>
          </a>

          <div className="network-card">
            <div className="network-card-top">
              <span className="network-dot" />
              <span>{CONFIG.chainName}</span>
            </div>
            <div className="network-card-meta">
              <span>Chain {CONFIG.chainId}</span>
              <a href={EXPLORER.address(CONFIG.manager)} target="_blank" rel="noreferrer">
                {CONFIG.manager.slice(0, 6)}…{CONFIG.manager.slice(-4)}
                <Icon name="external" size={11} />
              </a>
            </div>
          </div>

          <div className="sidebar-profile">
            <span className="avatar" aria-hidden="true">
              {account ? account.slice(2, 4).toUpperCase() : "VR"}
            </span>
            <div className="sidebar-profile-text">
              <strong>{account ? shortAddress(account) : "Read-only session"}</strong>
              <span>{account ? "Beneficiary / operator" : "Connect to sign"}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn menu-btn"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Icon name="menu" size={19} />
            </button>
            <div className="workspace-id">
              <span className="workspace-avatar">VR</span>
              <div>
                <strong>Token Operations</strong>
                <span className="workspace-meta">
                  Primary workspace · {sameAddress(account, CONFIG.deployer) ? "Operator" : "Viewer"}
                </span>
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <SyncIndicator />
            <span className={`network-pill ${wrongNetwork ? "is-warn" : ""}`.trim()}>
              <i className="network-dot" />
              {wrongNetwork ? "Switch network" : "BOT Chain"}
            </span>
            <WalletControl />
          </div>
        </header>

        <main className="content" id="main-content">
          {walletError ? (
            <div className="wallet-error">
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
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
