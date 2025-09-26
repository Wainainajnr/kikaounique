import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabaseClient";
import jsPDF from "jspdf";
import "jspdf-autotable";
import Papa from "papaparse";
import { debounce } from "lodash";

interface Member {
  id: string;
  name: string;
  email?: string | null;
  phone: string;
  joined_at?: string | null;
}

interface Contribution {
  id: string;
  month: number;
  year: number;
  paid: boolean;
  members: Member;
  amount: number;
  paid_on?: string;
  member_id?: string | null;
  type?: string | null;
  project_id?: string | null;
}

interface Project {
  id: string;
  name: string;
}

interface NewContribution {
  type: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  amount: number;
  member_id: string;
  project_id?: string | null;
}

export default function Contributions() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState<string | number>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddContribution, setShowAddContribution] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isAddingContribution, setIsAddingContribution] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({});
  const [newContribution, setNewContribution] = useState<NewContribution>({
    type: 'contribution',
    fromMonth: new Date().getMonth() + 1,
    fromYear: new Date().getFullYear(),
    toMonth: new Date().getMonth() + 1,
    toYear: new Date().getFullYear(),
    amount: 2000,
    member_id: "",
    project_id: null
  });
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    phone: ""
  });
  const [csvData, setCsvData] = useState("");
  const [processingBulk, setProcessingBulk] = useState(false);

  const handleSupabaseError = (error: any, context: string): string => {
    const errorMessage = error.message || JSON.stringify(error);
    console.error(`${context} error:`, error);
    return `Failed to ${context}: ${errorMessage}. Please check your connection, schema, or RLS policies.`;
  };

  const debouncedSetSearch = useMemo(() => debounce((value: string) => setSearch(value), 300), []);

  useEffect(() => {
    const validated = sessionStorage.getItem("adminValidated") === "1";
    setIsAuthenticated(validated);
  }, []);

  const authenticate = (entered?: string | React.MouseEvent) => {
    const pass = typeof entered === 'string' ? entered : password;
    if (!pass) {
      setPasswordError("Please enter a password");
      return;
    }
    if (pass === "Admin@123") {
      setIsAuthenticated(true);
      sessionStorage.setItem("adminValidated", "1");
      setPassword("");
      setPasswordError("");
    } else {
      setPasswordError("Incorrect password. Please try again.");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!supabase) {
        setError("Supabase client is not initialized. Please check your configuration.");
        setContributions([]);
        setMembers([]);
        setProjects([]);
        return { contributions: [], members: [], projects: [] };
      }

      // Fetch contributions with member data using join
      const { data: contributionsData, error: contributionsError } = await supabase
        .from("contributions")
        .select(`
          *,
          members (
            name,
            email,
            phone,
            joined_at
          )
        `)
        .order("contribution_month", { ascending: false });

      if (contributionsError) {
        setError(handleSupabaseError(contributionsError, "fetch contributions"));
        setContributions([]);
      } else {
        const mappedContributions = (contributionsData || []).map((d: any) => {
          const monthRaw = d.contribution_month ?? d.paid_on ?? null;
          let month = new Date().getMonth() + 1;
          let year = new Date().getFullYear();

          try {
            if (monthRaw) {
              if (typeof monthRaw === 'string' && /^\d{4}-\d{2}/.test(monthRaw)) {
                const parts = monthRaw.split('-');
                if (parts.length >= 2) {
                  year = Number(parts[0]) || year;
                  month = Number(parts[1]) || month;
                }
              } else {
                const parsed = new Date(monthRaw);
                if (!isNaN(parsed.getTime())) {
                  month = parsed.getMonth() + 1;
                  year = parsed.getFullYear();
                } else if (typeof monthRaw === 'string' && monthRaw.includes('-')) {
                  const parts = monthRaw.split('-');
                  if (parts.length >= 2) {
                    year = Number(parts[0]) || year;
                    month = Number(parts[1]) || month;
                  }
                } else {
                  console.warn('Unrecognized contribution_month format:', monthRaw);
                }
              }
            }
          } catch (e) {
            console.warn('Error parsing contribution_month:', monthRaw, e);
          }

          return {
            id: d.id,
            month,
            year,
            paid: !!d.paid_on,
            members: {
              id: d.member_id,
              name: d.members?.name || 'Unknown',
              email: d.members?.email || null,
              phone: d.members?.phone || '',
              joined_at: d.members?.joined_at || null
            },
            amount: d.amount || 0,
            paid_on: d.paid_on,
            type: d.type || null,
            member_id: d.member_id,
            project_id: d.project_id || null
          } as Contribution;
        });

        setContributions(mappedContributions);
        console.debug(`fetchData: loaded ${mappedContributions.length} contributions`);
      }

      // Fetch members separately for the dropdown
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("*")
        .order("name");

      if (membersError) {
        setError(handleSupabaseError(membersError, "fetch members"));
        setMembers([]);
      } else {
        const mappedMembers = (membersData || []).map((m: any) => ({
          id: m.id,
          name: m.name || '',
          email: m.email || null,
          phone: m.phone || '',
          joined_at: m.joined_at || null
        } as Member));

        const byId: Record<string, Member> = {};
        for (const mm of mappedMembers) {
          if (mm && mm.id) byId[mm.id] = mm;
        }
        setMembers(Object.values(byId));
      }

      // Fetch projects
      try {
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("*")
          .order("name");

        if (projectsError) {
          console.warn('projects fetch error:', projectsError);
          setError(handleSupabaseError(projectsError, "fetch projects"));
          setProjects([]);
        } else {
          const mappedProjects = (projectsData || []).map((p: any) => ({
            id: p.id,
            name: p.name || p.title || ''
          } as Project));
          setProjects(mappedProjects);
        }
      } catch (projErr) {
        console.warn('Falling back to csr_projects table:', projErr);
        try {
          const { data: csrData, error: csrError } = await supabase
            .from('csr_projects')
            .select('*')
            .order('title');

          if (csrError) {
            setError(handleSupabaseError(csrError, "fetch csr_projects"));
            setProjects([]);
          } else {
            const mapped = (csrData || []).map((p: any) => ({ id: p.id, name: p.title || p.name || '' } as Project));
            setProjects(mapped);
          }
        } catch (finalErr) {
          setError(handleSupabaseError(finalErr as any, "fetch csr_projects"));
          setProjects([]);
        }
      }

      return { contributions, members, projects };
    } catch (error) {
      const errorMessage = handleSupabaseError(error, "fetch data");
      setError(errorMessage);
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

    if (supabase) {
      const channel = supabase.channel('public:contributions_members_projects');

      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'contributions' }, () => {
        console.log('contributions change detected');
        fetchData();
      });

      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
        console.log('members change detected');
        fetchData();
      });

      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        console.log('projects change detected');
        fetchData();
      });

      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.warn('Supabase channel subscription failed:', status);
          setError('Failed to subscribe to real-time updates. Data may not refresh automatically.');
        }
      });

      return () => {
        channel.unsubscribe();
      };
    }
  }, []);

  const handleAddContribution = async () => {
    if (isAddingContribution) return;
    if (!newContribution.member_id) {
      alert("Please select a member");
      return;
    }

    if (newContribution.amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    const start = new Date(newContribution.fromYear, newContribution.fromMonth - 1, 1);
    const end = new Date(newContribution.toYear, newContribution.toMonth - 1, 1);
    if (start > end) {
      alert('Invalid date range: From must be before or equal to To');
      return;
    }

    setIsAddingContribution(true);
    const months: { year: number; month: number }[] = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const tempIds = months.map(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
    const optimisticEntries: Contribution[] = months.map((m, i) => ({
      id: tempIds[i],
      month: m.month,
      year: m.year,
      paid: true,
      members: members.find(mem => mem.id === newContribution.member_id) || { id: newContribution.member_id || tempIds[i], name: 'Unknown', phone: '', joined_at: null },
      amount: newContribution.amount,
      paid_on: new Date().toISOString(),
      member_id: newContribution.member_id,
      type: newContribution.type,
      project_id: newContribution.project_id
    } as Contribution));

    setContributions(prev => [...optimisticEntries, ...prev]);
    setShowAddContribution(false);

    try {
      const inserts = months.map(m => ({
        member_id: newContribution.member_id,
        amount: newContribution.amount,
        contribution_month: `${m.year}-${String(m.month).padStart(2,'0')}-01`,
        paid_on: new Date().toISOString(),
        type: newContribution.type || null,
        project_id: newContribution.project_id || null
      }));

      const { data: insertedRows, error } = await supabase
        .from('contributions')
        .upsert(inserts, { onConflict: 'member_id,contribution_month' })
        .select();

      if (error) {
        setContributions(prev => prev.filter(c => !tempIds.includes(c.id)));
        setError(handleSupabaseError(error, "add contribution(s)"));
      } else {
        await fetchData();
        setNewContribution({ type: 'contribution', fromMonth: new Date().getMonth() + 1, fromYear: new Date().getFullYear(), toMonth: new Date().getMonth() + 1, toYear: new Date().getFullYear(), amount: 2000, member_id: "", project_id: null });
      }
    } catch (err) {
      setContributions(prev => prev.filter(c => !tempIds.includes(c.id)));
      setError(handleSupabaseError(err, "add contributions"));
    } finally {
      setIsAddingContribution(false);
    }
  };

  const handleAddMember = async () => {
    if (!newMember.name) {
      alert("Please enter a name for the member");
      return;
    }
    if (!newMember.phone) {
      alert("Please enter a phone number for the member");
      return;
    }

    const tempId = `temp-m-${Date.now()}`;
    const optimisticMember: Member = { id: tempId, name: newMember.name, email: newMember.email || null, phone: newMember.phone, joined_at: null };
    setMembers(prev => [...prev, optimisticMember]);
    setShowAddMember(false);

    try {
      const payload = { 
        name: newMember.name, 
        email: newMember.email || null, 
        phone: newMember.phone,
        joined_at: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('members')
        .insert([payload])
        .select()
        .single();

      if (error) {
        setMembers(prev => prev.filter(m => m.id !== tempId));
        setError(handleSupabaseError(error, "add member"));
      } else if (data) {
        setMembers(prev => prev.map(m => m.id === tempId ? { 
          id: data.id, 
          name: data.name || '', 
          email: data.email || null, 
          phone: data.phone || '', 
          joined_at: data.joined_at || null 
        } : m));
        setNewMember({ name: '', email: '', phone: '' });
      }
    } catch (err) {
      setMembers(prev => prev.filter(m => m.id !== tempId));
      setError(handleSupabaseError(err, "add member"));
    }
  };

  const handleBulkUpload = async () => {
    if (!csvData) {
      alert("Please paste CSV data");
      return;
    }

    setProcessingBulk(true);
    try {
      const parsedData = Papa.parse(csvData, { header: true });
      
      if (parsedData.errors && parsedData.errors.length > 0) {
        alert("CSV format is invalid. Please check your data.");
        return;
      }

      const contributionsToAdd: { member_id: string | null; amount: number; contribution_month: string; paid_on: string; type?: string | null; project_id?: string | null }[] = [];
      
      for (const row of parsedData.data as any[]) {
        if (!row.member_name || !row.month || !row.year || !row.amount) {
          console.warn("Skipping row with missing data:", row);
          continue;
        }

        let memberId: string | null = null;
        const existingMember = members.find(m => 
          m.name.toLowerCase() === row.member_name.toLowerCase()
        );

        if (existingMember) {
          memberId = existingMember.id;
        } else {
          const { data: newMember, error } = await supabase
            .from("members")
            .insert([{ name: row.member_name, email: null, phone: '0000000000', joined_at: new Date().toISOString() }])
            .select()
            .single();

          if (error) {
            console.error("Error creating member:", error);
            continue;
          }

          memberId = newMember.id;
          setMembers(prev => [...prev, { 
            id: newMember.id, 
            name: newMember.name || '', 
            email: newMember.email || null, 
            phone: newMember.phone || '', 
            joined_at: newMember.joined_at || null 
          } as Member]);
        }

        contributionsToAdd.push({
          member_id: memberId,
          amount: parseFloat(row.amount),
          contribution_month: `${row.year}-${String(row.month).padStart(2, '0')}-01`,
          paid_on: new Date().toISOString(),
          type: row.type || null,
          project_id: row.project_id || null
        });
      }

      if (contributionsToAdd.length > 0) {
        const { data: upserted, error } = await supabase
          .from("contributions")
          .upsert(contributionsToAdd, { onConflict: 'member_id,contribution_month' })
          .select();

        if (error) {
          setError(handleSupabaseError(error, "bulk upload contributions"));
        } else {
          await fetchData();
          alert(`Successfully added/updated ${Array.isArray(upserted) ? upserted.length : contributionsToAdd.length} contributions!`);
          setCsvData("");
          setShowBulkUpload(false);
        }
      }
    } catch (error) {
      setError(handleSupabaseError(error, "process bulk upload"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const filtered = useMemo(() => contributions.filter((c) => {
    const matchesName = c.members?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || 
                         (statusFilter === "paid" ? c.paid : !c.paid);
    const matchesMonth = monthFilter === "all" || c.month === Number(monthFilter);
    const matchesYear = yearFilter === "all" || c.year === Number(yearFilter);
    
    return matchesName && matchesStatus && matchesMonth && matchesYear;
  }), [contributions, search, statusFilter, monthFilter, yearFilter]);

  const pivotedContributions = useMemo(() => {
    const monthYears = Array.from(
      new Set(
        filtered.map(c => `${c.year}-${String(c.month).padStart(2, '0')}`)
      )
    ).sort().map(my => {
      const [year, month] = my.split('-').map(Number);
      return { year, month };
    });

    const memberContributions: Record<string, { member: Member; contributions: Record<string, Contribution | null>; total: number }> = {};

    members.forEach(member => {
      memberContributions[member.id] = {
        member,
        contributions: Object.fromEntries(monthYears.map(my => [`${my.year}-${my.month}`, null])),
        total: 0
      };
    });

    filtered.forEach(c => {
      const memberId = c.member_id || c.members?.id || 'unknown';
      const key = `${c.year}-${String(c.month).padStart(2, '0')}`;
      
      if (!memberContributions[memberId]) {
        memberContributions[memberId] = {
          member: c.members || { id: memberId, name: 'Unknown', phone: '', joined_at: null },
          contributions: Object.fromEntries(monthYears.map(my => [`${my.year}-${my.month}`, null])),
          total: 0
        };
      }
      
      memberContributions[memberId].contributions[key] = c;
      if (c.paid) {
        memberContributions[memberId].total += c.amount;
      }
    });

    return Object.values(memberContributions).filter(group => 
      Object.values(group.contributions).some(c => c !== null) || 
      group.member.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [filtered, members, search]);

  const monthYears = useMemo(() => {
    return Array.from(
      new Set(
        filtered.map(c => `${c.year}-${String(c.month).padStart(2, '0')}`)
      )
    ).sort().map(my => {
      const [year, month] = my.split('-').map(Number);
      return { year, month };
    });
  }, [filtered]);

  const exportCSV = async () => {
    try {
      const csvData = pivotedContributions.map(group => {
        const row: Record<string, any> = { Name: group.member.name };
        monthYears.forEach(({ year, month }) => {
          const key = `${year}-${String(month).padStart(2, '0')}`;
          const c = group.contributions[key];
          const monthName = new Date(0, month - 1).toLocaleString('default', { month: 'short' });
          row[`${monthName} ${year}`] = c && c.paid ? `KSh ${c.amount.toLocaleString()}` : c ? 'Unpaid' : '-';
        });
        row['Total'] = `KSh ${group.total.toLocaleString()}`;
        return row;
      });

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
      alert('CSV export failed. Please check the console for details.');
    }
  };

  const exportPDF = async () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Member Contributions Report`, 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);

      if ((doc as any).autoTable) {
        const headers = ['Name', ...monthYears.map(({ year, month }) => 
          `${new Date(0, month - 1).toLocaleString('default', { month: 'short' })} ${year}`), 'Total'];
        const body = pivotedContributions.map(group => [
          group.member.name,
          ...monthYears.map(({ year, month }) => {
            const c = group.contributions[`${year}-${String(month).padStart(2, '0')}`];
            return c && c.paid ? `KSh ${c.amount.toLocaleString()}` : c ? 'Unpaid' : '-';
          }),
          `KSh ${group.total.toLocaleString()}`
        ]);

        (doc as any).autoTable({
          startY: 30,
          head: [headers],
          body,
          theme: 'grid',
          headStyles: {
            fillColor: [66, 139, 202],
            textColor: 255,
            fontStyle: 'bold'
          },
          styles: {
            cellWidth: 40
          },
          columnStyles: {
            [headers.length - 1]: { cellWidth: 20 }
          }
        });
      } else {
        let y = 30;
        const rowHeight = 7;
        doc.setFontSize(10);
        const headers = ['Name', ...monthYears.map(({ year, month }) => 
          `${new Date(0, month - 1).toLocaleString('default', { month: 'short' })} ${year}`), 'Total'];
        doc.text(headers.join(' | '), 14, y);
        y += rowHeight;
        pivotedContributions.forEach(group => {
          const row = [
            group.member.name,
            ...monthYears.map(({ year, month }) => {
              const c = group.contributions[`${year}-${String(month).padStart(2, '0')}`];
              return c && c.paid ? `KSh ${c.amount.toLocaleString()}` : c ? 'Unpaid' : '-';
            }),
            `KSh ${group.total.toLocaleString()}`
          ];
          doc.text(row.join(' | '), 14, y);
          y += rowHeight;
          if (y > 280) { doc.addPage(); y = 20; }
        });
      }
    
      doc.save(`contributions-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('PDF export failed. Please check the console for details.');
    }
  };

  const toggleMemberContributions = (memberId: string) => {
    setExpandedMembers(prev => ({
      ...prev,
      [memberId]: !prev[memberId]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-green-50 p-4">
        <h1 className="text-2xl font-bold">Member Contributions</h1>
        <div className="flex justify-center items-center h-64">
          <p>Loading contributions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Member Contributions</h1>
        
        {!isAuthenticated ? (
          <div className="flex flex-col items-end space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="password"
                className={`border p-2 rounded w-64 ${passwordError ? 'border-red-500' : ''}`}
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => e.key === 'Enter' && authenticate()}
              />
              <button 
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                onClick={() => authenticate()}
                disabled={!password}
              >
                Login
              </button>
            </div>
            {passwordError && (
              <p className="text-sm text-red-500">{passwordError}</p>
            )}
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

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span>{error}</span>
          <button
            className="absolute top-0 right-0 px-4 py-3"
            onClick={() => fetchData()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <input 
          className="border p-2 rounded w-full md:w-auto" 
          placeholder="Search by name" 
          value={search} 
          onChange={(e) => debouncedSetSearch(e.target.value)} 
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
          onClick={() => {
            setSearch("");
            setStatusFilter("all");
            setMonthFilter("all");
            setYearFilter("all");
          }}
        >
          Clear Filters
        </button>
        
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
        {pivotedContributions.length === 0 && !error ? (
          <div className="p-8 text-center text-gray-500">No contributions found matching your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            {pivotedContributions.map(group => (
              <div key={group.member.id} className="border rounded p-3 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleMemberContributions(group.member.id)}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      {expandedMembers[group.member.id] ? '▼' : '▶'}
                    </button>
                    <h3 className="font-semibold">{group.member.name}</h3>
                  </div>
                  <div className="text-sm text-gray-600">{Object.values(group.contributions).filter(c => c !== null).length} contribution{Object.values(group.contributions).filter(c => c !== null).length !== 1 ? 's' : ''}</div>
                </div>
                {expandedMembers[group.member.id] && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2 text-left">Name</th>
                        {monthYears.map(({ year, month }) => (
                          <th key={`${year}-${month}`} className="p-2 text-center">
                            {new Date(0, month - 1).toLocaleString('default', { month: 'short' })} {year}
                          </th>
                        ))}
                        <th className="p-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 font-medium">{group.member.name}</td>
                        {monthYears.map(({ year, month }) => {
                          const c = group.contributions[`${year}-${String(month).padStart(2, '0')}`];
                          return (
                            <td key={`${year}-${month}`} className="p-2 text-center">
                              {c && c.paid ? (
                                <span className="text-green-700">KSh {c.amount.toLocaleString()}</span>
                              ) : c ? (
                                <span className="text-red-700">Unpaid</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right font-semibold">KSh {group.total.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {pivotedContributions.length > 0 && (
        <div className="text-sm text-gray-600">
          Showing {pivotedContributions.length} members with contributions
        </div>
      )}

      {showAddContribution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Contribution</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Member</label>
                <select
                  className="w-full border p-2 rounded"
                  value={newContribution.member_id}
                  onChange={(e) => setNewContribution({...newContribution, member_id: e.target.value})}
                >
                  <option value="">Select Member</option>
                  {members.map(member => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Contribution Type</label>
                <select
                  className="w-full border p-2 rounded"
                  value={newContribution.type}
                  onChange={(e) => setNewContribution({...newContribution, type: e.target.value})}
                >
                  <option value="contribution">Contribution</option>
                  <option value="food">Food</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Project (Optional)</label>
                <select
                  className="w-full border p-2 rounded"
                  value={newContribution.project_id || ''}
                  onChange={(e) => setNewContribution({...newContribution, project_id: e.target.value || null})}
                >
                  <option value="">No Project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
       <div className="grid grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium mb-1">From (Month)</label>
    <select
      className="w-full border p-2 rounded"
      value={newContribution.fromMonth}
      onChange={(e) =>
        setNewContribution({
          ...newContribution,
          fromMonth: parseInt(e.target.value),
        })
      }
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
        <option key={m} value={m}>
          {new Date(0, m - 1).toLocaleString("default", { month: "long" })}
        </option>
      ))}
    </select>
  </div>
</div>


                <div>
                  <label className="block text-sm font-medium mb-1">From (Year)</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={newContribution.fromYear}
                    onChange={(e) => setNewContribution({ ...newContribution, fromYear: parseInt(e.target.value) })}
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">To (Month)</label>
                  <select
                    className="w-full border p-2 rounded"
                    value={newContribution.toMonth}
                    onChange={(e) => setNewContribution({ ...newContribution, toMonth: parseInt(e.target.value) })}
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
                    value={newContribution.toYear}
                    onChange={(e) => setNewContribution({ ...newContribution, toYear: parseInt(e.target.value) })}
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
                  value={newContribution.amount}
                  onChange={(e) => setNewContribution({ ...newContribution, amount: parseFloat(e.target.value) })}
                />
              </div>

              <div className="flex justify-end space-x-2 mt-4">
                <button
                  className="px-4 py-2 rounded border hover:bg-gray-100"
                  onClick={() => setShowAddContribution(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  onClick={handleAddContribution}
                  disabled={isAddingContribution}
                >
                  {isAddingContribution ? 'Adding...' : 'Add Contribution'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add New Member</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  className="w-full border p-2 rounded"
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  className="w-full border p-2 rounded"
                  value={newMember.phone}
                  onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email (Optional)</label>
                <input
                  type="email"
                  className="w-full border p-2 rounded"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                />
              </div>

              <div className="flex justify-end space-x-2 mt-4">
                <button
                  className="px-4 py-2 rounded border hover:bg-gray-100"
                  onClick={() => setShowAddMember(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={handleAddMember}
                >
                  Add Member
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">Bulk Upload Contributions (CSV)</h2>
            <textarea
              className="w-full border p-2 rounded h-48"
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              placeholder="Paste CSV data here. Columns: member_name, month, year, amount, type, project_id"
            />
            <div className="flex justify-end space-x-2 mt-4">
              <button
                className="px-4 py-2 rounded border hover:bg-gray-100"
                onClick={() => setShowBulkUpload(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                onClick={handleBulkUpload}
                disabled={processingBulk}
              >
                {processingBulk ? 'Processing...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
