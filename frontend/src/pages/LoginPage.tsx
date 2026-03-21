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
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-start px-4 pt-14 pb-6 sm:px-6 sm:pt-16 sm:pb-8 md:justify-center md:pt-0 md:pb-0">
      <div className="relative flex w-full items-center justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -z-10 h-20 w-44 rounded-full bg-gradient-to-r from-cyan-400/25 via-sky-400/20 to-violet-400/20 blur-2xl sm:h-24 sm:w-52"
        />
        <CryptivaLogo variant="auth" className="relative mx-auto mb-4 sm:mb-5 drop-shadow-lg" />
      </div>
      <div className="w-full rounded-2xl border border-cyan-800/40 bg-slate-900/80 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-cyan-400/80">Cryptiva</p>
        <h1 className="mb-4 mt-2 text-2xl font-semibold">Sign In</h1>
        <form className="space-y-3" onSubmit={submit}>
          <input
            className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-red-400">{error}</p>}
          <button className="w-full rounded-xl bg-cyan-500 p-3 font-semibold text-slate-950">Sign In</button>
        </form>
        <p className="mt-3 text-sm">No account? <Link to="/register" className="text-cyan-300">Register</Link></p>
      </div>
    </div>
  );
};

export default LoginPage;
