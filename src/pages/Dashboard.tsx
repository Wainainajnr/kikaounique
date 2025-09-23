import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabaseClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

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
}

const MOCK_MONTHLY_DATA: MonthlyContribution[] = [
  { month: "Jan", collected: 5000 },
  { month: "Feb", collected: 7000 },
  { month: "Mar", collected: 6000 },
  { month: "Apr", collected: 8000 },
  { month: "May", collected: 5500 },
  { month: "Jun", collected: 7500 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>("Member");
  const [members, setMembers] = useState<Member[]>([]);
  const [contributions, setContributions] = useState<any[]>([]);
  const [yearFilter, setYearFilter] = useState<string | number>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyContribution[]>(MOCK_MONTHLY_DATA);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [expensesData, setExpensesData] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      setError(null);
      setLoading(true);

      // Get user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        setError("Failed to fetch user session");
        return;
      }
      
      setUserName(session?.user?.email?.split("@")[0] || "Member");

      // Get members from Supabase
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("*");

      if (membersError) {
        setError("Failed to load members");
        console.error("Supabase error:", membersError);
        return;
      }

      if (membersData) {
        // Map database columns (snake_case) to interface properties (camelCase)
        const membersWithDefaults = membersData.map((m: any) => ({
          id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email,
          contributionPaid: m.contribution_paid || false,
          fines: m.fines || 0,
          overdueDays: m.overdue_days || 0,
        })) as Member[];
        setMembers(membersWithDefaults);
      }

      // Fetch contributions and map contribution_month -> month/year avoiding timezone drift
      try {
        const { data: contributionsData, error: contributionsError } = await supabase
          .from('contributions')
          .select('*, members(name, email, phone)');

        if (contributionsError) {
          console.warn('Failed to fetch contributions', contributionsError);
        } else if (contributionsData) {
          // map contributions to normalized shape
          const mapped = (contributionsData || []).map((d: any) => {
            const monthRaw = d.contribution_month ?? d.paid_on ?? null;
            let month = new Date().getMonth() + 1;
            let year = new Date().getFullYear();

            if (monthRaw) {
              if (typeof monthRaw === 'string' && /^\d{4}-\d{2}/.test(monthRaw)) {
                const parts = monthRaw.split('-');
                if (parts.length >= 2) {
                  year = Number(parts[0]) || year;
                  month = Number(parts[1]) || month;
                }
              } else {
                const parsed = new Date(monthRaw as any);
                if (!isNaN(parsed.getTime())) {
                  month = parsed.getMonth() + 1;
                  year = parsed.getFullYear();
                }
              }
            }

            return {
              id: d.id,
              amount: d.amount || 0,
              month,
              year,
              paid: !!d.paid_on,
              member_id: d.member_id,
              members: d.members ? { id: d.members.id || d.member_id, full_name: d.members.name ?? d.members.full_name ?? '' } : { id: d.member_id, full_name: '' },
            };
          });

          setContributions(mapped);

          // Fetch expenses and compute totals
          try {
            const { data: expData, error: expError } = await supabase.from('expenses').select('*');
            if (expError) {
              console.warn('Failed to fetch expenses', expError);
              setExpensesData([]);
              setTotalExpenses(0);
            } else {
              const mappedExp = (expData || []).map((r: any) => ({
                ...r,
                amount: typeof r.amount === 'string' ? Number(r.amount) : r.amount,
                date: r.date ? new Date(r.date).toISOString().split('T')[0] : r.date,
              }));
              setExpensesData(mappedExp);
              const totalExp = mappedExp.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
              setTotalExpenses(totalExp);

              // build monthly expenses map for yearFilter
              const expMonthly = Array.from({ length: 12 }, () => 0);
              for (const e of mappedExp) {
                const d = e.date ? new Date(e.date) : null;
                if (!d || isNaN(d.getTime())) continue;
                const m = d.getMonth();
                const y = d.getFullYear();
                if (yearFilter === 'all' || y === Number(yearFilter)) {
                  if (m >= 0 && m < 12) expMonthly[m] += Number(e.amount || 0);
                }
              }

              // compute monthly aggregation (contributions minus expenses)
              const months = Array.from({ length: 12 }, (_, i) => ({ month: new Date(0, i).toLocaleString('default', { month: 'short' }), collected: 0 }));
              for (const c of mapped) {
                if (yearFilter === 'all' || c.year === Number(yearFilter)) {
                  const idx = c.month - 1;
                  if (idx >= 0 && idx < 12) months[idx].collected += Number(c.amount || 0);
                }
              }
              // subtract expenses per month
              for (let i = 0; i < 12; i++) months[i].collected = Math.max(0, months[i].collected - (expMonthly[i] || 0));
              setMonthlyData(months);
            }
          } catch (err) {
            console.error('Error fetching expenses:', err);
          }
        }
      } catch (err) {
        console.error('Error fetching contributions:', err);
      }

    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // subscribe to expenses changes so dashboard updates live
    const channel = supabase.channel('public:expenses');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
      fetchData();
    });
    channel.subscribe();

    return () => {
      try { channel.unsubscribe(); } catch (err) { console.warn('unsubscribe error', err); }
    };
  }, []);

  const totalContributions = members.filter((m) => m.contributionPaid).length * 2000;
  const totalExpected = members.length * 2000;
  const completionPercentage = totalExpected > 0 ? (totalContributions / totalExpected) * 100 : 0;

  const totalContributionsAmount = contributions.reduce((s, c) => s + Number(c.amount || 0), 0);
  const netContributions = totalContributionsAmount - (totalExpenses || 0);

  // Recompute monthly data and totals when contributions or yearFilter change
  useEffect(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({ month: new Date(0, i).toLocaleString('default', { month: 'short' }), collected: 0 }));
    let collectedTotal = 0;
    for (const c of contributions) {
      if (yearFilter === 'all' || c.year === Number(yearFilter)) {
        const idx = c.month - 1;
        if (idx >= 0 && idx < 12) months[idx].collected += Number(c.amount || 0);
        collectedTotal += Number(c.amount || 0);
      }
    }
    setMonthlyData(months);
    // update completionPercentage related values via members for now (keep existing UI behavior)
  }, [contributions, yearFilter]);

  return (
    <div className="min-h-screen bg-green-50 p-6 md:p-10">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-600">An overview of your group's financial health.</p>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={fetchData} className="px-3 py-2 bg-white border rounded text-sm">Refresh</button>
          <button className="px-3 py-2 bg-white border rounded text-sm">Export CSV</button>
          <button className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Download Statement</button>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Total Contributions</div>
          <div className="mt-2 text-xl font-semibold">KES {contributions.reduce((s, c) => s + Number(c.amount || 0), 0).toLocaleString()}</div>
          <div className="text-xs text-gray-400">Total amount paid by members</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Total Expenses</div>
          <div className="mt-2 text-xl font-semibold">KES {Number(totalExpenses || 0).toLocaleString()}</div>
          <div className="text-xs text-gray-400">Total group expenditure</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Net Contributions</div>
          <div className="mt-2 text-xl font-semibold">KES {Number(netContributions || 0).toLocaleString()}</div>
          <div className="text-xs text-gray-400">Total contributions minus expenses</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">Active Members</div>
          <div className="mt-2 text-xl font-semibold">+{members.length}</div>
          <div className="text-xs text-gray-400">All registered group members</div>
        </div>
      </div>

      {/* AI summary */}
      <div className="bg-white p-4 rounded shadow mb-6">
        <div className="flex items-start">
          <div className="p-2 bg-blue-50 rounded mr-3">⚡</div>
          <div>
            <div className="text-sm font-semibold text-gray-700">AI-Powered Summary</div>
            <p className="text-sm text-gray-600 mt-1">A quick analysis of the group's financial state.</p>
            <p className="text-xs text-gray-500 mt-2">The chama is currently operating with no expenses or fines, indicating efficient financial management. A significant highlight is the complete absence of any expenses or fines incurred by the group.</p>
          </div>
        </div>
      </div>

      {/* Main content: chart + member list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-4">Monthly Contributions</h3>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <Tooltip formatter={(value) => [`KSh ${value.toLocaleString()}`, "Collected"]} />
                <Bar dataKey="collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded shadow p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Member Contributions</h3>
            <div className="text-sm text-gray-500">Status for {new Date().toLocaleString('default', { month: 'long' })}</div>
          </div>

          <div className="space-y-3">
            {members.slice(0, 10).map((m) => {
              // determine status for current month
              const now = new Date();
              const currMonth = now.getMonth() + 1;
              const currYear = now.getFullYear();
              const contrib = contributions.find(c => c.member_id === m.id && c.month === currMonth && c.year === currYear);
              const status = contrib ? (contrib.paid ? 'Paid' : 'Pending') : 'Pending';
              const fines = contributions.filter(c => c.member_id === m.id && !c.paid).reduce((s, c) => s + 0, 0);
              return (
                <div key={m.id} className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs">{(m.name || '').split(' ').map(p=>p[0]).slice(0,2).join('')}</div>
                    <div>
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.email || ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-sm text-gray-600">KES {fines.toLocaleString()}</div>
                    <div>
                      {status === 'Paid' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Paid</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Pending</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}