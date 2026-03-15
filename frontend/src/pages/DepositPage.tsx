import { FormEvent, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { createDepositRequest } from "../services/financeService";
import { fetchMyProfile } from "../services/userService";

const DepositPage = () => {
  const [amount, setAmount] = useState("50");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [payAddress, setPayAddress] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setPaymentUrl("");
    setPayAddress("");
    setQrCodeUrl("");
    try {
      const profileRes = await fetchMyProfile();
      const walletAddress = profileRes.data?.user?.walletAddress;
      if (!walletAddress) {
        setMessage("Please bind your USDT BEP20 wallet address first.");
        return;
      }

      const { data } = await createDepositRequest({ amount: Number(amount), currency: "USDT" });
      setPaymentUrl(data?.payment?.payment_url || "");
      setPayAddress(data?.payment?.pay_address || "");
      setQrCodeUrl(data?.payment?.qr_code_url || "");
      setMessage("Deposit request created");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Deposit request failed");
    }
  };

  return (
    <DashboardLayout>
      <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
        <h2 className="text-xl font-semibold">Deposit</h2>
        <p className="mt-1 text-sm text-slate-400">Only USDT BEP20 is allowed. Minimum deposit: $5.</p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            type="number"
            min={5}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
            placeholder="Amount (USDT)"
          />
          <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
            Create Deposit
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
        {paymentUrl && (
          <a
            className="mt-3 block rounded-xl bg-cyan-500/10 p-3 text-sm text-cyan-300 underline"
            href={paymentUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open payment link
          </a>
        )}
        {payAddress && (
          <div className="mt-3 rounded-xl bg-slate-950/70 p-3 text-sm">
            <p className="text-slate-400">Payment Address (USDT BEP20)</p>
            <p className="mt-1 break-all text-cyan-300">{payAddress}</p>
          </div>
        )}
        {qrCodeUrl && (
          <img
            src={qrCodeUrl}
            alt="Deposit QR code"
            className="mt-3 max-w-[180px] rounded-xl border border-cyan-800/40 bg-slate-950 p-2"
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default DepositPage;
