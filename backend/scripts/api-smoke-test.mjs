import { spawn } from "node:child_process";

const BASE_URL = "http://127.0.0.1:5000";
const API = `${BASE_URL}/api`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomTag = Date.now().toString(36);
const adminEmail = process.env.TEST_ADMIN_EMAIL || "admin@cryptiva.world";
const adminPassword = "AdminPass123";
const adminPin = "1234";

const userAEmail = `usera_${randomTag}@test.local`;
const userBEmail = `userb_${randomTag}@test.local`;
const userPassword = "UserPass123";
const userPin = "1234";

const calls = [];

const callApi = async ({ name, method = "GET", path, token, body, expected = [200] }) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  const ok = expected.includes(response.status);
  calls.push({ name, method, path, status: response.status, ok, data });
  if (!ok) {
    throw new Error(`${name} failed with ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
};

const waitForHealth = async () => {
  for (let i = 0; i < 45; i += 1) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // ignore
    }
    await sleep(500);
  }
  throw new Error("Backend failed to start in time");
};

const registerOrLogin = async ({ name, email, password, pin, referralCode }) => {
  try {
    const data = await callApi({
      name: `register:${email}`,
      method: "POST",
      path: "/auth/register",
      body: { name, email, password, pin, referralCode },
      expected: [201],
    });
    return data;
  } catch {
    return callApi({
      name: `login:${email}`,
      method: "POST",
      path: "/auth/login",
      body: { email, password },
      expected: [200],
    });
  }
};

const run = async () => {
  const server = spawn("node", ["src/server.js"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForHealth();

    const adminAuth = await registerOrLogin({
      name: "Admin",
      email: adminEmail,
      password: adminPassword,
      pin: adminPin,
    });
    const adminToken = adminAuth.token;

    const userAAuth = await registerOrLogin({
      name: "User A",
      email: userAEmail,
      password: userPassword,
      pin: userPin,
    });
    const userAToken = userAAuth.token;
    const userARef = userAAuth.user.referralCode;

    const userBAuth = await registerOrLogin({
      name: "User B",
      email: userBEmail,
      password: userPassword,
      pin: userPin,
      referralCode: userARef,
    });
    const userBToken = userBAuth.token;

    await callApi({ name: "userA:me", path: "/users/me", token: userAToken });
    await callApi({
      name: "userA:update-profile",
      method: "PATCH",
      path: "/users/me",
      token: userAToken,
      body: { name: "User A Updated" },
    });
    await callApi({
      name: "userA:bind-wallet",
      method: "POST",
      path: "/users/wallet-binding",
      token: userAToken,
      body: { walletAddress: "0xA123456789012345678901234567890123456789", network: "BEP20" },
      expected: [201],
    });
    await callApi({ name: "userA:get-wallet-binding", path: "/users/wallet-binding", token: userAToken });

    await callApi({
      name: "userB:bind-wallet",
      method: "POST",
      path: "/users/wallet-binding",
      token: userBToken,
      body: { walletAddress: "0xB123456789012345678901234567890123456789", network: "BEP20" },
      expected: [201],
    });

    const userADeposit = await callApi({
      name: "userA:create-deposit",
      method: "POST",
      path: "/deposit/create",
      token: userAToken,
      body: { amount: 20, currency: "USDT", network: "BEP20" },
      expected: [201],
    });
    await callApi({ name: "userA:deposit-history", path: "/deposit/history", token: userAToken });
    await callApi({
      name: "userA:deposit-status",
      path: `/deposit/status/${userADeposit.deposit._id}`,
      token: userAToken,
    });

    await callApi({ name: "admin:list-deposits", path: "/admin/deposits", token: adminToken });
    await callApi({
      name: "admin:approve-userA-deposit",
      method: "PATCH",
      path: `/admin/deposits/${userADeposit.deposit._id}/approve`,
      token: adminToken,
    });

    const userBDeposit = await callApi({
      name: "userB:create-deposit",
      method: "POST",
      path: "/deposit/create",
      token: userBToken,
      body: { amount: 50, currency: "USDT", network: "BEP20" },
      expected: [201],
    });
    await callApi({
      name: "admin:approve-userB-deposit",
      method: "PATCH",
      path: `/admin/deposits/${userBDeposit.deposit._id}/approve`,
      token: adminToken,
    });

    await callApi({ name: "userA:wallet", path: "/wallet", token: userAToken });
    await callApi({
      name: "userA:transfer-withdraw-to-deposit",
      method: "POST",
      path: "/wallet/transfer",
      token: userAToken,
      body: { amount: 1 },
    });

    const userATrade = await callApi({
      name: "userA:place-trade",
      method: "POST",
      path: "/trade/place",
      token: userAToken,
      body: { amount: 5 },
      expected: [201],
    });
    await callApi({ name: "userA:trade-status", path: "/trade/status", token: userAToken });

    await callApi({
      name: "userA:create-withdrawal",
      method: "POST",
      path: "/withdrawals",
      token: userAToken,
      body: { amount: 1, pin: userPin, currency: "USDT", network: "BEP20" },
      expected: [201],
    });
    const userAWithdrawalHistory = await callApi({
      name: "userA:withdrawal-history",
      path: "/withdrawals/history",
      token: userAToken,
    });

    const latestWithdrawal = userAWithdrawalHistory.items?.[0];
    if (latestWithdrawal?._id) {
      await callApi({
        name: "userA:withdrawal-status",
        path: `/withdrawals/status/${latestWithdrawal._id}`,
        token: userAToken,
      });
      await callApi({ name: "admin:list-withdrawals", path: "/admin/withdrawals", token: adminToken });
      await callApi({
        name: "admin:approve-withdrawal",
        method: "PATCH",
        path: `/admin/withdrawals/${latestWithdrawal._id}/approve`,
        token: adminToken,
      });
    }

    await callApi({
      name: "userA:p2p-send",
      method: "POST",
      path: "/p2p/send",
      token: userAToken,
      body: { receiverEmail: userBEmail, amount: 0.5, note: "smoke" },
    });

    await callApi({ name: "userA:referrals", path: "/referrals", token: userAToken });
    await callApi({ name: "userA:referral-summary", path: "/referrals/summary", token: userAToken });
    await callApi({ name: "userA:referral-tree", path: "/referrals/tree?depth=3", token: userAToken });
    await callApi({ name: "userA:referral-income", path: "/referrals/income", token: userAToken });
    await callApi({ name: "userA:referral-income-history", path: "/referrals/income-history", token: userAToken });

    await callApi({ name: "userA:salary-progress", path: "/salary-progress", token: userAToken });
    await callApi({ name: "userA:salary-history", path: "/salary-progress/history", token: userAToken });
    await callApi({
      name: "admin:distribute-weekly-salary",
      method: "POST",
      path: "/salary-progress/distribute-weekly",
      token: adminToken,
      body: {},
    });

    await callApi({ name: "userA:transactions", path: "/transactions", token: userAToken });
    await callApi({ name: "admin:users", path: "/admin/users", token: adminToken });
    await callApi({ name: "admin:transactions", path: "/admin/transactions", token: adminToken });
    await callApi({ name: "admin:team-business", path: "/admin/team-business", token: adminToken });

    const dashboardChecks = await Promise.all([
      callApi({ name: "dashboard:wallet", path: "/wallet", token: userAToken }),
      callApi({ name: "dashboard:transactions", path: "/transactions", token: userAToken }),
      callApi({ name: "dashboard:salary-progress", path: "/salary-progress", token: userAToken }),
    ]);

    console.log(
      JSON.stringify(
        {
          ok: true,
          totalCalls: calls.length,
          passed: calls.filter((item) => item.ok).length,
          tradeId: userATrade.trade?._id || null,
          dashboardSample: {
            wallet: Boolean(dashboardChecks[0]?.wallet),
            transactionsCount: dashboardChecks[1]?.items?.length || 0,
            currentRank: dashboardChecks[2]?.currentRank || null,
          },
        },
        null,
        2
      )
    );
  } finally {
    server.kill();
    await sleep(250);
    if (serverOutput.trim()) {
      console.log(`SERVER_LOGS:\n${serverOutput}`);
    }
  }
};

run().catch((error) => {
  console.error("SMOKE_TEST_FAILED");
  console.error(error?.stack || String(error));
  console.error(JSON.stringify({ calls }, null, 2));
  process.exit(1);
});
