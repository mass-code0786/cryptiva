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
      const backendMessage = String(error?.response?.data?.message || "Deposit request failed");
      const backendDetail = String(error?.response?.data?.detail || "").trim();
      setMessage(backendDetail ? `${backendMessage}: ${backendDetail}` : backendMessage);
    }
  };

  return (
    <DashboardLayout>
      <div className="wallet-panel-strong p-4">
        <h2 className="wallet-title text-xl">Deposit</h2>
        <p className="mt-1 text-sm text-wallet-muted">Only USDT BEP20 is allowed. Minimum deposit: $5.</p>
        <p className="mt-2 rounded-2xl border border-wallet-warning/25 bg-wallet-warning/10 px-3 py-2 text-xs text-wallet-warning">
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
            className="wallet-input"
            placeholder="Amount (USDT)"
          />
          <button className="wallet-button-primary w-full">
            Create Deposit
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-wallet-accentSoft">{message}</p>}
        {requestedCreditAmount !== null && (
          <div className="mt-3 rounded-[20px] border border-wallet-border bg-[#0a1b34]/90 p-4 text-sm text-wallet-text">
            <p>
              Deposit Amount (credited in Cryptiva):{" "}
              <span className="font-semibold text-wallet-accentSoft">{money(requestedCreditAmount)} USDT</span>
            </p>
            {gatewayFeeAmount !== null && (
              <p className="mt-1">
                Gateway / Network Fee:{" "}
                <span className="font-semibold text-wallet-warning">
                  {money(Math.max(0, gatewayFeeAmount))} {gatewayFeeCurrency || expectedPayCurrency}
                </span>
              </p>
            )}
            {expectedPayAmount !== null && (
              <p className="mt-1">
                Total You Need to Pay:{" "}
                <span className="font-semibold text-wallet-success">
                  {money(expectedPayAmount)} {expectedPayCurrency || "USDT"}
                </span>
              </p>
            )}
          </div>
        )}
        {paymentUrl && (
          <a
            className="wallet-button-secondary mt-3 flex rounded-[20px] px-4 py-3 underline"
            href={paymentUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open payment link
          </a>
        )}
        {payAddress && (
          <div className="mt-3 rounded-[20px] border border-white/8 bg-[#0a1b34]/90 p-3 text-sm">
            <p className="text-wallet-muted">Payment Address (USDT BEP20)</p>
            <p className="mt-1 break-all text-wallet-accentSoft">{payAddress}</p>
          </div>
        )}
        {qrCodeUrl && (
          <img
            src={qrCodeUrl}
            alt="Deposit QR code"
            className="mt-3 max-w-[180px] rounded-[20px] border border-wallet-border bg-[#0a1b34] p-2"
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default DepositPage;
