import { getAddress, parseUnits } from "ethers";

export type BulkStatus = "valid" | "invalid-address" | "invalid-amount" | "duplicate" | "incomplete";

export type BulkRow = {
  line: number;
  beneficiary: string;
  amount: string;
  label: string;
  reference: string;
  status: BulkStatus;
  error?: string;
  amountWei?: bigint;
};

export type BulkParseResult = {
  rows: BulkRow[];
  headers: string[];
  error?: string;
};

/** Small CSV parser supporting quoted fields and escaped quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((line) => line.some((cell) => cell.trim() !== ""));
}

export function parseBulkCsv(text: string, decimals: number): BulkParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], headers: [], error: "The file is empty." };

  const headers = table[0].map((header) => header.trim().toLowerCase());
  const find = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header));

  const addressIndex = find("beneficiary", "address", "wallet", "beneficiary_address");
  const amountIndex = find("amount", "allocation", "tokens", "quantity");
  const labelIndex = find("label", "name", "category");
  const referenceIndex = find("reference", "description", "note", "memo");

  if (addressIndex === -1 || amountIndex === -1) {
    return {
      rows: [],
      headers,
      error: "Expected a 'beneficiary' column and an 'amount' column.",
    };
  }

  const seen = new Map<string, number>();
  const rows: BulkRow[] = table.slice(1).map((cells, index) => {
    const beneficiary = (cells[addressIndex] ?? "").trim();
    const amount = (cells[amountIndex] ?? "").trim();
    const label = labelIndex >= 0 ? (cells[labelIndex] ?? "").trim() : "";
    const reference = referenceIndex >= 0 ? (cells[referenceIndex] ?? "").trim() : "";
    const line = index + 2;

    const base: BulkRow = {
      line,
      beneficiary,
      amount,
      label,
      reference,
      status: "valid",
    };

    if (!beneficiary && !amount) {
      return { ...base, status: "incomplete", error: "Row is empty." };
    }
    if (!beneficiary || !amount) {
      return {
        ...base,
        status: "incomplete",
        error: !beneficiary ? "Beneficiary address is missing." : "Amount is missing.",
      };
    }

    let checksummed: string;
    try {
      checksummed = getAddress(beneficiary);
    } catch {
      return { ...base, status: "invalid-address", error: "Not a valid EVM address." };
    }

    let amountWei: bigint;
    try {
      amountWei = parseUnits(amount.replace(/,/g, ""), decimals);
    } catch {
      return {
        ...base,
        status: "invalid-amount",
        error: `Amount must be a positive number with up to ${decimals} decimals.`,
      };
    }
    if (amountWei <= 0n) {
      return { ...base, status: "invalid-amount", error: "Amount must be greater than zero." };
    }

    const key = checksummed.toLowerCase();
    if (seen.has(key)) {
      return {
        ...base,
        beneficiary: checksummed,
        status: "duplicate",
        error: `Duplicate of line ${seen.get(key)}.`,
      };
    }
    seen.set(key, line);

    return { ...base, beneficiary: checksummed, amountWei, status: "valid" };
  });

  return { rows, headers };
}

export function bulkSummary(rows: BulkRow[]) {
  const valid = rows.filter((row) => row.status === "valid");
  return {
    total: rows.length,
    valid: valid.length,
    invalid: rows.length - valid.length,
    totalWei: valid.reduce((sum, row) => sum + (row.amountWei ?? 0n), 0n),
  };
}

export function csvTemplate(_decimals: number): string {
  return [
    "beneficiary,amount,label,reference",
    "0x15C450B5C09eb80c783102215fa5aAd4AC92a24F,1250,Core contributor,Offer 2026-01",
    "0x7D4fA25f674606f07d2fEB21938871Da6C95069F,500,Advisor,Advisory agreement",
  ].join("\n");
}
