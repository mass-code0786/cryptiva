import { useEffect, useState } from "react";

type IncomeCardProps = {
  title: string;
  amount: number;
  tone: "cyan" | "violet" | "blue";
  icon: "total" | "trading" | "direct" | "level" | "salary";
};

const toneClasses: Record<IncomeCardProps["tone"], string> = {
  cyan: "border-wallet-accent/25 from-wallet-accent/16 via-wallet-accentSoft/8 to-[#0a1b34]",
  violet: "border-[#3e6f9c]/35 from-[#173b63] via-[#143052] to-[#0a1b34]",
  blue: "border-[#63baf8]/22 from-[#123b63] via-[#16355b] to-[#0a1b34]",
};

const iconToneClasses: Record<IncomeCardProps["tone"], string> = {
  cyan: "border-wallet-accent/25 bg-wallet-accent/12 text-wallet-accentSoft",
  violet: "border-[#4e84b3]/30 bg-[#173b63]/70 text-[#9dd8ff]",
  blue: "border-[#63baf8]/25 bg-[#123b63]/70 text-[#b4e1ff]",
};

const iconPathMap: Record<IncomeCardProps["icon"], JSX.Element> = {
  total: <path d="M12 3v18m-4-14h8a3 3 0 1 1 0 6H10a3 3 0 1 0 0 6h8" strokeLinecap="round" strokeLinejoin="round" />,
  trading: <path d="M4 16l4-5 3 3 5-6M18 8h-4M18 8v4" strokeLinecap="round" strokeLinejoin="round" />,
  direct: <path d="M8 8a3 3 0 1 0 0-.001M16 10a2.5 2.5 0 1 0 0-.001M4 19c0-2.5 2.5-4 5-4m4 0c2.5 0 5 1.5 5 4" strokeLinecap="round" strokeLinejoin="round" />,
  level: <path d="M12 4v4m0 4v4m0 4v0M8 10H4m16 0h-4M8 18H4m16 0h-4m-8-8h8m-8 8h8" strokeLinecap="round" strokeLinejoin="round" />,
  salary: <path d="M4 8h16v10H4zM8 8V6h8v2M10 13h4" strokeLinecap="round" strokeLinejoin="round" />,
};

const IncomeCard = ({ title, amount, tone, icon }: IncomeCardProps) => {
  const [displayAmount, setDisplayAmount] = useState(0);

  useEffect(() => {
    let rafId = 0;
    let start = 0;
    const duration = 900;
    const from = displayAmount;
    const to = amount;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayAmount(from + (to - from) * eased);
      if (progress < 1) rafId = window.requestAnimationFrame(animate);
    };

    rafId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(rafId);
  }, [amount]);

  return (
    <div
      className={`relative overflow-hidden rounded-[22px] border bg-gradient-to-br p-4 shadow-[0_18px_44px_rgba(2,12,28,0.28)] transition-transform duration-300 hover:-translate-y-0.5 ${toneClasses[tone]}`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-white/8 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-wallet-muted">{title}</p>
          <p className="mt-2 text-2xl font-bold text-wallet-text sm:text-3xl">${displayAmount.toFixed(2)}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-2xl border ${iconToneClasses[tone]}`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <g stroke="currentColor" strokeWidth="1.8">
              {iconPathMap[icon]}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default IncomeCard;
