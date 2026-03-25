import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import { useAuth } from "../hooks/useAuth";
import { bindWalletAddress, changeMyPassword, fetchMyProfile, fetchWalletBinding, updateMyProfile, updateMyReferralCode } from "../services/userService";

const ProfilePage = () => {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const showForcePasswordNotice =
    Boolean((location.state as { forcePasswordChange?: boolean } | null)?.forcePasswordChange) ||
    Boolean(user?.forcePasswordChange);
  const [name, setName] = useState(user?.name || "");
  const [walletAddress, setWalletAddress] = useState(user?.walletAddress || "");
  const [network, setNetwork] = useState("BEP20");
  const [message, setMessage] = useState("");
  const [referralMessage, setReferralMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [newReferralCode, setNewReferralCode] = useState((user?.referralCode || "").toLowerCase());
  const referralIdentifier = user?.referralCode || user?.userId;
  const referralLink = referralIdentifier
    ? `https://cryptiva.world/register?ref=${encodeURIComponent(referralIdentifier)}`
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
          forcePasswordChange: me?.forcePasswordChange,
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
        forcePasswordChange: me?.forcePasswordChange,
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
        forcePasswordChange: me?.forcePasswordChange,
      });
      setNewReferralCode((me?.referralCode || "").toLowerCase());
      setReferralMessage(data?.message || "Referral code updated");
    } catch (error: any) {
      setReferralMessage(error?.response?.data?.message || "Unable to update referral code");
    }
  };

  const isStrongPassword = (value: string) =>
    value.length >= 8 &&
    value.length <= 128 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value) &&
    !/\s/.test(value);

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordMessage("");

    if (!currentPassword || !newPassword) {
      setPasswordMessage("Current password and new password are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Confirm password does not match new password");
      return;
    }

    if (!isStrongPassword(newPassword)) {
      setPasswordMessage("New password must be 8+ chars with uppercase, lowercase, number, and special character");
      return;
    }

    setPasswordBusy(true);
    try {
      const { data } = await changeMyPassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage(data?.message || "Password updated successfully");
      if (user) {
        refreshUser({
          ...user,
          forcePasswordChange: false,
        });
      }
    } catch (error: any) {
      setPasswordMessage(error?.response?.data?.message || "Password update failed");
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {showForcePasswordNotice && (
          <div className="rounded-2xl border border-wallet-warning/30 bg-wallet-warning/10 p-3 text-sm text-wallet-warning">
            Your password was reset by admin. Please set a new password now.
          </div>
        )}
        <div className="wallet-panel p-4">
          <h2 className="wallet-title text-xl">Profile Settings</h2>
          <p className="mt-1 text-sm text-wallet-muted">Bind your USDT BEP20 wallet address before deposit/withdraw.</p>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="wallet-input"
              placeholder="Full Name"
            />
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="wallet-input"
              placeholder="USDT BEP20 Wallet Address"
            />
            <input
              value={network}
              readOnly
              className="wallet-input text-wallet-muted"
            />
            <button className="wallet-button-primary w-full">
              Save Changes
            </button>
          </form>
          {message && <p className="mt-3 text-sm text-wallet-accent">{message}</p>}
        </div>
        <div className="wallet-panel p-4 text-sm">
          <p className="text-wallet-muted">User ID</p>
          <p className="font-medium">{user?.userId || "-"}</p>
          <p className="mt-2 text-wallet-muted">Email</p>
          <p className="font-medium">{user?.email || "-"}</p>
          <p className="mt-2 text-wallet-muted">Referral Code</p>
          <p className="font-medium">{user?.referralCode || "-"}</p>
          <form className="mt-3 space-y-2" onSubmit={onUpdateReferralCode}>
            <input
              value={newReferralCode}
              onChange={(e) => setNewReferralCode(e.target.value.toLowerCase())}
              disabled={user?.canChangeReferralCode === false}
              className="wallet-input disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Change referral code (one time)"
            />
            <button
              type="submit"
              disabled={user?.canChangeReferralCode === false}
              className="wallet-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              Update Referral Code
            </button>
            {user?.canChangeReferralCode === false && (
              <p className="text-xs text-wallet-warning">Referral code change already used.</p>
            )}
            {referralMessage && <p className="text-xs text-wallet-accent">{referralMessage}</p>}
          </form>
          <p className="mt-2 text-wallet-muted">Referral Link</p>
          <p className="break-all font-medium">{referralLink || "-"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!referralLink}
              onClick={onCopyReferralLink}
              className="wallet-button-secondary rounded-lg px-3 py-2 text-xs disabled:opacity-50"
            >
              Copy Link
            </button>
            <a
              href={`https://wa.me/?text=Join%20Cryptiva%20using%20my%20referral%20link:%20${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-wallet-border/50 bg-wallet-bg/70 px-3 py-2 text-xs text-wallet-text hover:border-wallet-accent"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-wallet-border/50 bg-wallet-bg/70 px-3 py-2 text-xs text-wallet-text hover:border-wallet-accent"
            >
              Facebook
            </a>
            <a
              href={`https://t.me/share/url?url=${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-wallet-border/50 bg-wallet-bg/70 px-3 py-2 text-xs text-wallet-text hover:border-wallet-accent"
            >
              Telegram
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=Join%20Cryptiva%20&url=${encodedLink}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-wallet-border/50 bg-wallet-bg/70 px-3 py-2 text-xs text-wallet-text hover:border-wallet-accent"
            >
              Twitter
            </a>
          </div>
          {copyMessage && <p className="mt-2 text-xs text-wallet-accent">{copyMessage}</p>}
        </div>
        <div className="wallet-panel p-4">
          <h3 className="wallet-title text-lg">Change Password</h3>
          <p className="mt-1 text-xs text-wallet-muted">Use a strong password with uppercase, lowercase, number, and special character.</p>
          <form className="mt-4 space-y-3" onSubmit={onChangePassword}>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="wallet-input"
              placeholder="Current password"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="wallet-input"
              placeholder="New password"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="wallet-input"
              placeholder="Confirm new password"
            />
            <button
              type="submit"
              disabled={passwordBusy}
              className="wallet-button-primary w-full disabled:cursor-not-allowed disabled:opacity-70"
            >
              {passwordBusy ? "Updating..." : "Update Password"}
            </button>
          </form>
          {passwordMessage && <p className="mt-3 text-sm text-wallet-accent">{passwordMessage}</p>}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
