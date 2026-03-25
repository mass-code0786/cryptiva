type WalletCardProps = {
  depositWallet: number;
  withdrawalWallet: number;
  tradingWallet: number;
};

const WalletCard = ({ depositWallet, withdrawalWallet, tradingWallet }: WalletCardProps) => {
  return (
    <div className="wallet-panel-strong p-4">
      <h2 className="text-lg font-semibold text-wallet-text">Wallet Overview</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
        <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-wallet-accent/40">
          <p className="text-wallet-muted">Withdrawal Wallet</p>
          <p className="wallet-profit-flash text-2xl font-bold text-wallet-accent">${withdrawalWallet.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-wallet-accent/40">
          <p className="text-wallet-muted">Deposit Wallet</p>
          <p className="wallet-profit-flash text-2xl font-bold text-wallet-accent">${depositWallet.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-wallet-border bg-wallet-panelAlt p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-wallet-accent/40">
          <p className="text-wallet-muted">Trading Wallet</p>
          <p className="wallet-profit-flash text-2xl font-bold text-wallet-accent">${tradingWallet.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default WalletCard;
