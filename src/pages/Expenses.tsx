// src/pages/Expenses.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabaseClient";

interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  member_id?: string | null;
  project_id?: string | null;
  approved_by?: string | null;
  status?: string | null;
  member_name?: string;
  project_title?: string;
}

interface Member {
  id: string;
  name: string;
}

interface Project {
  id: string;
  title: string;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState("");
  const [memberId, setMemberId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  
  // Dropdown data
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const refreshSchemaCache = async () => {
    try {
      await supabase.from('expenses').select('id').limit(1);
      console.log("Schema cache refreshed");
    } catch (error) {
      console.error("Error refreshing schema cache:", error);
    }
  };

  const fetchDropdownData = async () => {
    try {
      const { data: membersData } = await supabase
        .from("members")
        .select("id, name")
        .order("name");
      
      const { data: projectsData } = await supabase
        .from("csr_projects")
        .select("id, title")
        .order("title");

      setMembers(membersData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error("Error fetching dropdown data:", error);
    }
  };

  const testExpensesTable = async () => {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, description, amount, date, member_id, project_id, status, approved_by')
        .limit(1);

      if (error) {
        console.error('Table structure error:', error);
        setTableMissing(true);
        return false;
      }
      
      setTableMissing(false);
      return true;
    } catch (error) {
      console.error('Table test error:', error);
      setTableMissing(true);
      return false;
    }
  };

  const fetchExpenses = async (opts?: { page?: number; limit?: number; status?: string; start?: string; end?: string }) => {
    setLoading(true);
    setTableMissing(false);
    setFetchError(null);
    const p = opts?.page ?? page;
    const l = opts?.limit ?? limit;

    let query = supabase
      .from("expenses")
      .select(`
        *,
        members (name),
        csr_projects (title)
      `);

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
      const msg = error.message || "";
      setFetchError(msg || "Failed to fetch expenses");
      if (/relation \"expenses\" does not exist/i.test(msg) || /column.*does not exist/i.test(msg)) {
        setTableMissing(true);
      }
    } else {
      const mapped = (data || []).map((r: any) => ({
        id: r.id,
        description: r.description,
        amount: typeof r.amount === "string" ? Number(r.amount) : r.amount,
        date: r.date ? new Date(r.date).toISOString().split("T")[0] : r.date,
        member_id: r.member_id,
        project_id: r.project_id,
        member_name: r.members?.name || "N/A",
        project_title: r.csr_projects?.title || "N/A",
        approved_by: r.approved_by,
        status: r.status,
      }));
      setExpenses(mapped);
    }
    setLoading(false);
  };

  const addExpense = async () => {
    if (!description || !amount || !date) {
      alert("Please fill all required fields.");
      return;
    }

    await refreshSchemaCache();

    const expenseData = {
      description: description.trim(),
      amount: Number(amount),
      date,
      member_id: memberId || null,
      project_id: projectId || null,
      status: "Pending"
    };

    console.log("Submitting expense:", expenseData);

    const { data, error } = await supabase
      .from("expenses")
      .insert([expenseData])
      .select("*");

    if (error) {
      console.error("Error inserting expense:", error);
      alert("Failed to save expense: " + error.message);
      
      if (error.message.includes("relation") && error.message.includes("does not exist") || 
          error.message.includes("column") && error.message.includes("does not exist")) {
        setTableMissing(true);
      }
    } else {
      alert("Expense logged successfully ✅");
      console.log("Expense saved:", data);

      setDescription("");
      setAmount(0);
      setDate("");
      setMemberId("");
      setProjectId("");
      setShowModal(false);

      await fetchExpenses({ page: 1 });
    }
  };

  // FIXED: Update expense status function
  const updateExpenseStatus = async (id: string, status: string) => {
    if (!isAdmin) {
      alert("Only admins can update expense status");
      return;
    }

    try {
      console.log(`Updating expense ${id} to status: ${status}`);
      
      const updateData = { 
        status: status,
        approved_by: status === "Approved" ? "Admin" : null
      };

      // First verify the expense exists
      const { data: existingExpense, error: checkError } = await supabase
        .from("expenses")
        .select("id")
        .eq("id", id)
        .single();

      if (checkError || !existingExpense) {
        console.error("Expense not found:", id);
        alert("Expense not found - it may have been deleted");
        
        // Refresh the list to remove the missing expense
        setTimeout(() => {
          fetchExpenses();
        }, 500);
        return;
      }

      // If expense exists, proceed with update
      const { data, error } = await supabase
        .from("expenses")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        alert("Failed to update expense: " + error.message);
        return;
      }

      if (data) {
        console.log("Update successful, returned data:", data);
        alert(`Expense ${status.toLowerCase()} successfully!`);
        
        // Update local state immediately for better UX
        setExpenses(prevExpenses => 
          prevExpenses.map(expense => 
            expense.id === id 
              ? { 
                  ...expense, 
                  status: data.status,
                  approved_by: data.approved_by
                }
              : expense
          )
        );
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      alert("An unexpected error occurred");
    }
  };

  const exportCSV = () => {
    if (!expenses || expenses.length === 0) {
      alert("No expenses to export");
      return;
    }
    const headers = ["Date", "Description", "Member", "Project", "Approved By", "Status", "Amount"];
    const rows = expenses.map((e: any) => [
      e.date,
      e.description || "",
      e.member_name || "N/A",
      e.project_title || "N/A",
      e.approved_by || "",
      e.status || "",
      String(e.amount),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const getStatusBadgeStyle = (status: string | null | undefined) => {
    const statusText = status || "Pending";
    switch (statusText) {
      case "Approved":
        return "bg-green-100 text-green-800 border-green-200";
      case "Rejected":
        return "bg-red-100 text-red-800 border-red-200";
      case "Pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRowStyle = (status: string | null | undefined) => {
    const statusText = status || "Pending";
    switch (statusText) {
      case "Approved":
        return "bg-green-50 hover:bg-green-100";
      case "Rejected":
        return "bg-red-50 hover:bg-red-100";
      case "Pending":
        return "bg-yellow-50 hover:bg-yellow-100";
      default:
        return "hover:bg-gray-50";
    }
  };

  const applyFilters = () => {
    setPage(1);
    fetchExpenses({ 
      page: 1, 
      status: statusFilter, 
      start: startDate, 
      end: endDate 
    });
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setStatusFilter("all");
    setPage(1);
    fetchExpenses({ page: 1, status: "all" });
  };

  useEffect(() => {
    const initialize = async () => {
      setIsAdmin(sessionStorage.getItem("adminValidated") === "1");
      
      await refreshSchemaCache();
      await fetchDropdownData();
      
      const tableExists = await testExpensesTable();
      if (tableExists) {
        await fetchExpenses();
      } else {
        setLoading(false);
      }

      if (tableExists) {
        const channel = supabase.channel("expenses-changes")
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'expenses',
            },
            () => {
              console.log("New expense added, refreshing...");
              fetchExpenses();
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'expenses',
            },
            () => {
              console.log("Expense deleted, refreshing...");
              fetchExpenses();
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'expenses',
            },
            () => {
              console.log("Expense updated, refreshing...");
              fetchExpenses();
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    };

    initialize();
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Expenses</h2>
      <p className="text-sm text-gray-600 mb-6">Track and manage all group expenditures.</p>

      <button 
        onClick={() => setShowModal(true)} 
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md transition duration-200"
      >
        + Log Expense
      </button>

      <div className="mt-6 bg-white shadow-lg rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg text-gray-800">Expense History</h3>
          {!tableMissing && (
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <select
                className="border border-gray-300 p-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
              <input 
                type="date" 
                className="border border-gray-300 p-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
              />
              <input 
                type="date" 
                className="border border-gray-300 p-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
              />
              <button 
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition duration-200"
                onClick={applyFilters}
              >
                Apply
              </button>
              <button
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition duration-200"
                onClick={clearFilters}
              >
                Clear
              </button>
              <button 
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition duration-200" 
                onClick={exportCSV}
              >
                Export CSV
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading expenses...</span>
          </div>
        ) : tableMissing ? (
          <div className="text-sm text-gray-700 p-4 bg-yellow-50 rounded-lg">
            <p className="mb-3">The <code className="bg-yellow-100 px-1 rounded">expenses</code> table does not exist in your database or is missing required columns.</p>
            <div className="bg-gray-50 p-3 rounded mb-3 font-mono text-xs">
              <pre>
{`-- Run this SQL in your Supabase SQL editor:
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric not null,
  date date not null,
  member_id uuid references members(id) on delete set null,
  project_id uuid references csr_projects(id) on delete set null,
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
  member_id uuid references members(id) on delete set null,
  project_id uuid references csr_projects(id) on delete set null,
  approved_by text,
  status text default 'Pending',
  created_at timestamptz default now()
);`)
                }
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition duration-200"
              >
                Copy SQL
              </button>
              <button 
                onClick={async () => {
                  await refreshSchemaCache();
                  setTableMissing(false);
                  setLoading(true);
                  fetchExpenses();
                }} 
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition duration-200"
              >
                Retry After Creating Table
              </button>
            </div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No expenses recorded yet.</p>
            <button 
              onClick={() => setShowModal(true)} 
              className="mt-2 text-blue-600 hover:text-blue-800"
            >
              Log your first expense
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Date</th>
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Description</th>
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Member</th>
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Project</th>
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Approved By</th>
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Status</th>
                    <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Amount</th>
                    {isAdmin && <th className="p-3 border border-gray-300 text-left font-semibold text-gray-700">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr 
                      key={exp.id} 
                      className={`${getRowStyle(exp.status)} transition duration-200`}
                    >
                      <td className="p-3 border border-gray-300 font-medium">{exp.date}</td>
                      <td className="p-3 border border-gray-300">{exp.description}</td>
                      <td className="p-3 border border-gray-300">{exp.member_name || "N/A"}</td>
                      <td className="p-3 border border-gray-300">{exp.project_title || "N/A"}</td>
                      <td className="p-3 border border-gray-300">{exp.approved_by || "N/A"}</td>
                      <td className="p-3 border border-gray-300">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadgeStyle(exp.status)}`}>
                          {exp.status || "Pending"}
                        </span>
                      </td>
                      <td className="p-3 border border-gray-300 font-semibold">KSh {exp.amount.toLocaleString()}</td>
                      {isAdmin && (
                        <td className="p-3 border border-gray-300">
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => updateExpenseStatus(exp.id, "Approved")} 
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={exp.status === "Approved"}
                            >
                              {exp.status === "Approved" ? "Approved" : "Approve"}
                            </button>
                            <button 
                              onClick={() => updateExpenseStatus(exp.id, "Rejected")} 
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={exp.status === "Rejected"}
                            >
                              {exp.status === "Rejected" ? "Rejected" : "Reject"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                Showing page {page} of expenses
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => {
                    if (page > 1) {
                      const newPage = page - 1;
                      setPage(newPage);
                      fetchExpenses({ page: newPage });
                    }
                  }}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => {
                    const newPage = page + 1;
                    setPage(newPage);
                    fetchExpenses({ page: newPage });
                  }}
                  disabled={expenses.length < limit}
                  className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="font-bold text-lg mb-4 text-gray-800">Log New Expense</h3>

              <label className="block text-sm mb-2 font-medium text-gray-700">Expense Description *</label>
              <textarea
                className="border border-gray-300 w-full p-2 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Catering services"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />

              <label className="block text-sm mb-2 font-medium text-gray-700">Amount *</label>
              <input
                type="number"
                className="border border-gray-300 w-full p-2 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="0"
                step="0.01"
              />

              <label className="block text-sm mb-2 font-medium text-gray-700">Date of Expense *</label>
              <input
                type="date"
                className="border border-gray-300 w-full p-2 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              <label className="block text-sm mb-2 font-medium text-gray-700">Member (Optional)</label>
              <select
                className="border border-gray-300 w-full p-2 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
              >
                <option value="">Select Member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>

              <label className="block text-sm mb-2 font-medium text-gray-700">Project (Optional)</label>
              <select
                className="border border-gray-300 w-full p-2 rounded-lg mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>

              <div className="flex justify-end space-x-3">
                <button 
                  onClick={() => setShowModal(false)} 
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition duration-200"
                >
                  Cancel
                </button>
                <button 
                  onClick={addExpense} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
                >
                  Log Expense
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}