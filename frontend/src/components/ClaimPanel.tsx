import { useEffect, useState } from "react";
import { Contract } from "ethers";
import { vestingManagerAbi } from "../abi";
import { CONFIG, EXPLORER } from "../lib/config";
import { useWallet } from "../context/WalletContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { nextUnlock, scheduleStatus } from "../lib/derive";
import {
  formatAmount,
  formatDateTime,
  formatPercent,
  decodeError,
  sameAddress,
  shortAddress,
} from "../lib/format";
import type { Schedule } from "../lib/types";
import { Button, CopyAddress, Notice } from "./ui";
import { Icon } from "./Icon";

type Stage = "idle" | "awaiting" | "submitted" | "confirming" | "confirmed" | "failed";

const stageText: Record<Stage, string> = {
  idle: "Ready",
  awaiting: "Awaiting wallet confirmation",
  submitted: "Submitted to BOT Chain",
  confirming: "Confirming",
  confirmed: "Confirmed",
  failed: "Failed",
};

export function ClaimPanel({
  schedule,
  onClaimed,
}: {
  schedule: Schedule;
  onClaimed?: () => void | Promise<void>;
}) {
  const { account, connect, connecting, ensureNetwork, getSigner } = useWallet();
  const { workspace, refresh } = useWorkspace();
  const [stage, setStage] = useState<Stage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState("");
  const [fee, setFee] = useState<string | null>(null);

  const isBeneficiary = sameAddress(account, schedule.beneficiary);
  const now = workspace?.chainNow ?? BigInt(Math.floor(Date.now() / 1000));
  const unlock = nextUnlock(schedule, now);
  const status = scheduleStatus(schedule, now);

  useEffect(() => {
    let cancelled = false;
    setFee(null);
    if (!isBeneficiary || schedule.claimable === 0n) return;

    (async () => {
      try {
        const signer = await getSigner();
        const contract = new Contract(CONFIG.manager, vestingManagerAbi, signer);
        const gas: bigint = await contract.claim.estimateGas(schedule.id);
        const feeData = await signer.provider?.getFeeData();
        const price = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? 0n;
        if (!cancelled && price > 0n) {
          setFee(formatAmount(gas * price, 18, 6));
        }
      } catch {
        if (!cancelled) setFee(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getSigner, isBeneficiary, schedule.claimable, schedule.id]);

  const claim = async () => {
    setError("");
    setHash("");
    setStage("awaiting");
    try {
      const onChain = await ensureNetwork();
      if (!onChain) {
        setStage("failed");
        setError("Switch to BOT Chain Testnet to claim.");
        return;
      }
      const signer = await getSigner();
      const from = await signer.getAddress();
      if (!sameAddress(from, schedule.beneficiary)) {
        setStage("failed");
        setError("The connected wallet is not this schedule's beneficiary.");
        return;
      }
      const contract = new Contract(CONFIG.manager, vestingManagerAbi, signer);
      const tx = await contract.claim(schedule.id);
      setHash(tx.hash);
      setStage("submitted");
      setStage("confirming");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Transaction reverted.");
      setStage("confirmed");
      await refresh();
      if (onClaimed) await onClaimed();
    } catch (cause) {
      setStage("failed");
      setError(decodeError(cause));
    }
  };

  if (!account) {
    return (
      <div className="claim-panel">
        <div className="claim-figure">
          <span className="claim-label">Available to claim</span>
          <span className="claim-amount">
            {formatAmount(schedule.claimable, schedule.token.decimals)}{" "}
            <em>{schedule.token.symbol}</em>
          </span>
        </div>
        <p className="claim-hint">
          Connect the beneficiary wallet to claim. Read-only data stays available without a
          wallet.
        </p>
        <Button variant="primary" icon="wallet" onClick={() => void connect()} loading={connecting}>
          Connect wallet
        </Button>
        <p className="claim-owner">
          Beneficiary <CopyAddress address={schedule.beneficiary} chars={4} />
        </p>
      </div>
    );
  }

  if (!isBeneficiary) {
    return (
      <div className="claim-panel">
        <div className="claim-figure">
          <span className="claim-label">Available to claim</span>
          <span className="claim-amount">
            {formatAmount(schedule.claimable, schedule.token.decimals)}{" "}
            <em>{schedule.token.symbol}</em>
          </span>
        </div>
        <Notice tone="info" title="Read-only for this wallet">
          Connected as {shortAddress(account)}. Only {shortAddress(schedule.beneficiary)} can
          claim this schedule, so no claim action is available here.
        </Notice>
        <p className="claim-owner">
          Beneficiary <CopyAddress address={schedule.beneficiary} chars={4} />
        </p>
      </div>
    );
  }

  return (
    <div className="claim-panel">
      <div className="claim-figure">
        <span className="claim-label">Available to claim</span>
        <span className="claim-amount">
          {formatAmount(schedule.claimable, schedule.token.decimals)}{" "}
          <em>{schedule.token.symbol}</em>
        </span>
        <span className="claim-sub">
          {schedule.claimable > 0n
            ? status === "completed"
              ? "Vesting complete · unclaimed balance available"
              : `Linear release in progress · ${formatPercent(schedule.claimed, schedule.total)} already claimed`
            : unlock
              ? `Next unlock ${formatDateTime(unlock.at)}`
              : "Fully claimed"}
        </span>
      </div>

      {schedule.claimable > 0n ? (
        <>
          <Button
            variant="primary"
            size="md"
            icon="wallet"
            onClick={() => void claim()}
            loading={stage === "awaiting" || stage === "submitted" || stage === "confirming"}
            disabled={stage === "confirmed"}
          >
            {stage === "confirmed"
              ? "Claim confirmed"
              : `Claim ${formatAmount(schedule.claimable, schedule.token.decimals)} ${schedule.token.symbol}`}
          </Button>
          <p className="claim-hint">
            Network fee estimate: {fee ? `${fee} BOT` : "unavailable"} · Paid to{" "}
            {shortAddress(schedule.beneficiary)}
          </p>
        </>
      ) : (
        <Button variant="secondary" disabled>
          Nothing to claim yet
        </Button>
      )}

      {schedule.claimable === 0n ? (
        <p className="claim-hint">
          {unlock
            ? `${formatAmount(unlock.amount, schedule.token.decimals)} ${schedule.token.symbol} becomes claimable ${formatDateTime(unlock.at)}.`
            : "This schedule has been paid in full."}
        </p>
      ) : null}

      {stage !== "idle" ? (
        <div className={`tx-state tx-${stage}`}>
          <div className="tx-state-top">
            <Icon name={stage === "failed" ? "alert" : stage === "confirmed" ? "check" : "clock"} size={15} />
            <strong>{stageText[stage]}</strong>
          </div>
          {error ? <p className="tx-error">{error}</p> : null}
          {hash ? (
            <a className="tx-link" href={EXPLORER.tx(hash)} target="_blank" rel="noreferrer">
              {hash.slice(0, 12)}…{hash.slice(-6)} <Icon name="external" size={13} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
