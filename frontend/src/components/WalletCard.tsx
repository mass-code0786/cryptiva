type WalletCardProps = {
  depositWallet: number;
  withdrawalWallet: number;
  tradingWallet: number;
};

const WalletCard = ({ depositWallet, withdrawalWallet, tradingWallet }: WalletCardProps) => {
  return (
    <div className="rounded-2xl border border-wallet-border/70 bg-gradient-to-br from-wallet-panel to-wallet-bg p-4 shadow-xl">
      <h2 className="text-lg font-semibold text-wallet-text">Wallet Overview</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
        <div className="rounded-xl bg-wallet-panelAlt/60 p-2">
          <p className="text-wallet-muted">Withdrawal Wallet</p>
          <p className="text-2xl font-bold text-wallet-accentAlt">${withdrawalWallet.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-wallet-panelAlt/60 p-2">
          <p className="text-wallet-muted">Deposit Wallet</p>
          <p className="text-2xl font-bold text-wallet-accent">${depositWallet.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-wallet-panelAlt/60 p-2">
          <p className="text-wallet-muted">Trading Wallet</p>
          <p className="text-2xl font-bold text-wallet-accentAlt">${tradingWallet.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default WalletCard;
