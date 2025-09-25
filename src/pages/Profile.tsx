import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabaseClient";
import { useNavigate } from "react-router-dom";

interface ProfileData {
  id: string;
  email: string | null;
  name: string;
  phone: string;
}

interface NewMember {
  name: string;
  email: string;
  phone: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [newMember, setNewMember] = useState<NewMember>({
    name: "",
    email: "",
    phone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [duplicateMembers, setDuplicateMembers] = useState<any[]>([]);
  const [selectedKeepId, setSelectedKeepId] = useState<string | null>(null);
  const [adminGate, setAdminGate] = useState(false);
  const [gatePassword, setGatePassword] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [tempProfile, setTempProfile] = useState<ProfileData | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          navigate("/login");
          return;
        }

        // Fetch member data without expecting is_admin column
        const { data: memberRows, error: membersError } = await supabase
          .from('members')
          .select('id, name, email, phone')
          .eq('id', user.id);

        if (membersError) {
          if (import.meta.env.DEV) console.warn('members fetch error:', membersError);
        }

        const rows = Array.isArray(memberRows) ? memberRows : (memberRows ? [memberRows] : []);

        if (rows.length === 0) {
          if (import.meta.env.DEV) console.warn('No member row found for user id', user.id);
        } else if (rows.length === 1) {
          const m = rows[0];
          // Check admin status via session storage or other means since is_admin column doesn't exist
          const sessionAdmin = sessionStorage.getItem('adminValidated') === '1';
          setIsAdmin(sessionAdmin);

          setProfile({ id: user.id, email: m.email, name: m.name, phone: m.phone });
          setTempProfile({ id: user.id, email: m.email, name: m.name, phone: m.phone });
        } else {
          if (import.meta.env.DEV) console.warn('Multiple member rows detected for user id', user.id, rows);
          setDuplicateMembers(rows);
          const m = rows[0];
          const sessionAdmin = sessionStorage.getItem('adminValidated') === '1';
          setIsAdmin(sessionAdmin);
          setProfile({ id: user.id, email: m.email, name: m.name, phone: m.phone });
          setTempProfile({ id: user.id, email: m.email, name: m.name, phone: m.phone });
        }
      } catch (err: any) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleEditProfile = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (profile) setTempProfile({ ...profile });
    setPassword("");
    setError(null);
  };

  const handleSaveProfile = async () => {
    if (!tempProfile) return;
    if (!confirm("Are you sure you want to save changes?")) return;
    setSaving(true);
    try {
      // Validate inputs
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (tempProfile.email && !emailRegex.test(tempProfile.email)) {
        throw new Error("Invalid email format");
      }
      const phoneRegex = /^\+?[\d\s-]{7,15}$/;
      if (tempProfile.phone && !phoneRegex.test(tempProfile.phone)) {
        throw new Error("Invalid phone number format");
      }
      
      // Update profile
      const { error: profileError } = await supabase
        .from("members")
        .update({
          name: tempProfile.name,
          phone: tempProfile.phone,
          email: tempProfile.email,
        })
        .eq("id", tempProfile.id);
      
      if (profileError) throw profileError;
      
      // Update password
      if (password) {
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw passwordError;
      }
      
      setProfile({ ...tempProfile });
      setIsEditing(false);
      setPassword("");
      setError("Profile and password updated successfully!");
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update profile or password");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!password) {
      setPasswordMessage("Please enter a new password");
      return;
    }
    
    if (password.length < 6) {
      setPasswordMessage("Password must be at least 6 characters");
      return;
    }
    
    setPasswordMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPasswordMessage("Password updated successfully!");
      setPassword("");
    } catch (err: any) {
      setPasswordMessage(err.message || "Failed to update password");
    }
  };

  const handleAddMember = async () => {
    if (!adminGate) {
      setError("You must enter Admin password to add a member!");
      return;
    }
    
    if (!newMember.name || !newMember.email) {
      setError("Name and email are required");
      return;
    }
    
    try {
      const { error } = await supabase.from("members").insert([{ 
        ...newMember,
        joined_at: new Date().toISOString()
      }]);
      
      if (error) throw error;
      
      setError("New member added successfully!");
      setTimeout(() => setError(null), 3000);
      
      setNewMember({ name: "", email: "", phone: "" });
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    }
  };

  const checkAdminGate = () => {
    (async () => {
      if (isAdmin) {
        setAdminGate(true);
        setError(null);
        return;
      }

      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          setError('Not authenticated');
          return;
        }

        // Since is_admin column doesn't exist, use password fallback
        if (gatePassword === 'Admin@123') {
          if (import.meta.env.DEV) console.warn('Using admin password fallback');
          setAdminGate(true);
          setGatePassword('');
          setError(null);
          sessionStorage.setItem('adminValidated', '1');
          setIsAdmin(true);
          return;
        }

        setError('Invalid admin password');
      } catch (err: any) {
        setError(err.message || 'Failed to verify admin status');
      }
    })();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const createProfileFromAuth = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setError('Not authenticated');
        return;
      }

      // check existing
      try {
        const { data: existing } = await supabase.from('members').select('id').eq('id', user.id).limit(1);
        if (Array.isArray(existing) && existing.length > 0) {
          setError('Profile already exists. Reloading...');
          setTimeout(() => setError(null), 1500);
          window.location.reload();
          return;
        }
      } catch (e) {
        console.debug('createProfileFromAuth: check existing error', e);
      }

      const payload = { 
        id: user.id, 
        name: (user.user_metadata as any)?.full_name || user.email || 'Unnamed', 
        email: user.email || null, 
        phone: '', 
        joined_at: new Date().toISOString() 
      };

      let attempts = 0;
      let wait = 300;
      const maxAttempts = 6;
      while (attempts < maxAttempts) {
        attempts++;
        const { error } = await supabase.from('members').insert([payload]);
        if (!error) {
          setError('Profile created. Reloading...');
          setTimeout(() => setError(null), 1500);
          setLoading(true);
          window.location.reload();
          return;
        }

        const msg = (error as any).message || '';
        const isFK = /foreign key|profiles_id_fkey|violates foreign key/gi.test(msg);
        if (!isFK) {
          setError(error.message || 'Failed to create profile');
          return;
        }

        const jitter = Math.floor(Math.random() * 200);
        const waitFor = wait + jitter;
        console.debug(`createProfileFromAuth: FK error attempt ${attempts}, retrying in ${waitFor}ms`, msg);
        await new Promise((r) => setTimeout(r, waitFor));
        wait *= 2;
      }

      setError('Timed out creating profile. Please try again or contact support.');
    } catch (err: any) {
      setError(err.message || 'Failed to create profile');
    }
  };

  const deleteDuplicateMembers = async () => {
    if (!isAdmin || duplicateMembers.length <= 1) return;
    try {
      const idsToDelete = duplicateMembers.slice(1).map(r => r.id);
      const { error } = await supabase.from('members').delete().in('id', idsToDelete);
      if (error) throw error;
      setDuplicateMembers([duplicateMembers[0]]);
      setError('Duplicate member rows deleted (kept first).');
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete duplicate member rows');
    }
  };

  const seedList = [
    'Geoffrey mwangi',
    'Eric waithira',
    'Stephen Njoroge',
    'Boniface wambua',
    'Chris G',
    'Ashley Mungai',
    'Kelly Njuguna',
    'Samuel Muturi',
    'John Njeri',
    'David Koigi',
    'Mary Njeri',
    'Antony Kibunyi',
    'Catherine Chege',
    'Stephen Macharia',
    'Peter Muigai',
    'Asaf njuguna',
    'Kenneth Kamau'
  ];

  const seedMembers = async () => {
    if (!isAdmin) {
      setError('Admin privileges required to seed members');
      return;
    }

    try {
      const payload = seedList.map(name => ({ 
        name, 
        email: null, 
        phone: '', 
        joined_at: new Date().toISOString() 
      }));
      const { error } = await supabase.from('members').insert(payload);
      if (error) throw error;
      setError(`Seeded ${seedList.length} members`);
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to seed members');
    }
  };

  const consolidateDuplicates = async (keepId?: string) => {
    if (!isAdmin || duplicateMembers.length <= 1) return;
    const keep = keepId || selectedKeepId || duplicateMembers[0].id;
    const toDelete = duplicateMembers.filter(r => r.id !== keep).map(r => r.id);
    try {
      const { error } = await supabase.from('members').delete().in('id', toDelete);
      if (error) throw error;
      setDuplicateMembers(duplicateMembers.filter(r => r.id === keep));
      setError('Consolidated duplicate member rows.');
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to consolidate duplicates');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
        <div className="max-w-xl w-full bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-800 mb-2">No Profile Found</h2>
          <p className="mb-4 text-sm text-gray-600">
            We couldn't find a member profile for your account. Create one now from your signed-in account details.
          </p>
          <div className="flex space-x-3">
            <button
              onClick={createProfileFromAuth}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Create Profile
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg"
            >
              Logout
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-800">User Profile</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your account settings and preferences
          </p>
        </div>

        {isAdmin && (
          <div className="flex border-b border-gray-200 mb-6">
            <button
              className={`py-3 px-4 font-medium text-sm ${
                activeTab === "profile"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
            <button
              className={`py-3 px-4 font-medium text-sm ${
                activeTab === "admin"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("admin")}
            >
              Admin Panel
            </button>
          </div>
        )}

        {error && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              error.includes("successfully")
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            <div className="flex">
              <div className="flex-shrink-0">
                {error.includes("successfully") ? (
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {(activeTab === "profile" || !isAdmin) && profile && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-blue-800">Personal Details</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Update your personal information and account settings.
              </p>
            </div>
            <div className="border-t border-gray-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Full Name
                    </label>
                    <div className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          name="name"
                          id="name"
                          value={tempProfile?.name || ""}
                          onChange={(e) =>
                            setTempProfile({ ...tempProfile!, name: e.target.value })
                          }
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                          placeholder="Enter full name"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{profile.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email Address
                    </label>
                    <div className="mt-1">
                      {isEditing ? (
                        <input
                          id="email"
                          name="email"
                          type="email"
                          value={tempProfile?.email || ""}
                          onChange={(e) =>
                            setTempProfile({ ...tempProfile!, email: e.target.value })
                          }
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                          placeholder="Enter email address"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{profile.email || "No email provided"}</p>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                      Phone Number
                    </label>
                    <div className="mt-1">
                      {isEditing ? (
                        <input
                          type="text"
                          name="phone"
                          id="phone"
                          value={tempProfile?.phone || ""}
                          onChange={(e) =>
                            setTempProfile({ ...tempProfile!, phone: e.target.value })
                          }
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                          placeholder="Enter phone number"
                        />
                      ) : (
                        <p className="text-sm text-gray-900">{profile.phone || "No phone provided"}</p>
                      )}
                    </div>
                  </div>
                  {isEditing && (
                    <div className="sm:col-span-4">
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        New Password
                      </label>
                      <div className="mt-1">
                        <input
                          id="password"
                          name="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                          placeholder="Enter new password (optional)"
                        />
                      </div>
                    </div>
                  )}
                  <div className="sm:col-span-4">
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      Account Type
                    </label>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          isAdmin ? "bg-purple-100 text-purple-800" : "bg-green-100 text-green-800"
                        }`}
                      >
                        {isAdmin ? "Administrator" : "Member"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex space-x-3">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? (
                          <>
                            <svg
                              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Saving...
                          </>
                        ) : (
                          "Save Changes"
                        )}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleEditProfile}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                    >
                      Edit Profile
                    </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isAdmin && activeTab === "admin" && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-blue-800">Admin Panel</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Manage members and system settings.
              </p>
            </div>
            <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
              <h4 className="text-md font-medium text-gray-900 mb-4">Add New Member</h4>
              {duplicateMembers.length > 1 && (
                <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <strong>Warning:</strong> Multiple member rows detected for your account.
                    </div>
                    <button
                      onClick={deleteDuplicateMembers}
                      className="ml-4 px-3 py-1 bg-yellow-200 text-yellow-900 rounded"
                    >
                      Delete Duplicates
                    </button>
                  </div>
                </div>
              )}
              {duplicateMembers.length > 1 && (
                <div className="mb-6 bg-white border p-3 rounded-lg">
                  <p className="text-sm mb-2 text-gray-700">
                    Pick which member row to keep (others will be deleted):
                  </p>
                  <div className="space-y-2">
                    {duplicateMembers.map(d => (
                      <label key={d.id} className="flex items-center space-x-3">
                        <input
                          type="radio"
                          name="keep"
                          checked={selectedKeepId === d.id || (!selectedKeepId && duplicateMembers[0].id === d.id)}
                          onChange={() => setSelectedKeepId(d.id)}
                        />
                        <div className="text-sm">
                          <div>
                            <strong>{d.name || 'Unnamed'}</strong>{' '}
                            <span className="text-xs text-gray-500">({d.id})</span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {d.email || 'no-email'} • joined: {d.joined_at || 'n/a'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => consolidateDuplicates(selectedKeepId || undefined)}
                      className="px-3 py-1 bg-green-200 text-green-900 rounded"
                    >
                      Consolidate Duplicates
                    </button>
                  </div>
                </div>
              )}
              {!adminGate ? (
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700">
                      Admin Password
                    </label>
                    <div className="mt-1">
                      <input
                        type="password"
                        value={gatePassword}
                        onChange={(e) => setGatePassword(e.target.value)}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                        placeholder="Enter admin password"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <button
                      onClick={checkAdminGate}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                    >
                      Verify Admin Access
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="member-name" className="block text-sm font-medium text-gray-700">
                      Full Name
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        value={newMember.name}
                        onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="member-email" className="block text-sm font-medium text-gray-700">
                      Email Address
                    </label>
                    <div className="mt-1">
                      <input
                        type="email"
                        value={newMember.email}
                        onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                        placeholder="Enter email address"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="member-phone" className="block text-sm font-medium text-gray-700">
                      Phone Number
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        value={newMember.phone}
                        onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-lg p-2 border"
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-4">
                    <button
                      onClick={handleAddMember}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg"
                    >
                      Add Member
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}