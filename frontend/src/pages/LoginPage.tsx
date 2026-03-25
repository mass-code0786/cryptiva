import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import CryptivaLogo from "../components/CryptivaLogo";
import { useAuth } from "../hooks/useAuth";
import { isAdminUser } from "../utils/isAdminUser";

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const user = await login(username, password);
      if (isAdminUser(user)) {
        navigate("/admin/dashboard", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.data?.message) {
          setError(String(error.response.data.message));
          return;
        }
        if (error.request) {
          setError("Unable to reach login API. Check API URL and backend CORS CLIENT_URL.");
          return;
        }
      }
      setError("Login failed");
    }
  };

  return (
    <div className="wallet-auth-shell mx-auto flex w-full max-w-md flex-col items-center justify-start px-4 pb-6 pt-14 sm:px-6 sm:pb-8 sm:pt-16 md:justify-center md:pt-0 md:pb-0">
      <div className="relative flex w-full items-center justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -z-10 h-20 w-44 rounded-full bg-gradient-to-r from-wallet-accent/25 via-wallet-accentAlt/20 to-wallet-accent/10 blur-2xl sm:h-24 sm:w-52"
        />
        <CryptivaLogo variant="auth" className="relative mx-auto mb-4 sm:mb-5 drop-shadow-lg" />
      </div>
      <div className="wallet-auth-card w-full p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-wallet-accentAlt/80">Cryptiva</p>
        <h1 className="mb-4 mt-2 text-2xl font-semibold text-wallet-text">Sign In</h1>
        <form className="space-y-3" onSubmit={submit}>
          <input
            className="wallet-auth-input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input className="wallet-auth-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-wallet-danger">{error}</p>}
          <button className="wallet-button-primary w-full">Sign In</button>
        </form>
        <p className="mt-3 text-sm text-wallet-text">No account? <Link to="/register" className="wallet-auth-link">Register</Link></p>
      </div>
    </div>
  );
};

export default LoginPage;
