import { useEffect, useState } from "react";

type IncomeCardProps = {
  title: string;
  amount: number;
  tone: "cyan" | "violet" | "blue";
  icon: "total" | "trading" | "direct" | "level" | "salary";
};

const toneClasses: Record<IncomeCardProps["tone"], string> = {
  cyan: "from-cyan-500/20 via-cyan-400/10 to-slate-900 border-cyan-400/40 shadow-cyan-500/20",
  violet: "from-violet-500/20 via-violet-400/10 to-slate-900 border-violet-400/40 shadow-violet-500/20",
  blue: "from-blue-500/20 via-blue-400/10 to-slate-900 border-blue-400/40 shadow-blue-500/20",
};

const iconToneClasses: Record<IncomeCardProps["tone"], string> = {
  cyan: "border-cyan-300/50 bg-cyan-400/20 text-cyan-100 shadow-cyan-400/40",
  violet: "border-violet-300/50 bg-violet-400/20 text-violet-100 shadow-violet-400/40",
  blue: "border-blue-300/50 bg-blue-400/20 text-blue-100 shadow-blue-400/40",
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
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-xl transition-transform duration-300 hover:-translate-y-0.5 ${toneClasses[tone]}`}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-300/90">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-100 sm:text-3xl">${displayAmount.toFixed(2)}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl border shadow-lg shadow-inner animate-pulse ${iconToneClasses[tone]}`}>
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
