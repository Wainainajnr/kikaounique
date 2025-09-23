import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabaseClient";
import jsPDF from "jspdf";
import "jspdf-autotable"; // augments jsPDF with autoTable
import Papa from "papaparse";

interface Member {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
}

interface Contribution {
  id: string;
  month: number;
  year: number;
  paid: boolean;
  members: Member;
  amount: number;
  paid_on?: string;
  member_id?: string;
  // optional type persisted in DB when available ('contribution' | 'food')
  type?: string;
}

interface Project {
  id: string;
  name: string;
}

// (no mock fallbacks — load data from Supabase and use realtime updates)

export default function Contributions() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  // allow 'all' so users can see contributions across all years
  const [yearFilter, setYearFilter] = useState<string | number>("all");
  const [loading, setLoading] = useState(false);
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [newContribution, setNewContribution] = useState({
    // contribution type ('contribution' or 'food')
    type: 'contribution',
    // from/to month/year (inclusive)
    fromMonth: new Date().getMonth() + 1,
    fromYear: new Date().getFullYear(),
    toMonth: new Date().getMonth() + 1,
    toYear: new Date().getFullYear(),
    amount: 2000,
    member_id: ""
  });
  const [newMember, setNewMember] = useState({
    full_name: "",
    email: "",
    phone: ""
  });
  const [csvData, setCsvData] = useState<string>("");
  const [processingBulk, setProcessingBulk] = useState(false);

  const handleSupabaseError = (error: any, context: string) => {
    console.error(`${context} error:`, error);
    alert(`Failed to ${context}. Please try again.`);
  };

  // session-scoped admin validation: set a flag in sessionStorage so the user
  // doesn't need to re-enter a password repeatedly within the session.
  useEffect(() => {
    const validated = sessionStorage.getItem("adminValidated") === "1";
    setIsAuthenticated(validated);
  }, []);

  const authenticate = (entered?: string | React.MouseEvent) => {
    // Accept either a password string or an event from an onClick handler.
    // If an event is passed (when used as onClick), fall back to the
    // password state; otherwise use the passed string.
    const pass = typeof entered === 'string' ? entered : password;
    if (pass === "Admin@123") {
      setIsAuthenticated(true);
      sessionStorage.setItem("adminValidated", "1");
      setPassword("");
    } else {
      alert("Incorrect password");
    }
  };

  // Extracted fetchData so other handlers can call it after inserts/upserts
  const fetchData = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        setContributions([]);
        setMembers([]);
        setProjects([]);
        return { contributions: [], members: [], projects: [] };
      }

      // Fetch contributions
      const { data: contributionsData, error: contributionsError } = await supabase
        .from("contributions")
        // select related member fields — members table uses `name` (not `full_name`)
        .select("*, members(name, email, phone)");

      if (contributionsError) {
        handleSupabaseError(contributionsError, "fetch contributions");
      }

      const mappedContributions = (contributionsData || []).map((d: any) => {
        const monthRaw = d.contribution_month ?? d.paid_on ?? null;
        // default to current month/year
        let month = new Date().getMonth() + 1;
        let year = new Date().getFullYear();

        if (monthRaw) {
          // Prefer parsing ISO YYYY-MM-DD or YYYY-MM strings directly to avoid
          // timezone shifts when creating a Date object (which can move the day
          // across timezones and affect the derived year/month).
          if (typeof monthRaw === 'string' && /^\d{4}-\d{2}/.test(monthRaw)) {
            const parts = monthRaw.split('-');
            if (parts.length >= 2) {
              year = Number(parts[0]) || year;
              month = Number(parts[1]) || month;
            }
          } else {
            // Fallback: try Date parsing for other formats or Date objects
            const parsed = new Date(monthRaw as any);
            if (!isNaN(parsed.getTime())) {
              month = parsed.getMonth() + 1;
              year = parsed.getFullYear();
            } else if (typeof monthRaw === 'string' && monthRaw.includes('-')) {
              // final fallback: split
              const parts = monthRaw.split('-');
              if (parts.length >= 2) {
                year = Number(parts[0]) || year;
                month = Number(parts[1]) || month;
              }
            } else {
              console.debug('Unrecognized contribution_month format:', monthRaw);
            }
          }
        }

        return {
          id: d.id,
          month,
          year,
          paid: !!d.paid_on,
          // normalize member shape -> UI expects `members.full_name`
          members: d.members ? { id: d.members.id || d.member_id, full_name: d.members.name ?? d.members.full_name ?? '', email: d.members.email ?? null, phone: d.members.phone ?? null } : { full_name: '', id: d.member_id },
          amount: d.amount || 0,
          paid_on: d.paid_on,
          type: d.type ?? undefined,
          member_id: d.member_id
        } as Contribution;
      });

      setContributions(mappedContributions);
  console.debug(`fetchData: loaded ${mappedContributions.length} contributions`);

      // Fetch members and map DB shape (name) -> UI shape (full_name)
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("*")
        .order("name");

      let mappedMembers: Member[] = [];
      if (membersError) {
        handleSupabaseError(membersError, "fetch members");
      } else {
        mappedMembers = (membersData || []).map((m: any) => ({
          id: m.id,
          full_name: m.name ?? m.full_name ?? '',
          email: m.email ?? null,
          phone: m.phone ?? undefined
        } as Member));

        // Deduplicate members by id (in case of duplicates from mixed name fields)
        const byId: Record<string, Member> = {};
        for (const mm of mappedMembers) {
          if (mm && mm.id) byId[mm.id] = mm;
        }
        mappedMembers = Object.values(byId);
        setMembers(mappedMembers);
      }

      // Fetch projects (some schemas may call this 'projects' or use 'title')
      // Try the common 'projects' table first, then fall back to 'csr_projects'
      try {
        const { data: projectsData, error: projectsError } = await (supabase as any)
          .from("projects")
          .select("*")
          .order("name");

        if (projectsError) {
          console.warn('projects fetch error (projects):', projectsError);
          throw projectsError;
        }

        const mappedProjects = (projectsData || []).map((p: any) => ({
          id: p.id,
          name: p.name ?? p.title ?? ''
        } as Project));
        setProjects(mappedProjects);
        return { contributions: mappedContributions, members: mappedMembers, projects: mappedProjects };
      } catch (projErr) {
        // Attempt a fallback table name commonly used for CSR projects
        console.warn('Falling back to csr_projects table due to:', projErr);
        try {
          const { data: csrData, error: csrError } = await (supabase as any)
            .from('csr_projects')
            .select('*')
            // csr_projects uses `title` in the DB schema
            .order('title');

          if (csrError) {
            console.error('csr_projects fetch error:', csrError);
            handleSupabaseError(csrError, 'fetch projects');
            setProjects([]);
            return { contributions: mappedContributions, members: mappedMembers, projects: [] };
          } else {
            const mapped = (csrData || []).map((p: any) => ({ id: p.id, name: p.title ?? p.name ?? '' } as Project));
            setProjects(mapped);
            return { contributions: mappedContributions, members: mappedMembers, projects: mapped };
          }
        } catch (finalErr) {
          console.error('Unexpected error when fetching csr_projects:', finalErr);
          handleSupabaseError(finalErr as any, 'fetch projects');
          setProjects([]);
          return { contributions: mappedContributions, members: mappedMembers, projects: [] };
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setContributions([]);
      setMembers([]);
      setProjects([]);
      return { contributions: [], members: [], projects: [] };
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set up realtime subscriptions for contributions, members, and projects
    if (supabase) {
      const channel = supabase.channel('public:contributions_members_projects');

      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, (payload) => {
        console.log('contributions change', payload);
        // simple re-fetch for now — cheap and reliable
        fetchData();
      });

      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (payload) => {
        console.log('members change', payload);
        fetchData();
      });

      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => {
        console.log('projects change', payload);
        fetchData();
      });

      channel.subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, []);

  const handleAddContribution = async () => {
    if (!(newContribution as any).member_id) {
      alert("Please select a member");
      return;
    }

    if ((newContribution as any).amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    // compute month range from fromYear/fromMonth to toYear/toMonth (inclusive)
    const start = new Date((newContribution as any).fromYear, (newContribution as any).fromMonth - 1, 1);
    const end = new Date((newContribution as any).toYear, (newContribution as any).toMonth - 1, 1);
    if (start > end) {
      alert('Invalid date range: From must be before or equal to To');
      return;
    }

    // build list of months in range
    const months: { year: number; month: number }[] = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    // optimistic UI: add all months as temp entries
    const tempIds = months.map(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
    const optimisticEntries: Contribution[] = months.map((m, i) => ({
      id: tempIds[i],
      month: m.month,
      year: m.year,
      paid: true,
      members: members.find(mem => mem.id === (newContribution as any).member_id) || { id: (newContribution as any).member_id || tempIds[i], full_name: 'Unknown' },
      amount: (newContribution as any).amount,
      paid_on: new Date().toISOString(),
      member_id: (newContribution as any).member_id,
      type: (newContribution as any).type
    } as Contribution));

    setContributions(prev => [...optimisticEntries, ...prev]);
    setShowAddContribution(false);

    try {
      // prepare inserts for each month
      const inserts = months.map(m => ({
        member_id: (newContribution as any).member_id,
        amount: (newContribution as any).amount,
        contribution_month: `${m.year}-${String(m.month).padStart(2,'0')}-01`,
        paid_on: new Date().toISOString()
        // include type if present (DB may ignore/throw if column not present)
        , ...( (newContribution as any).type ? { type: (newContribution as any).type } : {} )
      }));

      const { data: insertedRows, error } = await (supabase as any)
        .from('contributions')
        .upsert(inserts, { onConflict: ['member_id', 'contribution_month'] })
        .select();

      if (error) {
        // rollback optimistic
        setContributions(prev => prev.filter(c => !tempIds.includes(c.id)));
        console.error('add contribution(s) error:', error);
        alert('Failed to add contribution(s): ' + (error.message || JSON.stringify(error)));
      } else {
        // After upsert succeeds, re-fetch authoritative data and replace UI state
        const server = await fetchData();
        if (server && Array.isArray(server.contributions)) {
          setContributions(server.contributions as Contribution[]);
        }

        // Diagnostic: check whether the newly inserted months for this member exist in server data
        try {
          const memberId = (newContribution as any).member_id;
          const found = server?.contributions?.some((r: any) => months.some(m => r.member_id === memberId && r.year === m.year && r.month === m.month));
          console.debug('addContribution: server contains added months?', found, 'member:', memberId, 'months:', months);

          // If server has them but filtered view hides them, inform the user
          if (found) {
            const visible = server.contributions.some((r: any) => {
              const matchesName = (r.members?.full_name || '').toLowerCase().includes(search.toLowerCase());
              const matchesStatus = statusFilter === 'all' || (statusFilter === 'paid' ? !!r.paid_on : !r.paid_on);
              const matchesMonth = monthFilter === 'all' || r.month === Number(monthFilter);
              const matchesYear = yearFilter === 'all' || r.year === Number(yearFilter);
              return matchesName && matchesStatus && matchesMonth && matchesYear && r.member_id === memberId;
            });
            if (!visible) {
              alert('Contributions were added but are currently hidden by your filters. Clear filters or adjust month/year to see them.');
            }
          } else {
            console.warn('addContribution: server does not contain the newly added months yet.');
          }
        } catch (err) {
          console.error('Diagnostic check failed:', err);
        }

        // reset form to defaults
        setNewContribution({ type: 'contribution', fromMonth: new Date().getMonth() + 1, fromYear: new Date().getFullYear(), toMonth: new Date().getMonth() + 1, toYear: new Date().getFullYear(), amount: 5000, member_id: '' });
      }
    } catch (err) {
      // rollback optimistic
      setContributions(prev => prev.filter(c => !tempIds.includes(c.id)));
      console.error('Error adding contributions:', err);
      alert('Failed to add contributions');
    }
  };

  const handleAddMember = async () => {
    if (!newMember.full_name) {
      alert("Please enter a name for the member");
      return;
    }

    // optimistic add member: insert into UI immediately
    const tempId = `temp-m-${Date.now()}`;
    const optimisticMember: Member = { id: tempId, full_name: newMember.full_name, email: newMember.email || null, phone: newMember.phone || null };
    setMembers(prev => [...prev, optimisticMember]);
    setShowAddMember(false);

    try {
      const payload = { name: newMember.full_name, email: newMember.email || null, phone: newMember.phone || null };
      const { data, error } = await (supabase as any)
        .from('members')
        .insert([payload])
        .select()
        .single();

      if (error) {
        // rollback optimistic
        setMembers(prev => prev.filter(m => m.id !== tempId));
        handleSupabaseError(error, 'add member');
      } else if (data) {
        // replace optimistic with DB row
        setMembers(prev => prev.map(m => m.id === tempId ? { id: data.id, full_name: data.name ?? '', email: data.email ?? null, phone: data.phone ?? null } : m));
        setNewMember({ full_name: '', email: '', phone: '' });
      }
    } catch (err) {
      setMembers(prev => prev.filter(m => m.id !== tempId));
      console.error('Error adding member:', err);
      alert('Failed to add member');
    }
  };

  const handleBulkUpload = async () => {
    if (!csvData) {
      alert("Please paste CSV data");
      return;
    }

    setProcessingBulk(true);
    try {
      // Parse CSV data
      const parsedData = Papa.parse(csvData, { header: true });
      
      if (parsedData.errors && parsedData.errors.length > 0) {
        alert("CSV format is invalid. Please check your data.");
        return;
      }

      const contributionsToAdd = [];
      
      for (const row of parsedData.data) {
        if (!row.member_name || !row.month || !row.year || !row.amount) {
          console.warn("Skipping row with missing data:", row);
          continue;
        }

        // Find or create member
        let memberId = null;
        const existingMember = members.find(m => 
          m.full_name.toLowerCase() === row.member_name.toLowerCase()
        );

        if (existingMember) {
          memberId = existingMember.id;
        } else {
          // Create new member
          const { data: newMember, error } = await (supabase as any)
            .from("members")
            .insert([{ name: row.member_name }])
            .select()
            .single();

          if (error) {
            console.error("Error creating member:", error);
            continue;
          }

          memberId = newMember.id;
          // map returned DB row to UI Member shape
          setMembers(prev => [...prev, { id: newMember.id, full_name: newMember.name ?? '', email: newMember.email ?? null, phone: newMember.phone ?? null } as Member]);
        }

        // Add contribution
        contributionsToAdd.push({
          member_id: memberId,
          amount: parseFloat(row.amount),
          contribution_month: `${row.year}-${String(row.month).padStart(2, '0')}-01`,
          paid_on: new Date().toISOString()
          // default to 'contribution' type if csv has no type column
          , ...( row.type ? { type: row.type } : {} )
        });
      }

      // Batch insert contributions
      if (contributionsToAdd.length > 0) {
        const { data: upserted, error } = await (supabase as any)
          .from("contributions")
          .upsert(contributionsToAdd, { onConflict: ['member_id', 'contribution_month'] })
          .select();

        if (error) {
          console.error('bulk upload contributions error:', error);
          alert('Failed to add contributions: ' + (error.message || JSON.stringify(error)));
        } else {
          console.log('Bulk upsert result:', upserted);
          // refresh data from server and replace UI state with authoritative rows
          const server = await fetchData();
          if (server && Array.isArray(server.contributions)) {
            setContributions(server.contributions as Contribution[]);
          }
          alert(`Successfully added/updated ${Array.isArray(upserted) ? upserted.length : contributionsToAdd.length} contributions!`);
          setCsvData("");
          setShowBulkUpload(false);
        }
      }
    } catch (error) {
      console.error("Error processing bulk upload:", error);
      alert("Failed to process bulk upload");
    } finally {
      setProcessingBulk(false);
    }
  };

  const filtered = contributions.filter((c) => {
    const matchesName = c.members?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
                         (statusFilter === "paid" ? c.paid : !c.paid);
    const matchesMonth = monthFilter === "all" || c.month === Number(monthFilter);
    const matchesYear = yearFilter === "all" || c.year === Number(yearFilter);
    
    return matchesName && matchesStatus && matchesMonth && matchesYear;
  });

  const calculateFine = (contribution: Contribution) => {
    if (contribution.paid) return 0;
    
    const contributionDate = new Date(contribution.year, contribution.month - 1, 1);
    const today = new Date();
    
    // Only calculate fine for current or past months
    if (today < contributionDate) return 0;
    
    // Calculate days late (assuming due by 10th of the month)
    const dueDate = new Date(contribution.year, contribution.month - 1, 10);
    const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    return daysLate * 200; // 200 KSh per day
  };

  const exportCSV = async () => {
    try {
      const csvData = filtered.map(c => ({
        Name: c.members?.full_name || "Unknown",
        Month: c.month,
        Year: c.year,
        "Amount (KSh)": c.amount,
        Paid: c.paid ? "Yes" : "No",
        Fine: calculateFine(c),
      }));

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `contributions-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('CSV export functionality is not available. Please install papaparse or check the console for details.');
    }
  };

  const exportPDF = async () => {
    try {
      const doc = new jsPDF();

      // Add title
      doc.setFontSize(16);
      doc.text("Member Contributions Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

      // Use autoTable provided by the static import of 'jspdf-autotable'
      if ((doc as any).autoTable) {
        (doc as any).autoTable({
          startY: 30,
          head: [["Name", "Month", "Year", "Amount (KSh)", "Paid", "Fine (KSh)"]],
          body: filtered.map(c => [
            c.members?.full_name || "Unknown",
            c.month,
            c.year,
            c.amount.toLocaleString(),
            c.paid ? "Yes" : "No",
            calculateFine(c).toLocaleString()
          ]),
          theme: 'grid',
          headStyles: {
            fillColor: [66, 139, 202],
            textColor: 255,
            fontStyle: 'bold'
          },
        });
      } else {
        // If for some reason autoTable is not present, fall back to simple text
        let y = 30;
        const rowHeight = 7;
        doc.setFontSize(10);
        doc.text('Name | Month | Year | Amount (KSh) | Paid | Fine (KSh)', 14, y);
        y += rowHeight;
        filtered.forEach((c) => {
          const line = `${c.members?.full_name || 'Unknown'} | ${c.month} | ${c.year} | ${c.amount?.toLocaleString() || '0'} | ${c.paid ? 'Yes' : 'No'} | ${calculateFine(c).toLocaleString()}`;
          doc.text(line, 14, y);
          y += rowHeight;
          if (y > 280) { doc.addPage(); y = 20; }
        });
      }
    
      doc.save(`contributions-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export functionality is not available. Please install jspdf and jspdf-autotable or check the console for details.');
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold">Member Contributions</h1>
        <div className="flex justify-center items-center h-64">
          <p>Loading contributions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Member Contributions</h1>
        
        {!isAuthenticated ? (
          <div className="flex items-center space-x-2">
            <input
              type="password"
              className="border p-2 rounded"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button 
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={authenticate}
            >
              Login
            </button>
          </div>
        ) : (
          <div className="flex space-x-2">
            <button 
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              onClick={() => setShowAddContribution(true)}
            >
              Add Contribution
            </button>
            <button 
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              onClick={() => setShowAddMember(true)}
            >
              Add Member
            </button>
            <button 
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
              onClick={() => setShowBulkUpload(true)}
            >
              Bulk Upload
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input 
          className="border p-2 rounded w-full md:w-auto" 
          placeholder="Search by name" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
        
        <select 
          className="border p-2 rounded" 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
        
        <select 
          className="border p-2 rounded" 
          value={monthFilter} 
          onChange={(e) => setMonthFilter(e.target.value)}
        >
          <option value="all">All Months</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>
              {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
            </option>
          ))}
        </select>
        
        <select 
          className="border p-2 rounded" 
          value={yearFilter} 
          onChange={(e) => {
            const v = e.target.value;
            setYearFilter(v === 'all' ? 'all' : Number(v));
          }}
        >
          <option value="all">All Years</option>
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        
        <button 
          className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-100"
          onClick={exportCSV} 
        >
          Export CSV
        </button>
        
        <button 
          className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-100"
          onClick={exportPDF} 
        >
          Download PDF
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4">
        {/* Group contributions by member so one person with many months is shown once */}
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No contributions found matching your filters.</div>
        ) : (
          <div className="space-y-4">
            {Object.values(filtered.reduce((acc: Record<string, { member: Member; contributions: Contribution[] }>, c) => {
              const memberId = c.member_id || c.members?.id || 'unknown';
              if (!acc[memberId]) {
                acc[memberId] = { member: c.members || { id: memberId, full_name: 'Unknown' }, contributions: [] };
              }
              acc[memberId].contributions.push(c);
              return acc;
            }, {})).map((group) => (
              <div key={group.member.id} className="border rounded p-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">{group.member.full_name}</h3>
                  <div className="text-sm text-gray-600">{group.contributions.length} contribution{group.contributions.length > 1 ? 's' : ''}</div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                  {group.contributions.sort((a, b) => (a.year - b.year) || (a.month - b.month)).map((c) => (
                    <div key={c.id} className="p-2 border rounded bg-gray-50">
                      <div className="text-sm font-mono">{new Date(0, c.month - 1).toLocaleString('default', { month: 'short' })} {c.year}</div>
                      <div className="text-lg font-semibold">KSh {c.amount?.toLocaleString() || '0'}</div>
                      <div className="text-xs mt-1">
                        {c.paid ? <span className="text-green-700">Paid</span> : <span className="text-red-700">Unpaid</span>}
                        {c.type ? <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">{c.type}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {filtered.length > 0 && (
        <div className="text-sm text-gray-600">
          Showing {filtered.length} of {contributions.length} contributions
        </div>
      )}

      {/* Add Contribution Modal */}
      {showAddContribution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Contribution</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Member</label>
                <select
                  className="w-full border p-2 rounded"
                  value={(newContribution as any).member_id}
                  onChange={(e) => setNewContribution({...newContribution, member_id: e.target.value})}
                >
                  <option value="">Select Member</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{member.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Contribution Type</label>
                <select
                  className="w-full border p-2 rounded"
                  value={(newContribution as any).type}
                  onChange={(e) => setNewContribution({...newContribution, type: e.target.value})}
                >
                  <option value="contribution">Contribution</option>
                  <option value="food">Food</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">From (Month)</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={(newContribution as any).fromMonth}
                    onChange={(e) => setNewContribution({...newContribution, fromMonth: parseInt(e.target.value)})}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">From (Year)</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={(newContribution as any).fromYear}
                    onChange={(e) => setNewContribution({...newContribution, fromYear: parseInt(e.target.value)})}
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">To (Month)</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={(newContribution as any).toMonth}
                    onChange={(e) => setNewContribution({...newContribution, toMonth: parseInt(e.target.value)})}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">To (Year)</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={(newContribution as any).toYear}
                    onChange={(e) => setNewContribution({...newContribution, toYear: parseInt(e.target.value)})}
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Amount (KSh)</label>
                <input
                  type="number"
                  className="w-full border p-2 rounded"
                  value={(newContribution as any).amount}
                  onChange={(e) => setNewContribution({...newContribution, amount: parseFloat(e.target.value) || 0})}
                  min="0"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button 
                className="px-4 py-2 border rounded hover:bg-gray-100"
                onClick={() => setShowAddContribution(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                onClick={handleAddContribution}
              >
                Save Contribution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Member</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  className="w-full border p-2 rounded"
                  value={newMember.full_name}
                  onChange={(e) => setNewMember({...newMember, full_name: e.target.value})}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border p-2 rounded"
                  value={newMember.email}
                  onChange={(e) => setNewMember({...newMember, email: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  className="w-full border p-2 rounded"
                  value={newMember.phone}
                  onChange={(e) => setNewMember({...newMember, phone: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button 
                className="px-4 py-2 border rounded hover:bg-gray-100"
                onClick={() => setShowAddMember(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleAddMember}
              >
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
            <h2 className="text-xl font-bold mb-4">Bulk Upload Contributions</h2>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload CSV data with columns: member_name, month, year, amount
              </p>
              
              <div>
                <label className="block text-sm font-medium mb-1">CSV Data</label>
                <textarea
                  className="w-full border p-2 rounded h-40 font-mono text-sm"
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                  placeholder="member_name,month,year,amount&#10;John Doe,3,2024,5000&#10;Jane Smith,4,2024,5000"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button 
                className="px-4 py-2 border rounded hover:bg-gray-100"
                onClick={() => setShowBulkUpload(false)}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                onClick={handleBulkUpload}
                disabled={processingBulk}
              >
                {processingBulk ? "Processing..." : "Upload Contributions"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}