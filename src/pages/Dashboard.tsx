import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabaseClient";

interface Member {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  contributionPaid: boolean;
  fines: number;
  overdueDays: number;
}

interface MonthlyContribution {
  month: string;
  collected: number;
  expenses: number;
  net: number;
}

interface Contribution {
  id: string;
  amount: number;
  month: number;
  year: number;
  paid: boolean;
  member_id: string;
  members: { id: string; full_name: string };
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  member_id?: string | null;
  project_id?: string | null;
  member_name?: string;
  project_title?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>("Member");
  const [members, setMembers] = useState<Member[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [expensesData, setExpensesData] = useState<Expense[]>([]);
  const [yearFilter, setYearFilter] = useState<string | number>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyContribution[]>([]);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);

  // --- Calculate monthly collected - expenses
  const calculateMonthlyData = (
    contributions: Contribution[],
    expenses: Expense[],
    yearFilter: string | number
  ) => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(0, i).toLocaleString("default", { month: "short" }),
      collected: 0,
      expenses: 0,
      net: 0,
    }));

    contributions.forEach((c) => {
      if (yearFilter === "all" || c.year === Number(yearFilter)) {
        const idx = c.month - 1;
        if (idx >= 0 && idx < 12) months[idx].collected += Number(c.amount || 0);
      }
    });

    expenses.forEach((e) => {
      if (!e.date) return;
      const expenseDate = new Date(e.date);
      if (isNaN(expenseDate.getTime())) return;

      const expenseMonth = expenseDate.getMonth();
      const expenseYear = expenseDate.getFullYear();

      if (yearFilter === "all" || expenseYear === Number(yearFilter)) {
        if (expenseMonth >= 0 && expenseMonth < 12) months[expenseMonth].expenses += Number(e.amount || 0);
      }
    });

    months.forEach((m) => (m.net = Math.max(0, m.collected - m.expenses)));
    return months;
  };

  // --- Fetch data
  const fetchData = async () => {
    try {
      setError(null);
      setLoading(true);

      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      setUserName(session?.user?.email?.split("@")[0] || "Member");

      // --- Fetch contributions first
      const { data: contributionsData, error: contributionsError } = await supabase
        .from("contributions")
        .select("*, members(name, email, phone)");

      if (contributionsError) {
        console.warn("Failed to fetch contributions", contributionsError);
        setContributions([]);
      } else {
        const mappedContributions = (contributionsData || []).map((d: any) => {
          let month = new Date().getMonth() + 1;
          let year = new Date().getFullYear();
          const monthRaw = d.contribution_month ?? d.paid_on ?? null;

          if (monthRaw) {
            const parsed = new Date(monthRaw);
            if (!isNaN(parsed.getTime())) {
              month = parsed.getMonth() + 1;
              year = parsed.getFullYear();
            }
          }

          return {
            id: d.id,
            amount: d.amount || 0,
            month,
            year,
            paid: !!d.paid_on,
            member_id: d.member_id,
            members: d.members ? { id: d.members.id || d.member_id, full_name: d.members.name || "" } : { id: d.member_id, full_name: "" },
          };
        });

        setContributions(mappedContributions);

        // --- Fetch members corresponding to contributions
        const memberIds = Array.from(new Set(
          mappedContributions
            .map(c => c.member_id)
            .filter((id): id is string => !!id)
        ));

        let membersData: any[] = [];
        if (memberIds.length > 0) {
          const { data, error } = await supabase
            .from("members")
            .select("*");
            // Optionally: .in("id", memberIds) if RLS allows
          if (error) {
            console.error("Failed to fetch members", error);
          } else {
            membersData = data || [];
          }
        }

        const activeMembers = membersData.filter((m: any) => m.is_active !== false);
        setMembers(activeMembers.map((m: any) => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email,
          contributionPaid: m.contribution_paid || false,
          fines: m.fines || 0,
          overdueDays: m.overdue_days || 0,
        })));
      }

      // --- Fetch expenses
      const { data: expData, error: expError } = await supabase
        .from("expenses")
        .select("*, members(name), csr_projects(title)");

      if (expError) {
        console.warn("Failed to fetch expenses", expError);
        setExpensesData([]);
        setTotalExpenses(0);
      } else {
        const mappedExpenses = (expData || []).map((r: any) => ({
          id: r.id,
          description: r.description,
          amount: typeof r.amount === "string" ? Number(r.amount) : r.amount,
          date: r.date ? new Date(r.date).toISOString().split("T")[0] : r.date,
          member_id: r.member_id,
          project_id: r.project_id,
          member_name: r.members?.name || "N/A",
          project_title: r.csr_projects?.title || "N/A",
        }));

        setExpensesData(mappedExpenses);
        const totalExp = mappedExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
        setTotalExpenses(totalExp);
        setMonthlyData(calculateMonthlyData(contributions, mappedExpenses, yearFilter));
      }

    } catch (err) {
      console.error("Unexpected error:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (contributions.length || expensesData.length) {
      setMonthlyData(calculateMonthlyData(contributions, expensesData, yearFilter));
    }
  }, [yearFilter, contributions, expensesData]);

  const totalContributionsAmount = contributions.reduce((s, c) => s + Number(c.amount || 0), 0);
  const netContributions = totalContributionsAmount - totalExpenses;

  return (
    <div className="min-h-screen bg-green-50 p-6 md:p-10">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Total Contributions</div>
          <div className="mt-2 text-xl font-semibold">KES {totalContributionsAmount.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Total Expenses</div>
          <div className="mt-2 text-xl font-semibold">KES {totalExpenses.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Net Contributions</div>
          <div className="mt-2 text-xl font-semibold">KES {netContributions.toLocaleString()}</div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Active Members</div>
          <div className="mt-2 text-xl font-semibold">{members.length}</div>
        </div>
      </div>

      {/* Member Contributions */}
      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Member Contributions</h3>
        <div className="space-y-3">
          {members.map((m) => {
            const now = new Date();
            const currMonth = now.getMonth() + 1;
            const currYear = now.getFullYear();
            const contrib = contributions.find(c => c.member_id === m.id && c.month === currMonth && c.year === currYear);
            const status = contrib ? (contrib.paid ? "Paid" : "Pending") : "Pending";

            return (
              <div key={m.id} className="flex items-center justify-between border-b pb-3">
                <div>{m.name}</div>
                <div>
                  {status === "Paid" ? (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">Paid</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800">Pending</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
