import { FormEvent, useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { bindWalletAddress, fetchMyProfile, fetchWalletBinding, updateMyProfile, updateMyReferralCode } from "../services/userService";

const ProfilePage = () => {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [walletAddress, setWalletAddress] = useState(user?.walletAddress || "");
  const [network, setNetwork] = useState("BEP20");
  const [message, setMessage] = useState("");
  const [referralMessage, setReferralMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [newReferralCode, setNewReferralCode] = useState((user?.referralCode || "").toLowerCase());
  const referralIdentifier = user?.referralCode || user?.userId;
  const referralLink = referralIdentifier
    ? `https://cryptiva-frontend.onrender.com/register?ref=${encodeURIComponent(referralIdentifier)}`
    : "";
  const encodedLink = encodeURIComponent(referralLink);

  useEffect(() => {
    fetchMyProfile()
      .then((res) => {
        const me = res.data.user;
        setName(me?.name || "");
        setWalletAddress(me?.walletAddress || "");
        setNewReferralCode((me?.referralCode || "").toLowerCase());
        refreshUser({
          id: me?._id || user?.id || "",
          userId: me?.userId,
          username: me?.username || user?.username,
          name: me?.name || "",
          email: me?.email || "",
          role: me?.role || user?.role,
          isAdmin: me?.isAdmin ?? user?.isAdmin,
          referralCode: me?.referralCode,
          referralCodeChangeCount: me?.referralCodeChangeCount,
          canChangeReferralCode: me?.canChangeReferralCode,
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
        username: me?.username || user?.username,
        name: me?.name || "",
        email: me?.email || "",
        role: me?.role || user?.role,
        isAdmin: me?.isAdmin ?? user?.isAdmin,
        referralCode: me?.referralCode,
        referralCodeChangeCount: me?.referralCodeChangeCount,
        canChangeReferralCode: me?.canChangeReferralCode,
        walletAddress: me?.walletAddress,
      });
      setMessage("Profile updated");
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Profile update failed");
    }
  };

  const onCopyReferralLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopyMessage("Referral link copied");
      window.setTimeout(() => setCopyMessage(""), 2200);
    } catch {
      setCopyMessage("Unable to copy referral link");
      window.setTimeout(() => setCopyMessage(""), 2200);
    }
  };

  const onUpdateReferralCode = async (event: FormEvent) => {
    event.preventDefault();
    setReferralMessage("");
    try {
      const { data } = await updateMyReferralCode({ referralCode: newReferralCode.trim().toLowerCase() });
      const me = data.user;
      refreshUser({
        id: me?._id || user?.id || "",
        userId: me?.userId,
        username: me?.username || user?.username,
        name: me?.name || user?.name || "",
        email: me?.email || user?.email || "",
        role: me?.role || user?.role,
        isAdmin: me?.isAdmin ?? user?.isAdmin,
        referralCode: me?.referralCode,
        referralCodeChangeCount: me?.referralCodeChangeCount,
        canChangeReferralCode: me?.canChangeReferralCode,
        walletAddress: me?.walletAddress || user?.walletAddress,
      });
      setNewReferralCode((me?.referralCode || "").toLowerCase());
      setReferralMessage(data?.message || "Referral code updated");
    } catch (error: any) {
      setReferralMessage(error?.response?.data?.message || "Unable to update referral code");
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
          <form className="mt-3 space-y-2" onSubmit={onUpdateReferralCode}>
            <input
              value={newReferralCode}
              onChange={(e) => setNewReferralCode(e.target.value.toLowerCase())}
              disabled={user?.canChangeReferralCode === false}
              className="w-full rounded-xl border border-cyan-800/40 bg-slate-950 p-3 outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Change referral code (one time)"
            />
            <button
              type="submit"
              disabled={user?.canChangeReferralCode === false}
              className="w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Update Referral Code
            </button>
            {user?.canChangeReferralCode === false && (
              <p className="text-xs text-amber-300">Referral code change already used.</p>
            )}
            {referralMessage && <p className="text-xs text-cyan-300">{referralMessage}</p>}
          </form>
          <p className="mt-2 text-slate-400">Referral Link</p>
          <p className="break-all font-medium">{referralLink || "-"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!referralLink}
              onClick={onCopyReferralLink}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
            >
              Copy Link
            </button>
            <a
              href={`https://wa.me/?text=Join%20Cryptiva%20using%20my%20referral%20link:%20${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-600"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-600"
            >
              Facebook
            </a>
            <a
              href={`https://t.me/share/url?url=${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-600"
            >
              Telegram
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=Join%20Cryptiva%20&url=${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 hover:border-cyan-600"
            >
              Twitter
            </a>
          </div>
          {copyMessage && <p className="mt-2 text-xs text-cyan-300">{copyMessage}</p>}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
