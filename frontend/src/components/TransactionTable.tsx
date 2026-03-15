type Transaction = {
  _id: string;
  type: string;
  amount: number;
  network: string;
  status: string;
  createdAt: string;
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
              <td className="p-3 uppercase">{tx.type}</td>
              <td className="p-3">${tx.amount.toFixed(2)}</td>
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
