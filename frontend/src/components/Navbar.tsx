import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <div className="mb-4 flex gap-3 text-sm">
      <Link to="/">Dashboard</Link>
      <Link to="/trading">Trading</Link>
      <Link to="/transactions">Transactions</Link>
    </div>
  );
};

export default Navbar;

