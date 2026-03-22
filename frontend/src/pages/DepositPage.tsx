import { FormEvent, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { createDepositRequest } from "../services/financeService";
import { formatLocaleSafe, toFiniteNumberOrNull } from "../utils/numberFormat";
const money = (value: unknown) => formatLocaleSafe(value, { minimumFractionDigits: 2, maximumFractionDigits: 8 }, "0.00");

const DepositPage = () => {
  const [amount, setAmount] = useState("50");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [payAddress, setPayAddress] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [requestedCreditAmount, setRequestedCreditAmount] = useState<number | null>(null);
  const [expectedPayAmount, setExpectedPayAmount] = useState<number | null>(null);
  const [expectedPayCurrency, setExpectedPayCurrency] = useState("USDT");
  const [gatewayFeeAmount, setGatewayFeeAmount] = useState<number | null>(null);
  const [gatewayFeeCurrency, setGatewayFeeCurrency] = useState("USDT");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setPaymentUrl("");
    setPayAddress("");
    setQrCodeUrl("");
    setRequestedCreditAmount(null);
    setExpectedPayAmount(null);
    setExpectedPayCurrency("USDT");
    setGatewayFeeAmount(null);
    setGatewayFeeCurrency("USDT");
    try {
      const { data } = await createDepositRequest({ amount: Number(amount), currency: "USDT" });
      setPaymentUrl(data?.paymentUrl || data?.deposit?.payment?.payment_url || "");
      setPayAddress(data?.payAddress || data?.deposit?.payment?.pay_address || "");
      setQrCodeUrl(data?.qrData || data?.deposit?.payment?.qr_code_url || "");
      const requested =
        toFiniteNumberOrNull(data?.requestedCreditAmount) ??
        toFiniteNumberOrNull(data?.deposit?.requestedCreditAmount) ??
        toFiniteNumberOrNull(data?.deposit?.amount) ??
        toFiniteNumberOrNull(amount);
      const expectedPay = toFiniteNumberOrNull(data?.expectedPayAmount) ?? toFiniteNumberOrNull(data?.deposit?.expectedPayAmount);
      const expectedCurrency = String(data?.expectedPayCurrency || data?.deposit?.expectedPayCurrency || "USDT").toUpperCase();
      const feeFromApi = toFiniteNumberOrNull(data?.gatewayFeeAmount) ?? toFiniteNumberOrNull(data?.deposit?.gatewayFeeAmount);
      const canDeriveFee = expectedPay !== null && requested !== null && expectedCurrency.includes("USDT");
      const derivedFee = canDeriveFee ? Math.max(0, Number((expectedPay - requested).toFixed(8))) : null;

      setRequestedCreditAmount(requested);
      setExpectedPayAmount(expectedPay);
      setExpectedPayCurrency(expectedCurrency || "USDT");
      setGatewayFeeAmount(feeFromApi ?? derivedFee);
      setGatewayFeeCurrency(String(data?.gatewayFeeCurrency || data?.deposit?.gatewayFeeCurrency || expectedCurrency || "USDT").toUpperCase());
      setMessage("Live payment order created");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Deposit request failed");
    }
  };

  return (
    <DashboardLayout>
      <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
        <h2 className="text-xl font-semibold">Deposit</h2>
        <p className="mt-1 text-sm text-slate-400">Only USDT BEP20 is allowed. Minimum deposit: $5.</p>
        <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Due to gateway/network charges, the payable amount may be slightly higher than the credited amount.
          Cryptiva wallet will be credited with the selected deposit amount after successful payment verification.
        </p>
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
        {requestedCreditAmount !== null && (
          <div className="mt-3 rounded-xl border border-cyan-800/40 bg-slate-950/70 p-3 text-sm text-slate-200">
            <p>
              Deposit Amount (credited in Cryptiva):{" "}
              <span className="font-semibold text-cyan-300">{money(requestedCreditAmount)} USDT</span>
            </p>
            {gatewayFeeAmount !== null && (
              <p className="mt-1">
                Gateway / Network Fee:{" "}
                <span className="font-semibold text-amber-200">
                  {money(Math.max(0, gatewayFeeAmount))} {gatewayFeeCurrency || expectedPayCurrency}
                </span>
              </p>
            )}
            {expectedPayAmount !== null && (
              <p className="mt-1">
                Total You Need to Pay:{" "}
                <span className="font-semibold text-emerald-300">
                  {money(expectedPayAmount)} {expectedPayCurrency || "USDT"}
                </span>
              </p>
            )}
          </div>
        )}
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
