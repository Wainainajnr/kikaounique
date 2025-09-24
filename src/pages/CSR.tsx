import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { toast } from "react-hot-toast";
import { supabase } from "@/integrations/supabaseClient";

// Interfaces
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
  project_id: string | null;
  member_id: string | null;
  amount: number;
  contributed_on: string | null;
  created_at?: string;
}

interface CSRFormData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  impact: string;
  amount: number;
}

interface ContributionFormData {
  project_id: string;
  member_id: string;
  amount: number;
  date: string;
}

type ButtonVariant = "primary" | "outline" | "secondary";

const Button = ({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  className = "",
  ...props
}: {
  children: any;
  onClick?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  className?: string;
}) => {
  const baseClasses = "px-4 py-2 rounded font-medium transition-colors";
  const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400",
    outline: "border border-gray-300 hover:bg-gray-100 text-gray-700",
    secondary: "bg-green-600 hover:bg-green-700 text-white",
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
  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addContributionOpen, setAddContributionOpen] = useState(false);
  const [adminSignInOpen, setAdminSignInOpen] = useState(false);

  const [adminValidated, setAdminValidated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("isAdminValidated") === "true";
    } catch {
      return false;
    }
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");

  const [projectFormData, setProjectFormData] = useState<CSRFormData>({
    title: "",
    description: "",
    impact: "",
    amount: 0,
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const [contributionFormData, setContributionFormData] = useState<ContributionFormData>({
    project_id: "",
    member_id: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
  });

  const ADMIN_PASSWORD = "Admin@123";

  // Fetch members
  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    const { data, error } = await supabase.from("members").select("id, name");
    if (error) {
      console.error("Error fetching members:", error);
      toast.error("Failed to load members");
    } else {
      setMembers(data || []);
    }
  }

  // Fetch projects + contributions
  const fetchAllProjects = async () => {
    setLoading(true);
    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from("csr_projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (projectsError) {
        throw projectsError;
      }

      const projectsWithContributions: Project[] = await Promise.all(
        (projectsData || []).map(async (proj: any) => {
          const { data: contributionsData } = await supabase
            .from("csr_contributions")
            .select("*")
            .eq("project_id", proj.id)
            .order("contributed_on", { ascending: false });

          return {
            id: proj.id,
            title: proj.title,
            description: proj.description || null,
            start_date: proj.start_date || null,
            end_date: proj.end_date || null,
            status: proj.status || "ongoing",
            amount: proj.amount || 0,
            impact: proj.impact || "",
            created_at: proj.created_at,
            csr_contributions: contributionsData || [],
          };
        })
      );

      setProjects(projectsWithContributions);
    } catch (error: any) {
      console.error("Error fetching projects:", error);
      toast.error("Failed to load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllProjects();

    const projectSub = supabase
      .channel("csr_projects_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "csr_projects" },
        fetchAllProjects
      )
      .subscribe();

    const contributionSub = supabase
      .channel("csr_contributions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "csr_contributions" },
        fetchAllProjects
      )
      .subscribe();

    return () => {
      supabase.removeChannel(projectSub);
      supabase.removeChannel(contributionSub);
    };
  }, []);

  // Helpers
  const isValidDate = (dateString: string, allowFuture: boolean = true) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    if (!allowFuture && date > new Date()) return false;
    return true;
  };

  const validateProjectForm = () => {
    const errors: string[] = [];
    if (!projectFormData.title.trim()) errors.push("Project title is required");
    if (!projectFormData.description.trim()) errors.push("Project description is required");
    if (!isValidDate(projectFormData.start_date, true)) errors.push("Please select a valid start date");
    if (!isValidDate(projectFormData.end_date, true)) errors.push("Please select a valid end date");
    
    // Check if end date is after start date
    if (projectFormData.start_date && projectFormData.end_date) {
      const startDate = new Date(projectFormData.start_date);
      const endDate = new Date(projectFormData.end_date);
      if (endDate <= startDate) {
        errors.push("End date must be after start date");
      }
    }
    
    if (projectFormData.amount <= 0) errors.push("Amount must be greater than 0");
    return { isValid: errors.length === 0, errors };
  };

  const validateContributionForm = () => {
    const errors: string[] = [];
    if (!contributionFormData.project_id) errors.push("Select a project");
    if (!contributionFormData.member_id) errors.push("Select a member");
    if (contributionFormData.amount <= 0) errors.push("Amount must be greater than 0");
    if (!isValidDate(contributionFormData.date, false)) errors.push("Contribution date cannot be in the future");
    return { isValid: errors.length === 0, errors };
  };

  const handleSupabaseError = (error: any, context: string) => {
    console.error(`Error in ${context}:`, error);
    toast.error(`Failed to ${context}: ${error.message}`);
  };

  const handleAdminValidation = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setAdminValidated(true);
      sessionStorage.setItem("isAdminValidated", "true");
      setAdminSignInOpen(false);
      toast.success("Admin validated");
    } else {
      toast.error("Invalid admin password");
    }
    setAdminPasswordInput("");
  };

  const handleAddProject = async () => {
    const validation = validateProjectForm();
    if (!validation.isValid) {
      validation.errors.forEach((err) => toast.error(err));
      return;
    }
    if (!adminValidated) {
      setAdminSignInOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("csr_projects").insert({
        title: projectFormData.title.trim(),
        description: projectFormData.description.trim(),
        start_date: projectFormData.start_date,
        end_date: projectFormData.end_date,
        impact: projectFormData.impact.trim(),
        amount: projectFormData.amount,
        status: "ongoing",
      });

      if (error) throw error;

      toast.success("Project added successfully");
      setAddProjectOpen(false);
      setProjectFormData({
        title: "",
        description: "",
        impact: "",
        amount: 0,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      });
    } catch (error: any) {
      handleSupabaseError(error, "add project");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddContribution = async () => {
    const validation = validateContributionForm();
    if (!validation.isValid) {
      validation.errors.forEach((err) => toast.error(err));
      return;
    }
    if (!adminValidated) {
      setAdminSignInOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("csr_contributions").insert({
        project_id: contributionFormData.project_id,
        member_id: contributionFormData.member_id,
        amount: contributionFormData.amount,
        contributed_on: contributionFormData.date,
      });

      if (error) throw error;

      toast.success("Contribution added successfully");
      setAddContributionOpen(false);
      setContributionFormData({
        project_id: "",
        member_id: "",
        amount: 0,
        date: new Date().toISOString().split("T")[0],
      });
      setSelectedProject(null);
    } catch (error: any) {
      handleSupabaseError(error, "add contribution");
    } finally {
      setSubmitting(false);
    }
  };

  const getMemberName = (id: string | null) =>
    members.find((m) => m.id === id)?.name || "Unknown Member";
  
  const formatDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "No date";
  
  const formatCurrency = (a: number | null | undefined) =>
    new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(a || 0);
  
  const getTotalContributions = (p: Project) => {
    if (!p.csr_contributions || p.csr_contributions.length === 0) return 0;
    return p.csr_contributions.reduce((total, contribution) => total + (contribution.amount || 0), 0);
  };

  const getProgressPercentage = (project: Project) => {
    const totalContributions = getTotalContributions(project);
    const projectAmount = project.amount || 0;
    
    if (projectAmount <= 0) return 0;
    return Math.min((totalContributions / projectAmount) * 100, 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="text-lg">Loading projects...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">CSR Projects</h1>
        <Button onClick={() => setAddProjectOpen(true)}>Add Project</Button>
      </div>

      {/* Projects List */}
      {projects.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 text-lg">No CSR projects yet.</p>
          <Button onClick={() => setAddProjectOpen(true)} className="mt-4">
            Create Your First Project
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {projects.map((project) => {
            const totalContributions = getTotalContributions(project);
            const progress = getProgressPercentage(project);

            return (
              <div key={project.id} className="bg-white p-6 rounded-lg shadow-md border">
                {/* Project Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">{project.title}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        project.status === "completed" 
                          ? "bg-green-100 text-green-800" 
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {project.status || "ongoing"}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDate(project.start_date)} - {formatDate(project.end_date)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Project Description */}
                <p className="text-gray-600 mb-3">{project.description}</p>
                
                {/* Impact */}
                {project.impact && (
                  <p className="text-sm text-gray-700 mb-4">
                    <span className="font-medium">Impact:</span> {project.impact}
                  </p>
                )}

                {/* Budget and Contributions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="font-semibold text-gray-700">Budget: {formatCurrency(project.amount)}</p>
                    <p className="font-semibold text-gray-700">
                      Total Contributions: {formatCurrency(totalContributions)}
                    </p>
                    {project.amount && project.amount > 0 && (
                      <p className="text-sm text-gray-600">
                        Remaining: {formatCurrency(project.amount - totalContributions)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Add Contribution Button */}
                <div className="flex justify-between items-center">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedProject(project);
                      setContributionFormData({
                        ...contributionFormData,
                        project_id: project.id,
                      });
                      setAddContributionOpen(true);
                    }}
                  >
                    Add Contribution
                  </Button>
                  
                  {/* Progress Text */}
                  <span className="text-sm text-gray-500">
                    {formatCurrency(totalContributions)} of {formatCurrency(project.amount)} raised
                  </span>
                </div>

                {/* Contributions List */}
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-medium text-gray-700 mb-2">Contributions:</h4>
                  {project.csr_contributions && project.csr_contributions.length > 0 ? (
                    <div className="space-y-2">
                      {project.csr_contributions.map((contribution) => (
                        <div key={contribution.id} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                          <span className="font-medium">
                            {getMemberName(contribution.member_id)}
                          </span>
                          <div className="text-right">
                            <span className="font-semibold">{formatCurrency(contribution.amount)}</span>
                            <span className="text-gray-500 text-xs block">
                              on {formatDate(contribution.contributed_on)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No contributions yet.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Project Modal */}
      <Dialog open={addProjectOpen} onClose={() => !submitting && setAddProjectOpen(false)}>
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold mb-4">Add CSR Project</Dialog.Title>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
                <input
                  type="text"
                  placeholder="Enter project title"
                  value={projectFormData.title}
                  onChange={(e) =>
                    setProjectFormData({ ...projectFormData, title: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  placeholder="Describe the project"
                  value={projectFormData.description}
                  onChange={(e) =>
                    setProjectFormData({ ...projectFormData, description: e.target.value })
                  }
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
                <input
                  type="text"
                  placeholder="Expected impact"
                  value={projectFormData.impact}
                  onChange={(e) =>
                    setProjectFormData({ ...projectFormData, impact: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Budget Amount (KES)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={projectFormData.amount}
                  onChange={(e) =>
                    setProjectFormData({ ...projectFormData, amount: Number(e.target.value) })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={projectFormData.start_date}
                    onChange={(e) =>
                      setProjectFormData({ ...projectFormData, start_date: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={projectFormData.end_date}
                    onChange={(e) =>
                      setProjectFormData({ ...projectFormData, end_date: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setAddProjectOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleAddProject} disabled={submitting}>
                {submitting ? "Saving..." : "Save Project"}
              </Button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Add Contribution Modal */}
      <Dialog open={addContributionOpen} onClose={() => !submitting && setAddContributionOpen(false)}>
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-lg max-w-md w-full mx-auto p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold mb-4">
              Add Contribution {selectedProject && `to ${selectedProject.title}`}
            </Dialog.Title>
            
            <div className="space-y-4">
              {!selectedProject && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Project</label>
                  <select
                    value={contributionFormData.project_id}
                    onChange={(e) =>
                      setContributionFormData({ ...contributionFormData, project_id: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Member</label>
                <select
                  value={contributionFormData.member_id}
                  onChange={(e) =>
                    setContributionFormData({ ...contributionFormData, member_id: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a member...</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contribution Amount (KES)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={contributionFormData.amount}
                  onChange={(e) =>
                    setContributionFormData({
                      ...contributionFormData,
                      amount: Number(e.target.value),
                    })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contribution Date</label>
                <input
                  type="date"
                  value={contributionFormData.date}
                  onChange={(e) =>
                    setContributionFormData({ ...contributionFormData, date: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button 
                variant="outline" 
                onClick={() => {
                  setAddContributionOpen(false);
                  setSelectedProject(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleAddContribution} disabled={submitting}>
                {submitting ? "Saving..." : "Add Contribution"}
              </Button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Admin Validation Modal */}
      <Dialog open={adminSignInOpen} onClose={() => setAdminSignInOpen(false)}>
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center p-4">
          <Dialog.Panel className="bg-white rounded-lg max-w-sm w-full mx-auto p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold mb-4">Admin Validation Required</Dialog.Title>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Please enter the admin password to continue.</p>
              
              <input
                type="password"
                placeholder="Enter admin password"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminValidation()}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button variant="outline" onClick={() => setAdminSignInOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAdminValidation}>Validate</Button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}