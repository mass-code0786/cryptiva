type WalletCardProps = {
  depositWallet: number;
  withdrawalWallet: number;
  tradingWallet: number;
  loading?: boolean;
};

const WalletCard = ({ depositWallet, withdrawalWallet, tradingWallet, loading = false }: WalletCardProps) => {
  return (
    <div className={`wallet-panel-strong p-5 sm:p-6 ${loading ? "wallet-shimmer" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="wallet-kicker">Wallet Balance</p>
          <h2 className="wallet-title mt-2 text-xl sm:text-2xl">Wallet Overview</h2>
        </div>
        <div className="wallet-chip wallet-status-info">Secure Wallet</div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
        <div className="rounded-[20px] border border-white/10 bg-[#0a1b34]/85 p-4">
          <p className="text-wallet-muted">Withdrawal Wallet</p>
          {loading ? (
            <>
              <div className="wallet-skeleton-line mt-2 h-8 w-28 sm:h-9 sm:w-32" />
              <div className="wallet-skeleton-line mt-3 h-3 w-20" />
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-wallet-text sm:text-[2rem]">${withdrawalWallet.toFixed(2)}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#a8bbd6]">Ready balance</p>
            </>
          )}
        </div>
        <div className="rounded-[20px] border border-wallet-accent/25 bg-[linear-gradient(180deg,rgba(0,194,255,0.14),rgba(7,19,38,0.12))] p-4">
          <p className="text-wallet-muted">Deposit Wallet</p>
          {loading ? (
            <>
              <div className="wallet-skeleton-line mt-2 h-8 w-28 sm:h-9 sm:w-32" />
              <div className="wallet-skeleton-line mt-3 h-3 w-20" />
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-wallet-accentSoft sm:text-[2rem]">${depositWallet.toFixed(2)}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-wallet-accentSoft/80">Primary funding</p>
            </>
          )}
        </div>
        <div className="rounded-[20px] border border-white/10 bg-[#0c223e]/85 p-4">
          <p className="text-wallet-muted">Trading Wallet</p>
          {loading ? (
            <>
              <div className="wallet-skeleton-line mt-2 h-8 w-28 sm:h-9 sm:w-32" />
              <div className="wallet-skeleton-line mt-3 h-3 w-20" />
            </>
          ) : (
            <>
              <p className="mt-2 text-2xl font-bold text-[#8fcfff] sm:text-[2rem]">${tradingWallet.toFixed(2)}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-[#a8bbd6]">Market allocation</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletCard;
