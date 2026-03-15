import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { bindWalletAddress, fetchMyProfile, fetchWalletBinding, updateMyProfile } from "../services/userService";

const ProfilePage = () => {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [walletAddress, setWalletAddress] = useState(user?.walletAddress || "");
  const [network, setNetwork] = useState("BEP20");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchMyProfile()
      .then((res) => {
        const me = res.data.user;
        setName(me?.name || "");
        setWalletAddress(me?.walletAddress || "");
        refreshUser({
          id: me?._id || user?.id || "",
          userId: me?.userId,
          name: me?.name || "",
          email: me?.email || "",
          referralCode: me?.referralCode,
          walletAddress: me?.walletAddress,
        });
      })
      .catch(() => undefined);

    fetchWalletBinding()
      .then((res) => {
        const binding = res.data?.binding;
        if (binding?.walletAddress) setWalletAddress(binding.walletAddress);
        if (binding?.network) setNetwork(binding.network);
      })
      .catch(() => undefined);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      const { data } = await updateMyProfile({ name });
      if (walletAddress) {
        await bindWalletAddress({ walletAddress, network: "BEP20" });
      }
      const me = data.user;
      refreshUser({
        id: me?._id || user?.id || "",
        userId: me?.userId,
        name: me?.name || "",
        email: me?.email || "",
        referralCode: me?.referralCode,
        walletAddress: me?.walletAddress,
      });
      setMessage("Profile updated");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Profile update failed");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4">
          <h2 className="text-xl font-semibold">Profile Settings</h2>
          <p className="mt-1 text-sm text-slate-400">Bind your USDT BEP20 wallet address before deposit/withdraw.</p>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
              placeholder="Full Name"
            />
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500"
              placeholder="USDT BEP20 Wallet Address"
            />
            <input
              value={network}
              readOnly
              className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 text-slate-400"
            />
            <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
              Save Changes
            </button>
          </form>
          {message && <p className="mt-3 text-sm text-cyan-200">{message}</p>}
        </div>
        <div className="rounded-2xl border border-cyan-800/40 bg-slate-900/70 p-4 text-sm">
          <p className="text-slate-400">User ID</p>
          <p className="font-medium">{user?.userId || "-"}</p>
          <p className="mt-2 text-slate-400">Email</p>
          <p className="font-medium">{user?.email || "-"}</p>
          <p className="mt-2 text-slate-400">Referral Code</p>
          <p className="font-medium">{user?.referralCode || "-"}</p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
