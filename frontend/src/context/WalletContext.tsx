import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BrowserProvider } from "ethers";
import type { JsonRpcSigner } from "ethers";
import { CONFIG } from "../lib/config";
import { decodeError } from "../lib/format";

type WalletContextValue = {
  account: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string;
  connect: () => Promise<void>;
  ensureNetwork: () => Promise<boolean>;
  getSigner: () => Promise<JsonRpcSigner>;
  clearError: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function provider() {
  return window.ethereum;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  const readChain = useCallback(async () => {
    const eth = provider();
    if (!eth) return;
    try {
      const hex = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(hex, 16));
    } catch {
      setChainId(null);
    }
  }, []);

  useEffect(() => {
    const eth = provider();
    if (!eth) return;
    void readChain();
    eth
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list.length > 0) setAccount(list[0]);
      })
      .catch(() => undefined);

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAccount(accounts.length > 0 ? accounts[0] : null);
    };
    const onChain = () => {
      void readChain();
    };
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [readChain]);

  const ensureNetwork = useCallback(async (): Promise<boolean> => {
    const eth = provider();
    if (!eth) {
      setError("No browser wallet detected. Install a wallet to sign transactions.");
      return false;
    }
    const hexChain = `0x${CONFIG.chainId.toString(16)}`;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChain }],
      });
      await readChain();
      return true;
    } catch (switchError) {
      const code = (switchError as { code?: number }).code;
      if (code !== 4902) {
        setError(decodeError(switchError));
        return false;
      }
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hexChain,
              chainName: CONFIG.chainName,
              nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
              rpcUrls: [CONFIG.rpcUrl],
              blockExplorerUrls: [CONFIG.explorer],
            },
          ],
        });
        await readChain();
        return true;
      } catch (addError) {
        setError(decodeError(addError));
        return false;
      }
    }
  }, [readChain]);

  const connect = useCallback(async () => {
    const eth = provider();
    if (!eth) {
      setError("No browser wallet detected. Install a wallet to sign transactions.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const browserProvider = new BrowserProvider(eth);
      const accounts = (await browserProvider.send("eth_requestAccounts", [])) as string[];
      const network = await browserProvider.getNetwork();
      setChainId(Number(network.chainId));
      setAccount(accounts[0] ?? null);
      if (Number(network.chainId) !== CONFIG.chainId) {
        await ensureNetwork();
      }
    } catch (cause) {
      setError(decodeError(cause));
    } finally {
      setConnecting(false);
    }
  }, [ensureNetwork]);

  const getSigner = useCallback(async () => {
    const eth = provider();
    if (!eth) throw new Error("No browser wallet detected.");
    const browserProvider = new BrowserProvider(eth);
    return browserProvider.getSigner();
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      account,
      chainId,
      connecting,
      error,
      connect,
      ensureNetwork,
      getSigner,
      clearError: () => setError(""),
    }),
    [account, chainId, connecting, error, connect, ensureNetwork, getSigner],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
