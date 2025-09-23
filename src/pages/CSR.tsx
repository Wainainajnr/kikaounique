import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { toast } from "react-hot-toast";
import { supabase } from "@/integrations/supabaseClient";

// Updated interfaces to match actual database schema
interface Project {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  impact?: string | null;
  amount?: number | null;
  status?: "ongoing" | "completed";
  created_at?: string;
  csr_contributions?: Contribution[];
}

interface Contribution {
  id: string;
  project_id: string;
  member_id: string | null;
  amount: number;
  contributed_on: string | null;
  created_at?: string;
}

interface CSRFormData {
  title: string;
  description: string;
  impact: string;
  amount: number;
  date: string;
}

interface ContributionFormData {
  project_id: string;
  member_id: string;
  amount: number;
  date: string;
}

type ButtonVariant = 'primary' | 'outline' | 'secondary';

const Button = ({ children, onClick, disabled = false, variant = 'primary', className = "", ...props }: { children: any; onClick?: () => void; disabled?: boolean; variant?: ButtonVariant; className?: string }) => {
  const baseClasses = "px-4 py-2 rounded font-medium transition-colors";
  const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400",
    outline: "border border-gray-300 hover:bg-gray-100 text-gray-700",
    secondary: "bg-green-600 hover:bg-green-700 text-white"
  };
  
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default function CSR() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<{id: string, name: string}[]>([]);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addContributionOpen, setAddContributionOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectFormData, setProjectFormData] = useState<CSRFormData>({
    title: "",
    description: "",
    impact: "",
    amount: 0,
    date: new Date().toISOString().split('T')[0]
  });
  const [contributionFormData, setContributionFormData] = useState<ContributionFormData>({
    project_id: "",
    member_id: "",
    amount: 0,
    date: new Date().toISOString().split('T')[0]
  });
  
  const [adminValidated, setAdminValidated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('isAdminValidated') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [adminSignInOpen, setAdminSignInOpen] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch members list
  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    const { data, error } = await supabase.from('members').select('id, name');
    if (error) {
      console.error("Error fetching members:", error);
      toast.error(error.message);
    } else {
      setMembers(data || []);
    }
  }

  const handleSupabaseError = (error: any, context: string) => {
    console.error(`${context} error:`, error);
    
    // More specific error messages
    if (error.code === 'PGRST301') {
      toast.error('Table not found. Please check if the table exists.');
    } else if (error.code === '42501') {
      toast.error('Permission denied. Check RLS policies.');
    } else if (error.message?.includes('column')) {
      toast.error(`Column mismatch: ${error.message}`);
    } else if (error.message?.includes('relation')) {
      toast.error('Table does not exist. Please run the setup SQL.');
    } else {
      toast.error(`Failed to ${context}. Please try again.`);
    }
  };

  const isValidDate = (dateString: string, allowFuture: boolean = true): boolean => {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    const isValid = date instanceof Date && !isNaN(date.getTime());
    
    if (!allowFuture) {
      return isValid && date <= new Date();
    }
    
    return isValid;
  };

  const validateProjectForm = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!projectFormData.title.trim()) {
      errors.push("Project title is required");
    }

    if (!projectFormData.description.trim()) {
      errors.push("Project description is required");
    }

    if (!isValidDate(projectFormData.date, true)) {
      errors.push("Please select a valid date");
    }

    if (projectFormData.amount < 0) {
      errors.push("Amount cannot be negative");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const validateContributionForm = (): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!contributionFormData.project_id) {
      errors.push("Please select a project");
    }

    if (!contributionFormData.member_id) {
      errors.push("Please select a member");
    }

    if (!contributionFormData.amount || contributionFormData.amount <= 0) {
      errors.push("Please enter a valid contribution amount");
    }

    if (!isValidDate(contributionFormData.date, false)) {
      errors.push("Please select a valid contribution date (not in the future)");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // Debug function to check database structure
  const checkDatabaseStructure = async () => {
    try {
      console.log("Checking database structure...");
      
      // Check if tables exist with simpler queries
      const { data: projectsData, error: projectsError } = await supabase
        .from("csr_projects")
        .select("id, title, description, start_date, end_date")
        .limit(1);

      if (projectsError) {
        console.error("csr_projects table error:", projectsError);
      } else {
        console.log("csr_projects table exists, sample data:", projectsData);
      }

      const { data: contributionsData, error: contributionsError } = await supabase
        .from("csr_contributions")
        .select("id, project_id, amount, contributed_on")
        .limit(1);

      if (contributionsError) {
        console.error("csr_contributions table error:", contributionsError);
      } else {
        console.log("csr_contributions table exists, sample data:", contributionsData);
      }
    } catch (error) {
      console.error("Error checking database structure:", error);
    }
  };

  // Improved fetch function with better error handling
  const fetchProjects = async () => {
    setLoading(true);
    try {
      // First, check database structure
      await checkDatabaseStructure();

      // Try a simpler query first - just get projects
      console.log("Fetching projects...");
      const { data: projectsData, error: projectsError } = await supabase
        .from("csr_projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (projectsError) {
        console.error("Error fetching projects:", projectsError);
        // If the simple query fails, the table might not exist or RLS is blocking
        if (projectsError.code === 'PGRST301' || projectsError.message?.includes('relation')) {
          toast.error('CSR projects table not found. Please check your database setup.');
        }
        setProjects([]);
        return;
      }

      console.log("Fetched projects data:", projectsData);

      if (!projectsData || projectsData.length === 0) {
        console.log("No projects found in database");
        setProjects([]);
        return;
      }

      // Now fetch contributions for each project separately
      const projectsWithContributions: Project[] = await Promise.all(
        projectsData.map(async (project) => {
          const { data: contributionsData } = await supabase
            .from("csr_contributions")
            .select("*")
            .eq("project_id", project.id);

          return {
            id: project.id,
            title: project.title || "Untitled Project",
            description: project.description,
            start_date: project.start_date,
            end_date: project.end_date,
            // Use start_date as the display date, or fallback to created_at
            date: project.start_date || project.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            created_at: project.created_at,
            // For now, set default values for missing fields
            status: "ongoing" as const,
            amount: 0, // You'll need to add this column to your table
            impact: project.description, // Use description as impact for now
            csr_contributions: contributionsData || []
          };
        })
      );

      setProjects(projectsWithContributions);
      
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast.error("Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();

    // Realtime subscriptions - simplified to avoid complex joins
    const projectsChannel = supabase.channel("csr_projects_changes")
      .on("postgres_changes", 
        { event: "*", schema: "public", table: "csr_projects" }, 
        (payload) => {
          console.log("Project change detected:", payload);
          // Refetch all projects
          fetchProjects();
        }
      )
      .subscribe();

    const contributionsChannel = supabase.channel("csr_contributions_changes")
      .on("postgres_changes", 
        { event: "*", schema: "public", table: "csr_contributions" }, 
        (payload) => {
          console.log("Contribution change detected:", payload);
          // Refetch projects when contributions change
          fetchProjects();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(projectsChannel);
        supabase.removeChannel(contributionsChannel);
      } catch (e) {
        console.warn("Error unsubscribing from channels:", e);
      }
    };
  }, []);

  const handleAddProject = async () => {
    const validation = validateProjectForm();
    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    if (!adminValidated) {
      setAdminSignInOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      console.log("Adding project:", projectFormData);
      
      const { data, error } = await supabase
        .from("csr_projects")
        .insert({
          title: projectFormData.title.trim(),
          description: projectFormData.description.trim(),
          start_date: projectFormData.date, // Using start_date for the project date
          // Store impact in description or add a new column for it
          impact: projectFormData.impact.trim(), // You'll need to add this column
          amount: projectFormData.amount, // You'll need to add this column
          status: "ongoing" // You'll need to add this column
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        
        // If the error is about missing columns, try without them
        if (error.message?.includes('column') && error.message?.includes('does not exist')) {
          console.log('Missing columns detected, trying alternative insert...');
          
          // Insert without the missing columns
          const { data: altData, error: altError } = await supabase
            .from("csr_projects")
            .insert({
              title: projectFormData.title.trim(),
              description: `${projectFormData.description.trim()}. Impact: ${projectFormData.impact.trim()}`,
              start_date: projectFormData.date,
            })
            .select()
            .single();
            
          if (altError) {
            handleSupabaseError(altError, "add project");
            return;
          }
          
          console.log("Project added successfully (without impact/amount):", altData);
          toast.success("Project added successfully!");
          
          if (altData) {
            const newProject: Project = {
              id: altData.id,
              title: altData.title || "Untitled Project",
              description: altData.description,
              start_date: altData.start_date,
              end_date: altData.end_date,
              date: altData.start_date || altData.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
              created_at: altData.created_at,
              status: "ongoing",
              amount: projectFormData.amount,
              impact: projectFormData.impact,
              csr_contributions: []
            };
            
            setProjects(prev => [newProject, ...prev]);
          }
        } else {
          handleSupabaseError(error, "add project");
          return;
        }
      } else {
        console.log("Project added successfully:", data);
        toast.success("Project added successfully!");
        
        // Update local state immediately
        if (data) {
          const newProject: Project = {
            id: data.id,
            title: data.title || "Untitled Project",
            description: data.description,
            start_date: data.start_date,
            end_date: data.end_date,
            date: data.start_date || data.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            created_at: data.created_at,
            status: data.status || "ongoing",
            amount: projectFormData.amount,
            impact: projectFormData.impact,
            csr_contributions: []
          };
          
          setProjects(prev => [newProject, ...prev]);
        }
      }

      setAddProjectOpen(false);
      setProjectFormData({
        title: "",
        description: "",
        impact: "",
        amount: 0,
        date: new Date().toISOString().split('T')[0]
      });

    } catch (error) {
      console.error("Unexpected error adding project:", error);
      handleSupabaseError(error, "add project");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddContribution = async () => {
    const validation = validateContributionForm();
    if (!validation.isValid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    if (!adminValidated) {
      setAdminSignInOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      console.log("Adding contribution:", contributionFormData);
      
      // Insert contribution with UUID member_id
      const { data, error } = await supabase
        .from("csr_contributions")
        .insert([{
          project_id: contributionFormData.project_id,
          member_id: contributionFormData.member_id,
          amount: Number(contributionFormData.amount),
          contributed_on: new Date(contributionFormData.date)
        }])
        .select()
        .single();

      if (error) {
        console.error("Contribution insert error:", error);
        handleSupabaseError(error, "add contribution");
        return;
      }

      console.log("Contribution added successfully:", data);
      toast.success("Contribution added successfully!");
      
      // Update local state
      setProjects(prev => prev.map(project => {
        if (project.id === contributionFormData.project_id) {
          const updatedContributions = [...(project.csr_contributions || []), data];
          return {
            ...project,
            csr_contributions: updatedContributions
          };
        }
        return project;
      }));

      setAddContributionOpen(false);
      setContributionFormData({
        project_id: "",
        member_id: "",
        amount: 0,
        date: new Date().toISOString().split('T')[0]
      });

    } catch (error) {
      console.error("Unexpected error adding contribution:", error);
      handleSupabaseError(error, "add contribution");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper function to get member name by ID
  const getMemberName = (memberId: string | null) => {
    if (!memberId) return "Anonymous";
    const member = members.find(m => m.id === memberId);
    return member ? member.name : "Unknown Member";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "No date";
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Invalid date";
    
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES'
    }).format(amount);
  };

  const getTotalContributions = (project: Project) => {
    const contributions = project.csr_contributions || [];
    return contributions.reduce((total: number, contribution: any) => total + (contribution.amount || 0), 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center items-center h-64">
            <p>Loading projects...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Social Responsibility (CSR)
          </h1>
          <p className="text-gray-600 text-lg">
            Our commitment to making a positive impact.
          </p>
        </div>

        {/* Debug Info */}
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            <strong>Debug:</strong> Found {projects.length} projects. 
            {projects.length > 0 && ` Total contributions across all projects: ${projects.reduce((total, project) => total + getTotalContributions(project), 0)}`}
            <br />
            <strong>Members:</strong> {members.length} members loaded
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-8 justify-center">
          <Button onClick={() => setAddProjectOpen(true)}>
            Add CSR Project
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => setAddContributionOpen(true)}
            disabled={projects.length === 0}
          >
            Add Member Contribution
          </Button>
        </div>

        {/* Projects Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const totalContributions = getTotalContributions(project);
            const contributions = project.csr_contributions || [];
            
            return (
              <div key={project.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                <div className="p-6">
                  {/* Project Header */}
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">
                      {project.title}
                    </h3>
                    <span className={`px-3 py-1 text-sm rounded-full ${
                      project.status === "ongoing" 
                        ? "bg-green-100 text-green-800" 
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {project.status}
                    </span>
                  </div>

                  {/* Project Date */}
                  <p className="text-gray-500 text-sm mb-4">
                    {formatDate(project.date)}
                  </p>

                  {/* Project Description */}
                  <p className="text-gray-600 mb-4 line-clamp-3">
                    {project.description || "No description available"}
                  </p>

                  {/* Impact */}
                  {project.impact && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-700 mb-1">Impact:</h4>
                      <p className="text-gray-600 text-sm">{project.impact}</p>
                    </div>
                  )}

                  {/* Budget and Contributions Summary */}
                  <div className="mb-4 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Project Budget:</span>
                      <span className="font-semibold">{formatCurrency(project.amount || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Contributions:</span>
                      <span className="font-semibold text-green-600">{formatCurrency(totalContributions)}</span>
                    </div>
                  </div>

                  {/* Contributions List */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      Contributions ({contributions.length}):
                    </h4>
                    {contributions.length > 0 ? (
                      <ul className="space-y-2 max-h-32 overflow-auto">
                        {contributions.map((contribution: any) => (
                          <li key={contribution.id} className="flex justify-between items-center text-sm">
                            <div className="text-gray-600">
                              {getMemberName(contribution.member_id)}
                              <span className="text-gray-400 ml-2">
                                ({formatDate(contribution.contributed_on || contribution.date)})
                              </span>
                            </div>
                            <div className="text-green-600 font-semibold">
                              {formatCurrency(contribution.amount || 0)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 text-sm">No contributions yet.</p>
                    )}
                  </div>

                  {/* Add Contribution Button */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSelectedProject(project);
                      setContributionFormData(prev => ({
                        ...prev,
                        project_id: project.id
                      }));
                      setAddContributionOpen(true);
                    }}
                  >
                    Add Contribution
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {projects.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-gray-500">No CSR projects found. Add your first project above.</p>
          </div>
        )}

        {/* Add Project Dialog */}
        <Dialog open={addProjectOpen} onClose={() => setAddProjectOpen(false)} className="relative z-50">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
              <Dialog.Title className="text-lg font-bold">
                Add New CSR Project
              </Dialog.Title>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input 
                  className="w-full border p-2 rounded" 
                  placeholder="Enter project name"
                  value={projectFormData.title} 
                  onChange={(e) => setProjectFormData({ ...projectFormData, title: e.target.value })} 
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea 
                  className="w-full border p-2 rounded" 
                  placeholder="Describe the project briefly"
                  rows={3}
                  value={projectFormData.description} 
                  onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })} 
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Impact
                </label>
                <textarea 
                  className="w-full border p-2 rounded" 
                  placeholder="Describe the impact of the project"
                  rows={2}
                  value={projectFormData.impact} 
                  onChange={(e) => setProjectFormData({ ...projectFormData, impact: e.target.value })} 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget Amount (KES) *
                </label>
                <input 
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border p-2 rounded" 
                  placeholder="Enter amount"
                  value={projectFormData.amount || ""} 
                  onChange={(e) => setProjectFormData({ ...projectFormData, amount: Number(e.target.value) })} 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Date *
                </label>
                <input 
                  type="date"
                  className="w-full border p-2 rounded" 
                  value={projectFormData.date} 
                  onChange={(e) => setProjectFormData({ ...projectFormData, date: e.target.value })} 
                />
                {!isValidDate(projectFormData.date, true) && (
                  <p className="text-red-500 text-xs mt-1">Please select a valid date</p>
                )}
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setAddProjectOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddProject} disabled={submitting}>
                  {submitting ? "Adding..." : "Add Project"}
                </Button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Add Contribution Dialog */}
        <Dialog open={addContributionOpen} onClose={() => setAddContributionOpen(false)} className="relative z-50">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
              <Dialog.Title className="text-lg font-bold">
                Add Member Contribution
              </Dialog.Title>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Project *
                </label>
                <select 
                  className="w-full border p-2 rounded" 
                  value={contributionFormData.project_id} 
                  onChange={(e) => setContributionFormData({ ...contributionFormData, project_id: e.target.value })}
                  required
                >
                  <option value="">Select a project</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Member *
                </label>
                <select
                  value={contributionFormData.member_id}
                  onChange={e => setContributionFormData({ ...contributionFormData, member_id: e.target.value })}
                  className="w-full border p-2 rounded"
                  required
                >
                  <option value="">Select member</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (KES) *
                </label>
                <input 
                  type="number"
                  min="1"
                  step="0.01"
                  className="w-full border p-2 rounded" 
                  placeholder="Enter contribution amount"
                  value={contributionFormData.amount || ""} 
                  onChange={(e) => setContributionFormData({ ...contributionFormData, amount: Number(e.target.value) })} 
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contribution Date *
                </label>
                <input 
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full border p-2 rounded" 
                  value={contributionFormData.date} 
                  onChange={(e) => setContributionFormData({ ...contributionFormData, date: e.target.value })} 
                />
                {!isValidDate(contributionFormData.date, false) && (
                  <p className="text-red-500 text-xs mt-1">Please select a valid date (not in the future)</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setAddContributionOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddContribution} 
                  disabled={submitting || !contributionFormData.project_id || !contributionFormData.member_id}
                >
                  {submitting ? "Adding..." : "Add Contribution"}
                </Button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>

        {/* Admin Sign-in Dialog */}
        <Dialog open={adminSignInOpen} onClose={() => setAdminSignInOpen(false)} className="relative z-50">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
              <Dialog.Title className="text-lg font-bold">Admin Sign-in</Dialog.Title>
              <p className="text-sm text-gray-600">Enter admin password to continue.</p>
              <div>
                <input
                  type="password"
                  className="w-full border p-2 rounded"
                  placeholder="Admin password"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setAdminPasswordInput(''); setAdminSignInOpen(false); }}>Cancel</Button>
                <Button onClick={() => {
                  if (adminPasswordInput === 'Admin@123') {
                    try { sessionStorage.setItem('isAdminValidated', 'true'); } catch (e) {}
                    setAdminValidated(true);
                    setAdminSignInOpen(false);
                    setAdminPasswordInput('');
                    toast.success('Admin validated for this session');
                  } else {
                    toast.error('Invalid admin password');
                  }
                }}>
                  Sign in
                </Button>
              </div>
            </Dialog.Panel>
          </div>
        </Dialog>
      </div>
    </div>
  );
}