import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CryptivaLogo from "../components/CryptivaLogo";
import { useAuth } from "../hooks/useAuth";

type CreatedAccountDetails = {
  userId: string;
  name: string;
  email: string;
  referralCode: string;
};

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    pin: "",
    referralCode: "",
  });
  const [error, setError] = useState("");
  const [createdAccount, setCreatedAccount] = useState<CreatedAccountDetails | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setCopySuccess(false);
    try {
      await register(form);
      const storedUserRaw = localStorage.getItem("user");
      const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
      setCreatedAccount({
        userId: storedUser?.userId || storedUser?.id || "N/A",
        name: storedUser?.name || form.name,
        email: storedUser?.email || form.email,
        referralCode: storedUser?.referralCode || form.referralCode || "N/A",
      });
    } catch {
      setError("Registration failed");
    }
  };

  const closeModal = () => {
    setCreatedAccount(null);
    navigate("/");
  };

  const copyDetails = async () => {
    if (!createdAccount) return;

    const detailsText = [
      "Account Created Successfully",
      "",
      `User ID: ${createdAccount.userId}`,
      `Name: ${createdAccount.name}`,
      `Email: ${createdAccount.email}`,
      `Referral Code: ${createdAccount.referralCode}`,
      "",
      "Please take a screenshot and save your account details.",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(detailsText);
      setCopySuccess(true);
    } catch {
      setCopySuccess(false);
    }
  };

  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center">
      <CryptivaLogo variant="auth" className="mb-3" />
      <div className="w-full rounded-2xl border border-cyan-800/40 bg-slate-900/80 p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-400/80">Cryptiva</p>
        <h1 className="mb-4 text-2xl font-semibold">Register</h1>
        <form className="space-y-3" onSubmit={submit}>
          <input className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3" placeholder="PIN (4-6 digits)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          <input className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3" placeholder="Referral Code (optional)" value={form.referralCode} onChange={(e) => setForm({ ...form, referralCode: e.target.value })} />
          {error && <p className="text-red-400">{error}</p>}
          <button className="w-full rounded-xl bg-cyan-500 p-3 font-semibold text-slate-950">Create Account</button>
        </form>
        <p className="mt-3 text-sm">Already have an account? <Link to="/login" className="text-cyan-300">Login</Link></p>
      </div>

      {createdAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-[0_0_32px_rgba(34,211,238,0.2)]">
            <h2 className="text-xl font-semibold text-cyan-300">Account Created Successfully</h2>
            <div className="mt-4 space-y-2 rounded-xl border border-cyan-900/40 bg-slate-900/60 p-4 text-sm text-slate-200">
              <p><span className="text-slate-400">User ID:</span> {createdAccount.userId}</p>
              <p><span className="text-slate-400">Name:</span> {createdAccount.name}</p>
              <p><span className="text-slate-400">Email:</span> {createdAccount.email}</p>
              <p><span className="text-slate-400">Referral Code:</span> {createdAccount.referralCode}</p>
            </div>
            <p className="mt-4 text-sm text-cyan-100">
              Please take a screenshot and save your account details.
            </p>
            {copySuccess && <p className="mt-2 text-xs text-emerald-300">Details copied to clipboard.</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyDetails}
                className="rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30"
              >
                Copy Details
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegisterPage;
