import { formatFixedSafe, toFiniteNumberOrNull } from "../utils/numberFormat";

type Transaction = {
  _id: string;
  type: string;
  amount: number | null;
  network: string;
  status: string;
  metadata?: {
    requestedCreditAmount?: number;
    expectedPayAmount?: number;
    expectedPayCurrency?: string;
    gatewayFeeAmount?: number;
    gatewayFeeCurrency?: string;
  };
  createdAt: string;
};

const resolveTypeLabel = (type: string) => {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "trade_start") return "Trading Started";
  if (normalized === "trade_close") return "Trade Closed";
  if (normalized === "referral") return "Direct Income";
  if (normalized === "level") return "Level Income";
  if (normalized === "salary") return "Salary Income";
  if (normalized === "trading") return "Trading Income";
  return String(type || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const TransactionTable = ({ items }: { items: Transaction[] }) => {
  return (
    <div className="overflow-x-auto rounded-2xl border border-cyan-800/40 bg-slate-900/80">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800/80 text-slate-300">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Type</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Network</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((tx) => (
            <tr key={tx._id} className="border-t border-slate-800 text-slate-200">
              <td className="p-3">{new Date(tx.createdAt).toLocaleString()}</td>
              <td className="p-3">{resolveTypeLabel(tx.type)}</td>
              <td className={`p-3 font-semibold ${Number(tx.amount || 0) < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                ${formatFixedSafe(tx.amount, 2, "0.00")}
                {String(tx.type || "").toLowerCase() === "deposit" && (
                  <div className="mt-1 text-xs font-normal text-slate-300">
                    Requested:{" "}
                    {formatFixedSafe(
                      toFiniteNumberOrNull(tx.metadata?.requestedCreditAmount) ?? toFiniteNumberOrNull(tx.amount),
                      2,
                      "0.00"
                    )}{" "}
                    USDT
                    {toFiniteNumberOrNull(tx.metadata?.expectedPayAmount) !== null && (
                      <>
                        {" | "}Payable: {formatFixedSafe(tx.metadata?.expectedPayAmount, 2, "0.00")}{" "}
                        {String(tx.metadata?.expectedPayCurrency || "USDT").toUpperCase()}
                      </>
                    )}
                    {toFiniteNumberOrNull(tx.metadata?.gatewayFeeAmount) !== null && (
                      <>
                        {" | "}Fee: {formatFixedSafe(Math.max(0, Number(tx.metadata?.gatewayFeeAmount)), 2, "0.00")}{" "}
                        {String(tx.metadata?.gatewayFeeCurrency || tx.metadata?.expectedPayCurrency || "USDT").toUpperCase()}
                      </>
                    )}
                  </div>
                )}
              </td>
              <td className="p-3">{tx.network || "INTERNAL"}</td>
              <td className="p-3">{tx.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionTable;
