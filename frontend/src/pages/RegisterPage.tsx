import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import CryptivaLogo from "../components/CryptivaLogo";
import { useAuth } from "../hooks/useAuth";

type CreatedAccountDetails = {
  userId: string;
  username: string;
  name: string;
  email: string;
  referralCode: string;
};

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    pin: "",
    referralCode: "",
    referrerCode: "",
  });
  const [error, setError] = useState("");
  const [createdAccount, setCreatedAccount] = useState<CreatedAccountDetails | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      setForm((prev) => ({
        ...prev,
        referrerCode: ref.trim().toLowerCase(),
      }));
    }
  }, []);

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
        username: storedUser?.username || form.username,
        name: storedUser?.name || form.name,
        email: storedUser?.email || form.email,
        referralCode: storedUser?.referralCode || form.referralCode || "N/A",
      });
    } catch (error: any) {
      setError(error?.response?.data?.message || "Registration failed");
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
      `Username: ${createdAccount.username}`,
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
    <div className="wallet-auth-shell mx-auto mt-8 flex max-w-md flex-col items-center">
      <CryptivaLogo variant="auth" className="mb-3" />
      <div className="wallet-auth-card w-full p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-wallet-accentAlt/80">Cryptiva</p>
        <h1 className="mb-4 text-2xl font-semibold text-wallet-text">Register</h1>
        <form className="space-y-3" onSubmit={submit}>
          <input className="wallet-auth-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input
            className="wallet-auth-input"
            placeholder="Username (4-20 letters/numbers)"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toUpperCase() })}
          />
          <input className="wallet-auth-input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="wallet-auth-input" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="wallet-auth-input" placeholder="PIN (4-6 digits)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
          <input
            className="wallet-auth-input"
            placeholder="Your Referral Code (4-20 letters/numbers)"
            value={form.referralCode}
            onChange={(e) => setForm({ ...form, referralCode: e.target.value.toLowerCase() })}
          />
          <input
            className="wallet-auth-input"
            placeholder="Referrer Code (optional)"
            value={form.referrerCode}
            onChange={(e) => setForm({ ...form, referrerCode: e.target.value.toLowerCase() })}
          />
          {error && <p className="text-wallet-danger">{error}</p>}
          <button className="wallet-button-primary w-full">Create Account</button>
        </form>
        <p className="mt-3 text-sm text-wallet-text">Already have an account? <Link to="/login" className="wallet-auth-link">Login</Link></p>
      </div>

      {createdAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-wallet-bg/80 px-4 backdrop-blur-sm">
          <div className="wallet-auth-card w-full max-w-md p-6 shadow-[0_0_32px_rgba(0,212,255,0.16)]">
            <h2 className="text-xl font-semibold text-wallet-accent">Account Created Successfully</h2>
            <div className="mt-4 space-y-2 rounded-xl border border-wallet-border/40 bg-wallet-panel/60 p-4 text-sm text-wallet-text">
              <p><span className="text-wallet-muted">User ID:</span> {createdAccount.userId}</p>
              <p><span className="text-wallet-muted">Username:</span> {createdAccount.username}</p>
              <p><span className="text-wallet-muted">Name:</span> {createdAccount.name}</p>
              <p><span className="text-wallet-muted">Email:</span> {createdAccount.email}</p>
              <p><span className="text-wallet-muted">Referral Code:</span> {createdAccount.referralCode}</p>
            </div>
            <p className="mt-4 text-sm text-wallet-text">
              Please take a screenshot and save your account details.
            </p>
            {copySuccess && <p className="mt-2 text-xs text-wallet-success">Details copied to clipboard.</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyDetails}
                className="wallet-button-secondary rounded-xl px-4 py-2 text-sm font-medium"
              >
                Copy Details
              </button>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-wallet-border/40 bg-wallet-bg/70 px-4 py-2 text-sm font-medium text-wallet-text hover:border-wallet-accentAlt"
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
