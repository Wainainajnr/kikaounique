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

        // Prefer to fetch all rows and inspect them so we can detect duplicates
        const { data: memberRows, error: membersError } = await supabase
          .from('members')
          .select('*')
          .eq('id', user.id);

        if (membersError) {
          if (import.meta.env.DEV) console.warn('members fetch error (rows):', membersError);
        }

        // Log the raw shape for development debugging (dev only)
        if (import.meta.env.DEV) console.debug('memberRows raw:', memberRows);

        const rows = Array.isArray(memberRows) ? memberRows : (memberRows ? [memberRows] : []);

        if (rows.length === 0) {
          // No member row found — leave profile null and surface an error later
          if (import.meta.env.DEV) console.warn('No member row found for user id', user.id);
        } else if (rows.length === 1) {
          const m: any = rows[0];
          // Determine admin status via a DB column if present, otherwise session flag
          const dbAdmin = !!( (m as any).is_admin || (m as any).isAdmin || (m as any).role === 'admin');
          const sessionAdmin = sessionStorage.getItem('adminValidated') === '1';
          setIsAdmin(dbAdmin || sessionAdmin);

          setProfile({ id: user.id, email: m.email, name: m.name, phone: m.phone });
        } else {
          // Multiple member rows for the same user id — surface for admin remediation
          if (import.meta.env.DEV) console.warn('Multiple member rows detected for user id', user.id, rows);
          setDuplicateMembers(rows as any[]);
          const m: any = rows[0];
          const dbAdmin = !!( (m as any).is_admin || (m as any).isAdmin || (m as any).role === 'admin');
          const sessionAdmin = sessionStorage.getItem('adminValidated') === '1';
          setIsAdmin(dbAdmin || sessionAdmin);
          setProfile({ id: user.id, email: m.email, name: m.name, phone: m.phone });
        }
      } catch (err: any) {
        setError(err.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("members")
        .update({ 
          name: profile.name, 
          phone: profile.phone, 
          email: profile.email 
        })
        .eq("id", profile.id);
      
      if (error) throw error;
      
      // Show success feedback
      setError(null);
      const successMsg = "Profile updated successfully!";
      setError(successMsg);
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
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
      
      setError(null);
      const successMsg = "New member added successfully!";
      setError(successMsg);
      setTimeout(() => setError(null), 3000);
      
      setNewMember({ name: "", email: "", phone: "" });
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    }
  };

  const checkAdminGate = () => {
    // Prefer authoritative server-side admin flag. If current session already
    // has admin rights (isAdmin), enable the gate immediately. Otherwise,
    // query the members table for an `is_admin` flag for this user.
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

        const { data, error } = await supabase.from('members').select('is_admin').eq('id', user.id).maybeSingle();
        if (error) throw error;
        const dbAdmin = !!(data && ((data as any).is_admin || (data as any).isAdmin || (data as any).role === 'admin'));
        if (dbAdmin) {
          setAdminGate(true);
          setError(null);
          return;
        }

        // Deprecated fallback: accept legacy gatePassword but warn in dev
        if (gatePassword === 'Admin@123') {
          if (import.meta.env.DEV) console.warn('Using legacy admin password fallback — consider migrating to role checks');
          setAdminGate(true);
          setGatePassword('');
          setError(null);
          return;
        }

        setError('You do not have admin privileges');
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

      const payload = { id: user.id, name: (user.user_metadata as any)?.full_name || user.email || 'Unnamed', email: user.email || null, phone: '', joined_at: new Date().toISOString() };

      // retry insert with a small backoff and jitter
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
      // keep the first row, delete the rest
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

  // Hardcoded seed list (admin-only dev helper)
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
  const payload = seedList.map(name => ({ name, email: null, phone: null, joined_at: new Date().toISOString() }));
  const { error } = await (supabase as any).from('members').insert(payload);
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
      // reload profile rows (simple approach)
      setDuplicateMembers(duplicateMembers.filter(r => r.id === keep));
      setError('Consolidated duplicate member rows.');
      setTimeout(() => setError(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to consolidate duplicates');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // If we've finished loading but there's no profile row, show a helpful CTA
  if (!loading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-xl w-full bg-white shadow rounded p-6">
          <h2 className="text-xl font-semibold mb-2">No profile found</h2>
          <p className="mb-4 text-sm text-gray-600">We couldn't find a member profile for your account. You can create one now from your signed-in account details.</p>
          <div className="flex space-x-3">
            <button onClick={createProfileFromAuth} className="px-4 py-2 bg-blue-600 text-white rounded">Create Profile</button>
            <button onClick={handleLogout} className="px-4 py-2 border rounded">Logout</button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Profile</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Tab Navigation */}
        {isAdmin && (
          <div className="flex border-b border-gray-200 mb-6">
            <button
              className={`py-3 px-4 font-medium text-sm ${activeTab === "profile" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
            <button
              className={`py-3 px-4 font-medium text-sm ${activeTab === "admin" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              onClick={() => setActiveTab("admin")}
            >
              Admin Panel
            </button>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className={`mb-6 p-4 rounded-md ${error.includes("successfully") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            <div className="flex">
              <div className="flex-shrink-0">
                {error.includes("successfully") ? (
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {(activeTab === "profile" || !isAdmin) && profile && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Profile Information</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Personal details and account information.</p>
            </div>
            <div className="border-t border-gray-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Full name
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="name"
                        id="name"
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email address
                    </label>
                    <div className="mt-1">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        value={profile.email || ""}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                      Phone number
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        name="phone"
                        id="phone"
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      Account type
                    </label>
                    <div className="mt-1">
                      <div className="flex items-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isAdmin ? "bg-purple-100 text-purple-800" : "bg-green-100 text-green-800"}`}>
                          {isAdmin ? "Administrator" : "Member"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 flex space-x-3">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : "Save Changes"}
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
            
            {/* Password Update Section */}
            <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Change Password</h3>
              <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-4">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    New password
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                      placeholder="Enter new password"
                    />
                  </div>
                  {passwordMessage && (
                    <p className={`mt-2 text-sm ${passwordMessage.includes("successfully") ? "text-green-600" : "text-red-600"}`}>
                      {passwordMessage}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handlePasswordUpdate}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Update Password
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Tab */}
        {isAdmin && activeTab === "admin" && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Admin Panel</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Manage members and system settings.</p>
            </div>
            
            <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
              <h4 className="text-md leading-5 font-medium text-gray-900 mb-4">Add New Member</h4>
              {duplicateMembers.length > 1 && (
                <div className="mb-4 p-3 bg-yellow-50 text-yellow-800 rounded">
                  <div className="flex justify-between items-center">
                    <div>
                      <strong>Warning:</strong> Multiple member rows detected for your account. This can cause inconsistent behavior.
                    </div>
                    <div>
                      <button onClick={deleteDuplicateMembers} className="ml-4 inline-flex items-center px-3 py-1 border rounded bg-yellow-200 text-yellow-900">Delete Duplicates</button>
                    </div>
                  </div>
                </div>
              )}
              {duplicateMembers.length > 1 && (
                <div className="mb-6 bg-white border p-3 rounded">
                  <p className="text-sm mb-2 text-gray-700">Pick which member row to keep (others will be deleted):</p>
                  <div className="space-y-2">
                    {duplicateMembers.map(d => (
                      <label key={d.id} className="flex items-center space-x-3">
                        <input type="radio" name="keep" checked={selectedKeepId === d.id || (!selectedKeepId && duplicateMembers[0].id === d.id)} onChange={() => setSelectedKeepId(d.id)} />
                        <div className="text-sm">
                          <div><strong>{d.name || d.full_name || 'Unnamed'}</strong> <span className="text-xs text-gray-500">({d.id})</span></div>
                          <div className="text-xs text-gray-500">{d.email || 'no-email'} • joined: {d.joined_at || 'n/a'}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <button onClick={() => consolidateDuplicates(selectedKeepId || undefined)} className="inline-flex items-center px-3 py-1 border rounded bg-green-200 text-green-900">Consolidate Duplicates</button>
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
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        placeholder="Enter admin password"
                      />
                    </div>
                  </div>
                  
                  <div className="sm:col-span-4">
                    <button
                      onClick={checkAdminGate}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Verify Admin Access
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="member-name" className="block text-sm font-medium text-gray-700">
                      Full name
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        value={newMember.name}
                        onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="member-email" className="block text-sm font-medium text-gray-700">
                      Email address
                    </label>
                    <div className="mt-1">
                      <input
                        type="email"
                        value={newMember.email}
                        onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        placeholder="Enter email address"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <label htmlFor="member-phone" className="block text-sm font-medium text-gray-700">
                      Phone number
                    </label>
                    <div className="mt-1">
                      <input
                        type="text"
                        value={newMember.phone}
                        onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4">
                    <button
                      onClick={handleAddMember}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Add Member
                    </button>
                  </div>
                </div>
              )}
              {/* Seed members (dev/admin helper) */}
              {adminGate && isAdmin && (
                <div className="border-t mt-6 pt-4">
                  <h4 className="text-md leading-5 font-medium text-gray-900 mb-2">Developer Tools</h4>
                  <p className="text-sm text-gray-600 mb-3">Admin-only developer helpers. Use with caution.</p>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        if (!confirm('Seed members table with 17 hardcoded names? This is a destructive/dev action. Continue?')) return;
                        seedMembers();
                      }}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                    >
                      Seed Members (DEV)
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard && navigator.clipboard.writeText(seedList.join('\n'));
                        setError('Seed list copied to clipboard');
                        setTimeout(() => setError(null), 2000);
                      }}
                      className="inline-flex items-center px-3 py-2 border rounded bg-gray-100 text-gray-800"
                    >
                      Copy Seed List
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