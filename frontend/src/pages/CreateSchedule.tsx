import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Contract, getAddress, parseUnits } from "ethers";
import { vestedAmount } from "../../../shared/vesting";
import { vestingManagerAbi } from "../abi";
import { CONFIG, EXPLORER } from "../lib/config";
import { readProvider, resolveToken, nativeToken } from "../lib/contract";
import { useWallet } from "../context/WalletContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { saveLabel } from "../lib/labels";
import {
  decodeError,
  formatAmount,
  formatDateTime,
  parseDateTimeLocal,
  toDateTimeLocal,
} from "../lib/format";
import type { Schedule, TokenMeta } from "../lib/types";
import { Icon } from "../components/Icon";
import { UnlockCurve } from "../components/UnlockCurve";
import { VestingTimeline } from "../components/VestingTimeline";
import {
  Button,
  CopyAddress,
  Field,
  Input,
  Notice,
  Panel,
  PanelHead,
  Spinner,
} from "../components/ui";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const DAY = 86_400n;

type Stage = "idle" | "awaiting" | "approving" | "submitted" | "confirming" | "confirmed" | "failed";

const steps = [
  { title: "Token", hint: "Choose the asset to vest" },
  { title: "Beneficiary", hint: "Recipient and allocation" },
  { title: "Vesting", hint: "Cliff, duration and curve" },
  { title: "Review", hint: "Exact funding and gas" },
  { title: "Confirmation", hint: "Sign and verify" },
];

export function CreateSchedule() {
  const { workspace, refresh } = useWorkspace();
  const { account, connect, connecting, ensureNetwork, getSigner } = useWallet();

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"native" | "erc20">("native");
  const [addressInput, setAddressInput] = useState<string>(CONFIG.demoToken.address);
  const [token, setToken] = useState<TokenMeta | null>(nativeToken());
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [reference, setReference] = useState("");

  const [startLocal, setStartLocal] = useState("");
  const [cliffDays, setCliffDays] = useState("0");
  const [durationDays, setDurationDays] = useState("365");

  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceNote, setBalanceNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [approveHash, setApproveHash] = useState("");
  const [hash, setHash] = useState("");
  const [txError, setTxError] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [createdTotal, setCreatedTotal] = useState<bigint | null>(null);
  const [gasEstimate, setGasEstimate] = useState<string | null>(null);
  const [gasError, setGasError] = useState("");

  const chainNow = workspace?.chainNow ?? BigInt(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!startLocal && workspace) {
      setStartLocal(toDateTimeLocal(workspace.chainNow + DAY));
    }
  }, [startLocal, workspace]);

  useEffect(() => {
    setBalance(null);
    setBalanceNote("");
    if (!account || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const value = token.native
          ? await readProvider.getBalance(account)
          : ((await new Contract(token.address, ERC20_ABI, readProvider).balanceOf(account)) as bigint);
        if (!cancelled) setBalance(value);
      } catch (cause) {
        if (!cancelled) setBalanceNote(decodeError(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, token]);

  const selectNative = () => {
    setMode("native");
    setToken(nativeToken());
    setTokenError("");
  };

  const verifyToken = async () => {
    setTokenError("");
    setToken(null);
    let parsed: string;
    try {
      parsed = getAddress(addressInput.trim());
    } catch {
      setTokenError("Enter a valid ERC-20 contract address.");
      return;
    }
    setTokenLoading(true);
    try {
      const resolved = await resolveToken(parsed);
      if (!resolved.supported) {
        setTokenError("This address did not respond with ERC-20 metadata. The contract would reject it as a token.");
        return;
      }
      setToken(resolved);
      setMode("erc20");
    } finally {
      setTokenLoading(false);
    }
  };

  const start = useMemo(() => parseDateTimeLocal(startLocal), [startLocal]);
  const cliffSeconds = useMemo(() => {
    const days = Number(cliffDays);
    return Number.isFinite(days) && days >= 0 ? BigInt(Math.round(days * 86400)) : 0n;
  }, [cliffDays]);
  const durationSeconds = useMemo(() => {
    const days = Number(durationDays);
    return Number.isFinite(days) && days > 0 ? BigInt(Math.round(days * 86400)) : 0n;
  }, [durationDays]);

  const beneficiaryResult = useMemo(() => {
    const value = beneficiary.trim();
    if (!value) return { address: null, error: "" };
    try {
      return { address: getAddress(value), error: "" };
    } catch {
      return { address: null, error: "Enter a valid 0x… wallet address." };
    }
  }, [beneficiary]);

  const amountWei = useMemo(() => {
    if (!token || !amount.trim()) return null;
    try {
      const value = parseUnits(amount.trim().replace(/,/g, ""), token.decimals);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }, [amount, token]);

  const stepErrors = useMemo(() => {
    const errors: string[] = [];
    if (!token) errors.push("Select or verify a token before continuing.");
    if (!beneficiaryResult.address) errors.push("A valid beneficiary address is required.");
    if (!amountWei) errors.push("Enter an allocation greater than zero.");
    if (balance !== null && amountWei && amountWei > balance) {
      errors.push(`Allocation exceeds the connected wallet balance of ${formatAmount(balance, token?.decimals ?? 18)} ${token?.symbol ?? ""}.`);
    }
    if (!start) errors.push("Set a valid start date and time (UTC).");
    if (durationSeconds <= 0n) errors.push("Vesting duration must be at least one day.");
    if (cliffSeconds > durationSeconds) errors.push("The cliff cannot exceed the total vesting duration.");
    if (start && durationSeconds > 0n && start + durationSeconds > 253402300799n) {
      errors.push("The vesting end date is beyond the range the contract accepts.");
    }
    return errors;
  }, [token, beneficiaryResult, amountWei, balance, start, durationSeconds, cliffSeconds]);

  const terms = useMemo(() => {
    if (!start || !amountWei || durationSeconds <= 0n || cliffSeconds > durationSeconds) return null;
    return {
      totalAmount: amountWei,
      start,
      cliffDuration: cliffSeconds,
      duration: durationSeconds,
    };
  }, [start, amountWei, durationSeconds, cliffSeconds]);

  const preview = useMemo<Schedule | null>(() => {
    if (!terms || !token || !beneficiaryResult.address) return null;
    const vested = vestedAmount(terms, chainNow);
    return {
      id: 0n,
      beneficiary: beneficiaryResult.address,
      token,
      start: terms.start,
      cliffDuration: terms.cliffDuration,
      duration: terms.duration,
      total: terms.totalAmount,
      claimed: 0n,
      vested,
      claimable: vested,
      cliffAt: terms.start + terms.cliffDuration,
      endedAt: terms.start + terms.duration,
    };
  }, [terms, token, beneficiaryResult, chainNow]);

  const funding = token && amountWei ? `${formatAmount(amountWei, token.decimals, 18)} ${token.symbol}` : "—";

  const canContinue = (index: number): boolean => {
    if (index === 0) return Boolean(token);
    if (index === 1) {
      return Boolean(
        beneficiaryResult.address &&
          amountWei &&
          (balance === null || amountWei <= balance),
      );
    }
    if (index === 2) {
      return Boolean(start && durationSeconds > 0n && cliffSeconds <= durationSeconds);
    }
    return stepErrors.length === 0;
  };

  useEffect(() => {
    setGasEstimate(null);
    setGasError("");
    if (step !== 3 || !account || !terms || !token || !beneficiaryResult.address) return;
    let cancelled = false;
    (async () => {
      try {
        const signer = await getSigner();
        const contract = new Contract(CONFIG.manager, vestingManagerAbi, signer);
        const inputs = [
          {
            beneficiary: beneficiaryResult.address as string,
            start: terms.start,
            cliffDuration: terms.cliffDuration,
            duration: terms.duration,
            totalAmount: terms.totalAmount,
          },
        ];
        const gas = token.native
          ? await contract.createNativeSchedules.estimateGas(inputs, {
              value: terms.totalAmount,
            })
          : await contract.createTokenSchedules.estimateGas(token.address, inputs);
        const fee = await signer.provider?.getFeeData();
        const price = fee?.maxFeePerGas ?? fee?.gasPrice ?? 0n;
        if (!cancelled) {
          setGasEstimate(price > 0n ? formatAmount(gas * price, 18, 6) : null);
          if (price === 0n) setGasError("The wallet could not report a gas price.");
        }
      } catch (cause) {
        if (!cancelled) setGasError(decodeError(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, account, terms, token, beneficiaryResult, getSigner]);

  const submit = async () => {
    if (!terms || !token || !beneficiaryResult.address) return;
    setStep(4);
    setStage("awaiting");
    setTxError("");
    setHash("");
    setApproveHash("");
    setCreatedId(null);
    setCreatedTotal(null);

    try {
      const networkOk = await ensureNetwork();
      if (!networkOk) throw new Error("Switch the wallet to BOT Chain Testnet first.");

      const signer = await getSigner();
      const from = await signer.getAddress();
      const contract = new Contract(CONFIG.manager, vestingManagerAbi, signer);
      const inputs = [
        {
          beneficiary: beneficiaryResult.address,
          start: terms.start,
          cliffDuration: terms.cliffDuration,
          duration: terms.duration,
          totalAmount: terms.totalAmount,
        },
      ];

      if (!token.native) {
        const tokenContract = new Contract(token.address, ERC20_ABI, signer);
        const allowance: bigint = await tokenContract.allowance(from, CONFIG.manager);
        if (allowance < terms.totalAmount) {
          setStage("approving");
          const approval = await tokenContract.approve(CONFIG.manager, terms.totalAmount);
          setApproveHash(approval.hash);
          const approvalReceipt = await approval.wait();
          if (!approvalReceipt || approvalReceipt.status !== 1) {
            throw new Error("Token approval was not confirmed.");
          }
        }
      }

      setStage("submitted");
      const tx = token.native
        ? await contract.createNativeSchedules(inputs, { value: terms.totalAmount })
        : await contract.createTokenSchedules(token.address, inputs);
      setHash(tx.hash);
      setStage("confirming");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("The creation transaction reverted.");

      let firstId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed?.name === "SchedulesCreated") {
            firstId = BigInt(parsed.args.firstScheduleId);
            break;
          }
        } catch {
          // Logs from the token contract are not part of this ABI.
        }
      }

      if (firstId !== null) {
        setCreatedId(firstId);
        if (label.trim() || reference.trim()) {
          saveLabel(firstId.toString(), { label: label.trim(), reference: reference.trim() });
        }
      }
      setCreatedTotal(terms.totalAmount);
      setStage("confirmed");
      await refresh();
    } catch (cause) {
      setStage("failed");
      setTxError(decodeError(cause));
    }
  };

  const reset = () => {
    setStep(0);
    setBeneficiary("");
    setAmount("");
    setLabel("");
    setReference("");
    setCliffDays("0");
    setDurationDays("365");
    setAcknowledged(false);
    setStage("idle");
    setHash("");
    setApproveHash("");
    setTxError("");
    setCreatedId(null);
    setCreatedTotal(null);
    setTokenError("");
    setStartLocal(toDateTimeLocal(chainNow + DAY));
  };

  const busy = stage === "awaiting" || stage === "approving" || stage === "submitted" || stage === "confirming";

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Management / Create schedule</p>
          <h1>Create vesting schedule</h1>
          <p className="page-sub">
            A guided, on-chain allocation. The schedule is immutable once funded; VestiRail
            cannot revoke it, and the beneficiary claims directly from the contract.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/app/schedules">
            <Button variant="secondary" icon="arrowLeft">
              Cancel
            </Button>
          </Link>
        </div>
      </header>

      <div className="wizard">
        <nav className="wizard-steps" aria-label="Creation steps">
          <div className="wizard-progress">
            <div className="wizard-progress-label">
              <span>Progress</span>
              <span>{Math.min(step + 1, 5)} / 5</span>
            </div>
            <div className="wizard-progress-bar">
              <span style={{ width: `${((step + 1) / 5) * 100}%` }} />
            </div>
          </div>
          {steps.map((entry, index) => (
            <button
              key={entry.title}
              type="button"
              className={`step-item ${index === step ? "is-current" : ""} ${
                index < step ? "is-done" : ""
              }`.trim()}
              onClick={() => {
                if (index < step && stage === "idle") setStep(index);
              }}
              disabled={index >= step || stage !== "idle"}
              aria-current={index === step ? "step" : undefined}
            >
              <span className="step-num">
                {index < step ? <Icon name="check" size={11} /> : index + 1}
              </span>
              <span className="step-text">
                {entry.title}
                <small>{entry.hint}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="wizard-main">
          {step === 0 ? (
            <section className="wizard-card">
              <div className="wizard-card-head">
                <h2>Select the token</h2>
                <p>
                  Native BOT or a standard ERC-20. The contract validates funding by measuring its
                  own balance change, so fee-on-transfer tokens are rejected rather than accepted
                  underfunded.
                </p>
              </div>
              <div className="wizard-card-body stack-16">
                <div className="token-choices">
                  <button
                    type="button"
                    className={`token-choice ${mode === "native" ? "is-active" : ""}`.trim()}
                    onClick={selectNative}
                    aria-pressed={mode === "native"}
                  >
                    <span className="token-choice-mark">BOT</span>
                    <span className="token-choice-text">
                      <strong>Native BOT</strong>
                      <span>Chain asset · 18 decimals</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`token-choice ${mode === "erc20" ? "is-active" : ""}`.trim()}
                    onClick={() => setMode("erc20")}
                    aria-pressed={mode === "erc20"}
                  >
                    <span className="token-choice-mark">20</span>
                    <span className="token-choice-text">
                      <strong>ERC-20 token</strong>
                      <span>Paste a contract address</span>
                    </span>
                  </button>
                </div>

                {mode === "erc20" ? (
                  <div className="stack-16">
                    <Field
                      label="Token contract address"
                      htmlFor="token-address"
                      hint="VestiRail reads name, symbol and decimals directly from the contract."
                      error={tokenError}
                    >
                      <div className="row">
                        <Input
                          id="token-address"
                          className="mono"
                          value={addressInput}
                          onChange={(event) => setAddressInput(event.target.value)}
                          placeholder="0x…"
                          spellCheck={false}
                          autoComplete="off"
                        />
                        <Button
                          variant="secondary"
                          onClick={() => void verifyToken()}
                          loading={tokenLoading}
                        >
                          Verify
                        </Button>
                      </div>
                    </Field>
                    <button
                      type="button"
                      className="inline-link"
                      onClick={() => {
                        setAddressInput(CONFIG.demoToken.address);
                        void resolveToken(CONFIG.demoToken.address).then(setToken);
                        setTokenError("");
                      }}
                    >
                      Use the demo token {CONFIG.demoToken.symbol} <Icon name="arrowRight" size={12} />
                    </button>
                  </div>
                ) : null}

                {token ? (
                  <div className="token-summary">
                    <div>
                      <span>Token</span>
                      <strong>{token.name}</strong>
                    </div>
                    <div>
                      <span>Symbol</span>
                      <strong>{token.symbol}</strong>
                    </div>
                    <div>
                      <span>Decimals</span>
                      <strong>{token.decimals}</strong>
                    </div>
                    <div>
                      <span>Wallet balance</span>
                      <strong>
                        {account
                          ? balance !== null
                            ? `${formatAmount(balance, token.decimals)} ${token.symbol}`
                            : "Reading…"
                          : "Connect wallet"}
                      </strong>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <span>Contract</span>
                      <strong>
                        <CopyAddress address={token.address} chars={7} />
                      </strong>
                    </div>
                  </div>
                ) : null}

                {!account ? (
                  <Notice
                    tone="info"
                    title="Wallet required for funding"
                    action={
                      <Button variant="secondary" size="sm" onClick={() => void connect()} loading={connecting}>
                        Connect
                      </Button>
                    }
                  >
                    Token selection and preview work read-only. Creating the schedule needs a
                    wallet on BOT Chain Testnet with the allocation plus gas.
                  </Notice>
                ) : balanceNote ? (
                  <Notice tone="warn" title="Balance unavailable">
                    {balanceNote}
                  </Notice>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="wizard-card">
              <div className="wizard-card-head">
                <h2>Beneficiary and allocation</h2>
                <p>
                  The beneficiary is the only address that can claim. Amounts are stored in base
                  units, so the exact figure you enter is the exact figure funded.
                </p>
              </div>
              <div className="wizard-card-body">
                <div className="form-grid">
                  <div className="span-2">
                    <Field
                      label="Beneficiary wallet"
                      htmlFor="beneficiary"
                      hint="No off-chain identity is assumed. Only the address is confirmed."
                      error={beneficiaryResult.error}
                    >
                      <Input
                        id="beneficiary"
                        className="mono"
                        value={beneficiary}
                        onChange={(event) => setBeneficiary(event.target.value)}
                        placeholder="0x…"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </Field>
                    {beneficiaryResult.address ? (
                      <div className="kv-inline" style={{ marginTop: -6 }}>
                        <Icon name="beneficiaries" size={14} />
                        <span>Recipient</span>
                        <CopyAddress address={beneficiaryResult.address} chars={6} />
                      </div>
                    ) : null}
                  </div>

                  <Field
                    label="Allocation amount"
                    htmlFor="amount"
                    hint={
                      token && balance !== null
                        ? `Wallet holds ${formatAmount(balance, token.decimals)} ${token.symbol}.`
                        : undefined
                    }
                    error={
                      amount && !amountWei
                        ? `Enter a positive amount with up to ${token?.decimals ?? 18} decimals.`
                        : amountWei && balance !== null && amountWei > balance
                          ? "This exceeds the connected wallet balance."
                          : undefined
                    }
                  >
                    <span className="input-affix">
                      <Input
                        id="amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="0.00"
                      />
                      <span className="input-affix-tag">{token?.symbol ?? "TOKEN"}</span>
                    </span>
                  </Field>

                  <Field
                    label="Allocation label"
                    htmlFor="label"
                    optional
                    hint="Stored locally in this browser, never on chain."
                  >
                    <Input
                      id="label"
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                      placeholder="Core contributor"
                      maxLength={80}
                    />
                  </Field>

                  <div className="span-2">
                    <Field
                      label="Internal reference"
                      htmlFor="reference"
                      optional
                      hint="Offer letter, grant ID or internal memo."
                    >
                      <Input
                        id="reference"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder="Offer 2026-01"
                        maxLength={140}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="wizard-card">
              <div className="wizard-card-head">
                <h2>Vesting configuration</h2>
                <p>
                  Cliff plus linear release, the only model the deployed contract supports.
                  Accrual starts at the start date; the cliff gates claims without moving the
                  accrual origin.
                </p>
              </div>
              <div className="wizard-card-body">
                <div className="form-grid">
                  <Field
                    label="Start date & time (UTC)"
                    htmlFor="start"
                    hint={start ? formatDateTime(start) : "Required"}
                  >
                    <Input
                      id="start"
                      type="datetime-local"
                      value={startLocal}
                      onChange={(event) => setStartLocal(event.target.value)}
                    />
                  </Field>
                  <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setStartLocal(toDateTimeLocal(chainNow))}
                    >
                      Start now
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setStartLocal(toDateTimeLocal(chainNow + 30n * DAY))}
                    >
                      In 30 days
                    </Button>
                  </div>

                  <Field
                    label="Cliff duration (days)"
                    htmlFor="cliff"
                    hint={
                      start && cliffSeconds > 0n
                        ? `First claim available ${formatDateTime(start + cliffSeconds)}`
                        : "Zero means claimable from the start date."
                    }
                  >
                    <Input
                      id="cliff"
                      inputMode="numeric"
                      value={cliffDays}
                      onChange={(event) => setCliffDays(event.target.value)}
                    />
                  </Field>

                  <Field
                    label="Total vesting duration (days)"
                    htmlFor="duration"
                    hint={
                      start && durationSeconds > 0n
                        ? `Fully vested ${formatDateTime(start + durationSeconds)}`
                        : "Must be at least one day."
                    }
                    error={
                      cliffSeconds > durationSeconds
                        ? "The cliff cannot be longer than the vesting duration."
                        : undefined
                    }
                  >
                    <Input
                      id="duration"
                      inputMode="numeric"
                      value={durationDays}
                      onChange={(event) => setDurationDays(event.target.value)}
                    />
                  </Field>

                  <div className="span-2">
                    <div className="filters-row">
                      <span className="field-label" style={{ marginRight: 4 }}>
                        Presets
                      </span>
                      <Button type="button" size="sm" variant="secondary" onClick={() => { setCliffDays("0"); setDurationDays("365"); }}>
                        1 year, no cliff
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => { setCliffDays("365"); setDurationDays("1460"); }}>
                        4 years, 1 year cliff
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => { setCliffDays("180"); setDurationDays("730"); }}>
                        2 years, 6 month cliff
                      </Button>
                    </div>
                  </div>

                  <div className="span-2">
                    <Field label="Release method" hint="The contract exposes no other release mechanism.">
                      <div className="token-choice is-active" style={{ cursor: "default" }}>
                        <span className="token-choice-mark">
                          <Icon name="schedules" size={14} />
                        </span>
                        <span className="token-choice-text">
                          <strong>Cliff + linear, claim on demand</strong>
                          <span>Beneficiary claims any vested amount at any time</span>
                        </span>
                      </div>
                    </Field>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="wizard-card">
              <div className="wizard-card-head">
                <h2>Review the allocation</h2>
                <p>
                  This is the exact state the contract will store. Check the funding figure: native
                  BOT must equal the allocation precisely, ERC-20 funding is measured on transfer.
                </p>
              </div>
              <div className="wizard-card-body stack-16">
                <div className="review-grid">
                  <div>
                    <div className="review-block">
                      <h3>Beneficiary</h3>
                      <div className="review-value">
                        {beneficiaryResult.address ? (
                          <CopyAddress address={beneficiaryResult.address} chars={6} />
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                    <div className="review-block">
                      <h3>Token</h3>
                      <div className="review-value">
                        {token?.name} ({token?.symbol})
                      </div>
                    </div>
                    <div className="review-block">
                      <h3>Label</h3>
                      <div className="review-value">{label || "—"}</div>
                    </div>
                    <div className="review-block">
                      <h3>Reference</h3>
                      <div className="review-value">{reference || "—"}</div>
                    </div>
                  </div>
                  <div>
                    <div className="review-block">
                      <h3>Total allocation</h3>
                      <div className="review-value mono">{funding}</div>
                    </div>
                    <div className="review-block">
                      <h3>Start</h3>
                      <div className="review-value">{start ? formatDateTime(start) : "—"}</div>
                    </div>
                    <div className="review-block">
                      <h3>Cliff</h3>
                      <div className="review-value">
                        {cliffSeconds === 0n
                          ? "No cliff"
                          : `${cliffDays} days · ${start ? formatDateTime(start + cliffSeconds) : ""}`}
                      </div>
                    </div>
                    <div className="review-block">
                      <h3>Vesting duration</h3>
                      <div className="review-value">{durationDays} days</div>
                    </div>
                  </div>
                </div>

                <div className="wizard-summary">
                  <div>
                    <span>Exact funding</span>
                    <strong>{funding}</strong>
                  </div>
                  <div>
                    <span>Estimated gas</span>
                    <strong>{gasEstimate ? `${gasEstimate} BOT` : gasError ? "Unavailable" : account ? "Estimating…" : "Connect wallet"}</strong>
                  </div>
                  <div>
                    <span>Release</span>
                    <strong>Cliff + linear</strong>
                  </div>
                </div>

                {gasError ? (
                  <Notice tone="warn" title="Gas estimate unavailable">
                    {gasError} You can still submit; the wallet will show its own fee before
                    signing.
                  </Notice>
                ) : null}

                {token && !token.native ? (
                  <Notice tone="info" title="Token approval">
                    VestiRail will request an exact allowance of {funding} before creating the
                    schedule. If the current allowance is already sufficient, no approval
                    transaction is sent.
                  </Notice>
                ) : null}

                <Notice tone="warn" title="This schedule cannot be changed">
                  There is no revocation, admin withdrawal, upgrade or acceleration. The
                  beneficiary can claim vested tokens, and the schedule runs to its end date.
                </Notice>

                <label className="check-row" htmlFor="acknowledge">
                  <input
                    id="acknowledge"
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  <span>
                    I have verified the beneficiary address, token and funding amount, and
                    understand this allocation is immutable.
                  </span>
                </label>

                {!account ? (
                  <Button variant="primary" icon="wallet" onClick={() => void connect()} loading={connecting}>
                    Connect wallet to continue
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="wizard-card">
              {stage === "confirmed" ? (
                <div className="success-card">
                  <span className="success-icon">
                    <Icon name="check" size={24} />
                  </span>
                  <h2>Schedule created and funded</h2>
                  <p>
                    {createdTotal && token
                      ? `${formatAmount(createdTotal, token.decimals)} ${token.symbol} is now vested on chain for ${beneficiaryResult.address}.`
                      : "The allocation is now recorded in the VestingManager."}
                  </p>
                  <div className="success-links">
                    {createdId !== null ? (
                      <Link to={`/app/schedules/${createdId}`}>
                        <Button variant="primary" icon="schedules">
                          View schedule #{createdId.toString()}
                        </Button>
                      </Link>
                    ) : (
                      <Link to="/app/schedules">
                        <Button variant="primary" icon="schedules">
                          Open schedule register
                        </Button>
                      </Link>
                    )}
                    {hash ? (
                      <a href={EXPLORER.tx(hash)} target="_blank" rel="noreferrer">
                        <Button variant="secondary" icon="external">
                          Transaction on BOTScan
                        </Button>
                      </a>
                    ) : null}
                    <Button variant="secondary" icon="plus" onClick={reset}>
                      Create another
                    </Button>
                  </div>
                  {createdId === null ? (
                    <p className="breakdown-note">
                      The receipt did not include a decoded <span className="mono-sm">SchedulesCreated</span>{" "}
                      event, so the new ID could not be read automatically. The register shows the
                      authoritative list.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="wizard-card-body stack-16">
                  <div>
                    <p className="eyebrow">Confirmation</p>
                    <h2 className="section-title" style={{ marginTop: 4 }}>
                      {stage === "awaiting"
                        ? "Confirm in your wallet"
                        : stage === "approving"
                          ? "Approving token allowance"
                          : stage === "submitted"
                            ? "Submitted to BOT Chain"
                            : stage === "confirming"
                              ? "Waiting for confirmation"
                              : stage === "failed"
                                ? "Transaction failed"
                                : "Preparing transaction"}
                    </h2>
                    <p className="page-sub">
                      {stage === "awaiting"
                        ? "Your wallet will open with the funding amount. Nothing has been sent yet."
                        : stage === "approving"
                          ? "The token approval is a separate transaction. The schedule is created after it confirms."
                          : stage === "submitted"
                            ? "The transaction is in the mempool. VestiRail waits for a receipt before reporting success."
                            : stage === "confirming"
                              ? "The network is mining the transaction. Do not close this tab."
                              : stage === "failed"
                                ? "No schedule was created. The error below comes from the wallet or the contract."
                                : "Building the transaction."}
                    </p>
                  </div>

                  <div className="tx-state">
                    <div className="tx-state-top">
                      {busy ? <Spinner label="Transaction in progress" /> : <Icon name="alert" size={15} />}
                      <strong>
                        {stage === "failed" ? "Not confirmed" : busy ? "In progress" : "Not started"}
                      </strong>
                    </div>
                    <dl className="data-list" style={{ marginTop: 8 }}>
                      <div className="data-row">
                        <dt>Network</dt>
                        <dd>{CONFIG.chainName}</dd>
                      </div>
                      <div className="data-row">
                        <dt>Funding</dt>
                        <dd>{funding}</dd>
                      </div>
                      <div className="data-row">
                        <dt>Beneficiary</dt>
                        <dd className="mono-sm">
                          {beneficiaryResult.address
                            ? `${beneficiaryResult.address.slice(0, 10)}…${beneficiaryResult.address.slice(-6)}`
                            : "—"}
                        </dd>
                      </div>
                      {approveHash ? (
                        <div className="data-row">
                          <dt>Approval tx</dt>
                          <dd>
                            <a className="inline-link mono-sm" href={EXPLORER.tx(approveHash)} target="_blank" rel="noreferrer">
                              {approveHash.slice(0, 10)}… <Icon name="external" size={11} />
                            </a>
                          </dd>
                        </div>
                      ) : null}
                      {hash ? (
                        <div className="data-row">
                          <dt>Creation tx</dt>
                          <dd>
                            <a className="inline-link mono-sm" href={EXPLORER.tx(hash)} target="_blank" rel="noreferrer">
                              {hash.slice(0, 10)}… <Icon name="external" size={11} />
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>

                  {txError ? (
                    <Notice tone="error" title="Transaction error">
                      {txError}
                    </Notice>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          <div className="wizard-foot">
            <span className="wizard-foot-note">
              {stepErrors.length > 0 && step >= 1 && stage === "idle"
                ? stepErrors[0]
                : "Values are read back from the contract after confirmation."}
            </span>
            <div className="row">
              {step > 0 && stage === "idle" ? (
                <Button variant="ghost" icon="arrowLeft" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  variant="primary"
                  iconRight="arrowRight"
                  onClick={() => setStep(step + 1)}
                  disabled={!canContinue(step)}
                >
                  Continue
                </Button>
              ) : null}
              {step === 3 ? (
                <Button
                  variant="primary"
                  icon="lock"
                  onClick={() => void submit()}
                  disabled={!acknowledged || !account || !terms || stepErrors.length > 0}
                >
                  Create &amp; fund schedule
                </Button>
              ) : null}
              {step === 4 ? (
                stage === "failed" ? (
                  <Button variant="primary" icon="refresh" onClick={() => void submit()}>
                    Retry transaction
                  </Button>
                ) : stage === "confirmed" ? (
                  <Button variant="secondary" icon="plus" onClick={reset}>
                    New schedule
                  </Button>
                ) : null
              ) : null}
            </div>
          </div>
        </div>

        {preview ? (
          <div className="wizard-side">
            <Panel>
              <PanelHead
                eyebrow="Live preview"
                title="Unlock curve"
                description="Rendered from the same formula the contract executes at claim time."
              />
              <div className="panel-body">
                <UnlockCurve
                  items={[preview]}
                  events={[]}
                  tokenAddress={preview.token.address}
                  from={preview.start - 5n * DAY}
                  to={preview.endedAt + 5n * DAY}
                  now={chainNow}
                  height={200}
                  symbol={preview.token.symbol}
                  decimals={preview.token.decimals}
                  showClaimed={false}
                />
                <div style={{ marginTop: 10 }}>
                  <VestingTimeline schedule={preview} now={chainNow} compact />
                </div>
              </div>
            </Panel>
            <Panel>
              <PanelHead title="Schedule facts" description="Computed, not estimated" />
              <div className="panel-body">
                <dl className="data-list">
                  <div className="data-row">
                    <dt>Total</dt>
                    <dd>{funding}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Vested at cliff</dt>
                    <dd>
                      {cliffSeconds > 0n && terms
                        ? `${formatAmount(
                            vestedAmount(terms, terms.start + terms.cliffDuration),
                            token?.decimals ?? 18,
                          )} ${token?.symbol ?? ""}`
                        : "Claimable from start"}
                    </dd>
                  </div>
                  <div className="data-row">
                    <dt>Fully vested</dt>
                    <dd>{start && durationSeconds > 0n ? formatDateTime(start + durationSeconds) : "—"}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Remaining locked now</dt>
                    <dd>
                      {preview
                        ? `${formatAmount(preview.total - preview.vested, preview.token.decimals)} ${preview.token.symbol}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <p className="breakdown-note">
                  A start date in the future keeps the entire allocation locked until accrual
                  begins. The preview updates as you edit the dates.
                </p>
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}
