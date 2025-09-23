// src/pages/Expenses.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabaseClient";

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  approved_by?: string;
  status?: string;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Fetch expenses with pagination and filters
  const fetchExpenses = async (opts?: { page?: number; limit?: number; status?: string; start?: string; end?: string }) => {
    setLoading(true);
    setTableMissing(false);
    setFetchError(null);
    const p = opts?.page ?? page;
    const l = opts?.limit ?? limit;

    let query: any = supabase.from("expenses").select("*");
    const status = opts?.status ?? statusFilter;
    const start = opts?.start ?? startDate;
    const end = opts?.end ?? endDate;

    if (status && status !== "all") query = query.eq("status", status);
    if (start) query = query.gte("date", start);
    if (end) query = query.lte("date", end);

    query = query.order("date", { ascending: false }).range((p - 1) * l, p * l - 1);

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch expenses:", error.message || error);
      const msg = (error as any)?.message || "";
      setFetchError(msg || "Failed to fetch expenses");
      if (/relation \"expenses\" does not exist/i.test(msg)) {
        setTableMissing(true);
      }
    } else {
      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        description: r.description,
        amount: typeof r.amount === "string" ? Number(r.amount) : r.amount,
        date: r.date ? new Date(r.date).toISOString().split("T")[0] : r.date,
        approved_by: r.approved_by,
        status: r.status,
      })) as Expense[];
      setExpenses(mapped);
    }
    setLoading(false);
  };

  // Insert expense
  const addExpense = async () => {
    if (!description || !amount || !date) {
      alert("Please fill all fields.");
      return;
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert([
        {
          description,
          amount: Number(amount),
          date,
          approved_by: "Pending",
          status: "Pending",
        },
      ])
      .select("*");

    if (error) {
      console.error("Error inserting expense:", error.message || error);
      alert("Failed to save expense: " + error.message);
    } else {
      alert("Expense logged successfully ✅");
      console.log("Expense saved:", data);

      setDescription("");
      setAmount(0);
      setDate("");
      setShowModal(false);

      await fetchExpenses({ page: 1 });
    }
  };

  // Update status (Approve/Reject)
  const updateExpenseStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("expenses")
      .update({
        status,
        approved_by: status === "Approved" ? "Admin" : null,
      })
      .eq("id", id);

    if (error) {
      console.error("Failed to update expense status:", error);
      alert("Failed to update expense: " + error.message);
    } else {
      await fetchExpenses();
    }
  };

  // Export to CSV
  const exportCSV = () => {
    if (!expenses || expenses.length === 0) {
      alert("No expenses to export");
      return;
    }
    const headers = ["Date", "Description", "Approved By", "Status", "Amount"];
    const rows = expenses.map((e) => [
      e.date,
      e.description || "",
      e.approved_by || "",
      e.status || "",
      String(e.amount),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_page_${page}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setIsAdmin(sessionStorage.getItem("adminValidated") === "1");
    fetchExpenses();

    // Realtime updates
    const channel = supabase.channel("public:expenses");
    channel.on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, (payload) => {
      console.log("expenses change", payload);
      fetchExpenses();
    });
    channel.subscribe();

    return () => {
      try {
        channel.unsubscribe();
      } catch (err) {
        console.warn("unsubscribe error", err);
      }
    };
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Expenses</h2>
      <p className="text-sm text-gray-600 mb-4">Track and manage all group expenditures.</p>

      {/* Log Expense Button */}
      <button onClick={() => setShowModal(true)} className="bg-blue-500 text-white px-4 py-2 rounded shadow">
        + Log Expense
      </button>

      {/* Expense History */}
      <div className="mt-6 bg-white shadow rounded p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">Expense History</h3>
          <div className="flex items-center space-x-2">
            <select
              className="border p-1 rounded text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
                fetchExpenses({ status: e.target.value, page: 1 });
              }}
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <input type="date" className="border p-1 rounded text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="border p-1 rounded text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button className="px-2 py-1 border rounded text-sm" onClick={() => fetchExpenses({ page: 1, status: statusFilter, start: startDate, end: endDate })}>
              Apply
            </button>
            <button
              className="px-2 py-1 border rounded text-sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setStatusFilter("all");
                setPage(1);
                fetchExpenses({ page: 1, status: "all" });
              }}
            >
              Clear
            </button>
            <button className="px-2 py-1 bg-gray-50 border rounded text-sm" onClick={() => exportCSV()}>
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : tableMissing ? (
          <div className="text-sm text-gray-700">
            <p className="mb-3">The <code>expenses</code> table does not exist in your database.</p>
            <div className="bg-gray-50 p-3 rounded mb-3 font-mono text-xs">
              <pre>
{`create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  date date not null,
  approved_by text,
  status text default 'Pending',
  created_at timestamptz default now()
);`}
              </pre>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() =>
                  navigator.clipboard.writeText(`create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  date date not null,
  approved_by text,
  status text default 'Pending',
  created_at timestamptz default now()
);`)
                }
                className="px-3 py-2 bg-white border rounded text-sm"
              >
                Copy SQL
              </button>
              <button onClick={() => fetchExpenses()} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">
                Retry
              </button>
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <p className="text-gray-500">No expenses recorded yet.</p>
        ) : (
          <table className="w-full border">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 border">Date</th>
                <th className="p-2 border">Description</th>
                <th className="p-2 border">Approved By</th>
                <th className="p-2 border">Status</th>
                <th className="p-2 border">Amount</th>
                {isAdmin && <th className="p-2 border">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id} className={exp.status === "Rejected" ? "bg-red-50" : ""}>
                  <td className="p-2 border">{exp.date}</td>
                  <td className="p-2 border">{exp.description}</td>
                  <td className="p-2 border">{exp.approved_by || "N/A"}</td>
                  <td className="p-2 border">{exp.status || "Pending"}</td>
                  <td className="p-2 border">KSh {exp.amount}</td>
                  {isAdmin && (
                    <td className="p-2 border">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => updateExpenseStatus(exp.id, "Approved")} className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                          Approve
                        </button>
                        <button onClick={() => updateExpenseStatus(exp.id, "Rejected")} className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                          Reject
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-gray-600">Page {page}</div>
        <div className="space-x-2">
          <button
            onClick={() => {
              if (page > 1) {
                setPage(page - 1);
                fetchExpenses({ page: page - 1 });
              }
            }}
            className="px-2 py-1 border rounded"
          >
            Prev
          </button>
          <button
            onClick={() => {
              setPage(page + 1);
              fetchExpenses({ page: page + 1 });
            }}
            className="px-2 py-1 border rounded"
          >
            Next
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg w-96 p-6">
            <h3 className="font-bold mb-4">Log New Expense</h3>

            <label className="block text-sm mb-2">Expense Description</label>
            <textarea
              className="border w-full p-2 rounded mb-3"
              placeholder="e.g., Catering services"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <label className="block text-sm mb-2">Amount</label>
            <input
              type="number"
              className="border w-full p-2 rounded mb-3"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />

            <label className="block text-sm mb-2">Date of Expense</label>
            <input
              type="date"
              className="border w-full p-2 rounded mb-3"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowModal(false)} className="px-3 py-2 border rounded">
                Cancel
              </button>
              <button onClick={addExpense} className="px-3 py-2 bg-blue-500 text-white rounded">
                Log Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
