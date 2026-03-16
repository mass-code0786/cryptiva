type WalletCardProps = {
  depositWallet: number;
  withdrawalWallet: number;
  tradingWallet: number;
};

const WalletCard = ({ depositWallet, withdrawalWallet, tradingWallet }: WalletCardProps) => {
  return (
    <div className="rounded-2xl border border-cyan-800/40 bg-gradient-to-br from-slate-900 to-slate-950 p-4 shadow-xl">
      <h2 className="text-lg font-semibold">Wallet Overview</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
        <div className="rounded-xl bg-slate-800/60 p-2">
          <p className="text-slate-400">Withdrawal Wallet</p>
          <p className="text-2xl font-bold text-blue-300">${withdrawalWallet.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-slate-800/60 p-2">
          <p className="text-slate-400">Deposit Wallet</p>
          <p className="text-2xl font-bold text-cyan-300">${depositWallet.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-slate-800/60 p-2">
          <p className="text-slate-400">Trading Wallet</p>
          <p className="text-2xl font-bold text-indigo-300">${tradingWallet.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default WalletCard;
