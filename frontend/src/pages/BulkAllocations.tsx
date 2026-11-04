import { useEffect, useMemo, useRef, useState } from "react";
import { Contract, getAddress } from "ethers";
import { vestingManagerAbi } from "../abi";
import { CONFIG, EXPLORER } from "../lib/config";
import { readProvider, resolveToken, nativeToken } from "../lib/contract";
import { useWallet } from "../context/WalletContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { bulkSummary, csvTemplate, parseBulkCsv, parseCsv } from "../lib/csv";
import type { BulkRow } from "../lib/csv";
import {
  decodeError,
  downloadCsv,
  formatAmount,
  formatDateTime,
  parseDateTimeLocal,
  toDateTimeLocal,
} from "../lib/format";
import { saveLabel } from "../lib/labels";
import type { TokenMeta } from "../lib/types";
import { Icon } from "../components/Icon";
import {
  Badge,
  Button,
  Field,
  Input,
  Notice,
  Panel,
  PanelHead,
  Segmented,
} from "../components/ui";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const DAY = 86_400n;

type BatchState = {
  index: number;
  count: number;
  amount: bigint;
  hash: string;
  status: "submitted" | "confirmed" | "failed";
  firstId: bigint | null;
};

type Filter = "all" | "valid" | "invalid";

export function BulkAllocations() {
  const { workspace, refresh } = useWorkspace();
  const { account, connect, connecting, ensureNetwork, getSigner } = useWallet();

  const [mode, setMode] = useState<"native" | "erc20">("erc20");
  const [addressInput, setAddressInput] = useState<string>(CONFIG.demoToken.address);
  const [token, setToken] = useState<TokenMeta | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);

  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [parseError, setParseError] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [dragging, setDragging] = useState(false);

  const [startLocal, setStartLocal] = useState("");
  const [cliffDays, setCliffDays] = useState("0");
  const [durationDays, setDurationDays] = useState("365");
  const [reference, setReference] = useState("");

  const [balance, setBalance] = useState<bigint | null>(null);
  const [stage, setStage] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [approveHash, setApproveHash] = useState("");
  const [batches, setBatches] = useState<BatchState[]>([]);
  const [txError, setTxError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const chainNow = workspace?.chainNow ?? BigInt(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!startLocal && workspace) setStartLocal(toDateTimeLocal(workspace.chainNow + DAY));
  }, [startLocal, workspace]);

  useEffect(() => {
    setBalance(null);
    if (!account || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const value = token.native
          ? await readProvider.getBalance(account)
          : ((await new Contract(token.address, ERC20_ABI, readProvider).balanceOf(account)) as bigint);
        if (!cancelled) setBalance(value);
      } catch {
        if (!cancelled) setBalance(null);
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

  const verify = async () => {
    setTokenError("");
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
        setTokenError("This address did not return ERC-20 metadata.");
        return;
      }
      setToken(resolved);
      setMode("erc20");
    } finally {
      setTokenLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !fileText) return;
    const result = parseBulkCsv(fileText, token.decimals);
    setRows(result.rows);
    setParseError(result.error ?? "");
  }, [token, fileText]);

  const summary = useMemo(() => bulkSummary(rows), [rows]);
  const visibleRows = useMemo(
    () =>
      filter === "all"
        ? rows
        : rows.filter((row) =>
            filter === "valid" ? row.status === "valid" : row.status !== "valid",
          ),
    [rows, filter],
  );

  const batchesNeeded = Math.ceil(summary.valid / CONFIG.maxBatchSize);
  const insufficient = balance !== null && summary.totalWei > balance;

  const start = useMemo(() => parseDateTimeLocal(startLocal), [startLocal]);
  const cliffSeconds = useMemo(() => {
    const days = Number(cliffDays);
    return Number.isFinite(days) && days >= 0 ? BigInt(Math.round(days * 86400)) : 0n;
  }, [cliffDays]);
  const durationSeconds = useMemo(() => {
    const days = Number(durationDays);
    return Number.isFinite(days) && days > 0 ? BigInt(Math.round(days * 86400)) : 0n;
  }, [durationDays]);

  const scheduleErrors: string[] = [];
  if (!start) scheduleErrors.push("Set a valid start date and time.");
  if (durationSeconds <= 0n) scheduleErrors.push("Vesting duration must be at least one day.");
  if (cliffSeconds > durationSeconds) scheduleErrors.push("The cliff cannot exceed the duration.");

  const canExecute =
    stage !== "running" &&
    Boolean(account && token && start) &&
    summary.valid > 0 &&
    !insufficient &&
    scheduleErrors.length === 0;

  const readFile = async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    setFileText(text);
    if (!token) {
      setParseError("Select and verify the token before uploading so decimals are known.");
      setRows([]);
      return;
    }
    const result = parseBulkCsv(text, token.decimals);
    setRows(result.rows);
    setParseError(result.error ?? "");
  };

  const downloadTemplate = () => {
    const table = parseCsv(csvTemplate(token?.decimals ?? 18));
    downloadCsv("vestirail-bulk-template.csv", table);
  };

  const run = async () => {
    if (!token || !start) return;
    setStage("running");
    setTxError("");
    setBatches([]);
    setApproveHash("");
    try {
      const ok = await ensureNetwork();
      if (!ok) throw new Error("Switch the wallet to BOT Chain Testnet first.");
      const signer = await getSigner();
      const from = await signer.getAddress();
      const contract = new Contract(CONFIG.manager, vestingManagerAbi, signer);

      const valid = rows.filter((row) => row.status === "valid" && row.amountWei);
      const total = valid.reduce((sum, row) => sum + (row.amountWei ?? 0n), 0n);

      if (!token.native) {
        const tokenContract = new Contract(token.address, ERC20_ABI, signer);
        const allowance: bigint = await tokenContract.allowance(from, CONFIG.manager);
        if (allowance < total) {
          const approval = await tokenContract.approve(CONFIG.manager, total);
          setApproveHash(approval.hash);
          const receipt = await approval.wait();
          if (!receipt || receipt.status !== 1) throw new Error("Token approval failed.");
        }
      }

      const chunks: BulkRow[][] = [];
      for (let i = 0; i < valid.length; i += CONFIG.maxBatchSize) {
        chunks.push(valid.slice(i, i + CONFIG.maxBatchSize));
      }

      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        const inputs = chunk.map((row) => ({
          beneficiary: row.beneficiary,
          start,
          cliffDuration: cliffSeconds,
          duration: durationSeconds,
          totalAmount: row.amountWei as bigint,
        }));
        const amount = chunk.reduce((sum, row) => sum + (row.amountWei ?? 0n), 0n);

        const tx = token.native
          ? await contract.createNativeSchedules(inputs, { value: amount })
          : await contract.createTokenSchedules(token.address, inputs);

        setBatches((previous) => [
          ...previous,
          { index, count: chunk.length, amount, hash: tx.hash, status: "submitted", firstId: null },
        ]);

        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error(`Batch ${index + 1} reverted.`);

        let firstId: bigint | null = null;
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === "SchedulesCreated") {
              firstId = BigInt(parsed.args.firstScheduleId);
              break;
            }
          } catch {
            // Ignore logs emitted by the token contract.
          }
        }

        if (firstId !== null) {
          chunk.forEach((row, offset) => {
            if (row.label || row.reference) {
              saveLabel((firstId as bigint + BigInt(offset)).toString(), {
                label: row.label,
                reference: row.reference || reference,
              });
            }
          });
        }

        setBatches((previous) =>
          previous.map((entry) =>
            entry.index === index
              ? { ...entry, status: "confirmed", firstId }
              : entry,
          ),
        );
      }

      setStage("done");
      await refresh();
    } catch (cause) {
      setStage("failed");
      setTxError(decodeError(cause));
      setBatches((previous) =>
        previous.map((entry) =>
          entry.status === "submitted" ? { ...entry, status: "failed" } : entry,
        ),
      );
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Workspace / Bulk allocations</p>
          <h1>Bulk allocations</h1>
          <p className="page-sub">
            Upload a CSV, validate every row before funding, then create schedules in batches of
            up to {CONFIG.maxBatchSize}. Invalid rows never reach the contract.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="secondary" icon="download" onClick={downloadTemplate}>
            CSV template
          </Button>
        </div>
      </header>

      <Panel>
        <PanelHead
          eyebrow="Step 1"
          title="Asset and schedule terms"
          description="Every schedule in the batch shares these terms. Amounts come from the CSV."
        />
        <div className="panel-body stack-16">
          <Segmented
            options={[
              { value: "erc20", label: "ERC-20 token" },
              { value: "native", label: "Native BOT" },
            ]}
            value={mode}
            onChange={(value) => {
              if (value === "native") selectNative();
              else {
                setMode("erc20");
                setToken(null);
              }
            }}
            ariaLabel="Bulk allocation token type"
          />

          {mode === "erc20" ? (
            <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
              <div style={{ flex: "1 1 320px" }}>
                <Field label="Token contract" htmlFor="bulk-token" error={tokenError}>
                  <Input
                    id="bulk-token"
                    className="mono"
                    value={addressInput}
                    onChange={(event) => setAddressInput(event.target.value)}
                    spellCheck={false}
                  />
                </Field>
              </div>
              <Button variant="secondary" onClick={() => void verify()} loading={tokenLoading}>
                Verify token
              </Button>
              {token ? (
                <Badge tone="brand">
                  {token.symbol} · {token.decimals} decimals
                </Badge>
              ) : null}
            </div>
          ) : (
            <div className="kv-inline">
              <Badge tone="brand">BOT · native</Badge>
              <span>Native funding must equal the batch total exactly.</span>
            </div>
          )}

          <div className="form-grid">
            <Field label="Start date & time (UTC)" htmlFor="bulk-start" hint={start ? formatDateTime(start) : "Required"}>
              <Input
                id="bulk-start"
                type="datetime-local"
                value={startLocal}
                onChange={(event) => setStartLocal(event.target.value)}
              />
            </Field>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <Button size="sm" variant="secondary" type="button" onClick={() => setStartLocal(toDateTimeLocal(chainNow + DAY))}>
                Tomorrow
              </Button>
              <Button size="sm" variant="secondary" type="button" onClick={() => setStartLocal(toDateTimeLocal(chainNow))}>
                Now
              </Button>
            </div>
            <Field
              label="Cliff duration (days)"
              htmlFor="bulk-cliff"
              hint={cliffSeconds === 0n ? "No cliff" : `First claim ${start ? formatDateTime(start + cliffSeconds) : "—"}`}
            >
              <Input id="bulk-cliff" inputMode="numeric" value={cliffDays} onChange={(event) => setCliffDays(event.target.value)} />
            </Field>
            <Field
              label="Vesting duration (days)"
              htmlFor="bulk-duration"
              hint={start && durationSeconds > 0n ? `Fully vested ${formatDateTime(start + durationSeconds)}` : "Required"}
              error={cliffSeconds > durationSeconds ? "Cliff exceeds duration." : undefined}
            >
              <Input id="bulk-duration" inputMode="numeric" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} />
            </Field>
            <div className="span-2">
              <Field label="Batch reference" htmlFor="bulk-reference" optional hint="Applied to rows without their own reference. Stored locally.">
                <Input id="bulk-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Seed round — March 2026" />
              </Field>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHead
          eyebrow="Step 2"
          title="Upload allocations"
          description={`Accepted: CSV with beneficiary, amount, and optional label / reference columns. Maximum ${CONFIG.maxBatchSize} schedules per transaction.`}
          actions={
            <Button variant="ghost" size="sm" icon="download" onClick={downloadTemplate}>
              Download template
            </Button>
          }
        />
        <div className="panel-body">
          <label
            className={`dropzone ${dragging ? "is-over" : ""}`.trim()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void readFile(file);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
            <span className="dropzone-icon">
              <Icon name="upload" size={19} />
            </span>
            <strong>Drop a CSV here, or browse</strong>
            <span>UTF-8, comma separated · one beneficiary per row</span>
            {fileName ? (
              <span className="file-pill" style={{ marginTop: 8 }}>
                <Icon name="schedules" size={12} /> {fileName}
              </span>
            ) : null}
          </label>

          {parseError ? (
            <div style={{ marginTop: 12 }}>
              <Notice tone="error" title="CSV problem">
                {parseError}
              </Notice>
            </div>
          ) : null}
        </div>
      </Panel>

      {rows.length > 0 ? (
        <Panel>
          <PanelHead
            eyebrow="Step 3"
            title="Validation"
            description="Resolve errors before proceeding. Duplicate addresses are flagged so one wallet is not allocated twice in a batch."
            actions={
              <div className="row">
                <Segmented
                  options={[
                    { value: "all", label: `All ${summary.total}` },
                    { value: "valid", label: `Valid ${summary.valid}` },
                    { value: "invalid", label: `Issues ${summary.invalid}` },
                  ]}
                  value={filter}
                  onChange={setFilter}
                  ariaLabel="Validation filter"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRows((previous) => previous.filter((row) => row.status === "valid"))}
                  disabled={summary.invalid === 0}
                >
                  Remove invalid rows
                </Button>
              </div>
            }
          />

          <div className="panel-body">
            <div className="bulk-summary">
              <div>
                <span>Rows</span>
                <strong>{summary.total}</strong>
              </div>
              <div>
                <span>Valid</span>
                <strong className="is-good">{summary.valid}</strong>
              </div>
              <div>
                <span>Issues</span>
                <strong className={summary.invalid > 0 ? "is-bad" : ""}>{summary.invalid}</strong>
              </div>
              <div>
                <span>Total allocation</span>
                <strong>
                  {token ? `${formatAmount(summary.totalWei, token.decimals, 6)} ${token.symbol}` : "—"}
                </strong>
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Beneficiary</th>
                  <th scope="col" className="is-numeric">Amount</th>
                  <th scope="col">Label</th>
                  <th scope="col">Status</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.line} className={row.status === "valid" ? "" : "row-invalid"}>
                    <td className="mono-sm">{row.line}</td>
                    <td>
                      {row.beneficiary ? (
                        <span className="mono-sm">{row.beneficiary.slice(0, 10)}…{row.beneficiary.slice(-4)}</span>
                      ) : (
                        <span className="muted">Missing</span>
                      )}
                    </td>
                    <td className="is-numeric">
                      {row.amountWei && token
                        ? `${formatAmount(row.amountWei, token.decimals)} ${token.symbol}`
                        : row.amount || "—"}
                    </td>
                    <td>{row.label || "—"}</td>
                    <td>
                      <span className={`status-cell ${row.status === "valid" ? "good" : "bad"}`}>
                        <Icon name={row.status === "valid" ? "check" : "alert"} size={13} />
                        {row.status === "valid"
                          ? "Valid"
                          : row.status === "duplicate"
                            ? "Duplicate"
                            : row.status === "invalid-address"
                              ? "Invalid address"
                              : row.status === "invalid-amount"
                                ? "Invalid amount"
                                : "Incomplete"}
                      </span>
                    </td>
                    <td className="muted">{row.error ?? "Ready to fund"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length === 0 ? <p className="table-empty">No rows in this view.</p> : null}
          </div>
        </Panel>
      ) : null}

      {rows.length > 0 ? (
        <Panel>
          <PanelHead
            eyebrow="Step 4"
            title="Batch summary and funding"
            description="Review the transaction count and required balance before signing anything."
          />
          <div className="panel-body stack-16">
            <div className="bulk-summary">
              <div>
                <span>Beneficiaries</span>
                <strong>{summary.valid}</strong>
              </div>
              <div>
                <span>Transactions required</span>
                <strong>{batchesNeeded}{token && !token.native ? " + approval" : ""}</strong>
              </div>
              <div>
                <span>Total allocation</span>
                <strong>{token ? `${formatAmount(summary.totalWei, token.decimals, 6)} ${token.symbol}` : "—"}</strong>
              </div>
              <div>
                <span>Wallet balance</span>
                <strong>
                  {!account
                    ? "Not connected"
                    : balance === null
                      ? "Reading…"
                      : token
                        ? `${formatAmount(balance, token.decimals)} ${token.symbol}`
                        : "—"}
                </strong>
              </div>
            </div>

            <div className="batch-note">
              <Icon name="shield" size={16} />
              <span>
                {summary.valid} valid rows will be split into {batchesNeeded} transaction
                {batchesNeeded === 1 ? "" : "s"} of at most {CONFIG.maxBatchSize}. Each batch is
                funded exactly; if one batch fails, earlier batches remain on chain and are
                reported individually below.
                {mode === "native" ? " Keep additional BOT for gas in the funding wallet." : ""}
              </span>
            </div>

            {insufficient ? (
              <Notice tone="error" title="Insufficient balance">
                The batch requires {token ? `${formatAmount(summary.totalWei, token.decimals)} ${token.symbol}` : "more tokens"} than the
                connected wallet holds.
              </Notice>
            ) : null}

            {scheduleErrors.length > 0 ? (
              <Notice tone="warn" title="Schedule terms incomplete">
                {scheduleErrors[0]}
              </Notice>
            ) : null}

            {!account ? (
              <Button variant="primary" icon="wallet" onClick={() => void connect()} loading={connecting}>
                Connect wallet
              </Button>
            ) : (
              <div className="row" style={{ flexWrap: "wrap" }}>
                <Button
                  variant="primary"
                  icon="lock"
                  onClick={() => void run()}
                  loading={stage === "running"}
                  disabled={!canExecute}
                >
                  {stage === "running"
                    ? "Submitting batches…"
                    : `Create ${summary.valid} schedules`}
                </Button>
                <span className="figure-hint">
                  {token ? `${formatAmount(summary.totalWei, token.decimals)} ${token.symbol} exact funding` : ""}
                </span>
              </div>
            )}

            {approveHash ? (
              <p className="figure-hint">
                Approval transaction:{" "}
                <a className="inline-link mono-sm" href={EXPLORER.tx(approveHash)} target="_blank" rel="noreferrer">
                  {approveHash.slice(0, 12)}… <Icon name="external" size={11} />
                </a>
              </p>
            ) : null}

            {batches.length > 0 ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Batch</th>
                      <th scope="col" className="is-numeric">Schedules</th>
                      <th scope="col" className="is-numeric">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr key={batch.index}>
                        <td>#{batch.index + 1}</td>
                        <td className="is-numeric">{batch.count}</td>
                        <td className="is-numeric">
                          {token ? `${formatAmount(batch.amount, token.decimals)} ${token.symbol}` : "—"}
                        </td>
                        <td>
                          <span className={`status-cell ${batch.status === "confirmed" ? "good" : batch.status === "failed" ? "bad" : ""}`}>
                            <Icon name={batch.status === "confirmed" ? "check" : batch.status === "failed" ? "alert" : "clock"} size={13} />
                            {batch.status === "confirmed" ? "Confirmed" : batch.status === "failed" ? "Failed" : "Confirming"}
                          </span>
                        </td>
                        <td>
                          <a className="inline-link mono-sm" href={EXPLORER.tx(batch.hash)} target="_blank" rel="noreferrer">
                            {batch.hash.slice(0, 10)}… <Icon name="external" size={11} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {stage === "failed" && txError ? (
              <Notice tone="error" title="Batch run stopped">
                {txError}
              </Notice>
            ) : null}

            {stage === "done" ? (
              <Notice
                tone="success"
                title="All batches confirmed"
                action={
                  <a href="/app/schedules">
                    <Button variant="secondary" size="sm" icon="schedules">
                      Open register
                    </Button>
                  </a>
                }
              >
                {batches.filter((batch) => batch.status === "confirmed").reduce((sum, batch) => sum + batch.count, 0)}{" "}
                schedules were created and funded. Beneficiaries can claim as their cliffs and
                curves allow.
              </Notice>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <div className="batch-note">
        <Icon name="shield" size={16} />
        <span>
          The CSV never leaves your browser. Parsing, validation and amount conversion happen
          locally; only the resulting schedule inputs are sent to the contract.
        </span>
      </div>
    </div>
  );
}
