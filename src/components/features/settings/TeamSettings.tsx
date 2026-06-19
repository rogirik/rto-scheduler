import React, { useEffect, useState } from 'react';
import { supabase } from '../../../services/supabase';
import { Users, Trash2, Copy, Shield, UserPlus, ShieldAlert, BookOpen, Eye } from 'lucide-react';

export const TeamSettings = () => {
  const [team, setTeam] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState('member');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: teamMembers, error } = await supabase.rpc('get_team_members');

      if (error) {
        console.error("RPC Error:", error);
        throw error;
      }

      if (teamMembers) {
        setTeam(teamMembers);
        
        const me = teamMembers.find((m: any) => m.id === user.id);
        setMyRole(me?.role || 'member');

        if (me?.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('join_code')
            .eq('id', me.organization_id)
            .maybeSingle(); // Prevents 406 errors
          setJoinCode(org?.join_code || 'No Code');
        }
      }
    } catch (error: any) {
      console.error('Error fetching team:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user from the organization?')) return;
    
    const { error } = await supabase
      .from('user_profiles')
      .update({ organization_id: null, role: 'teacher' })
      .eq('id', userId);

    if (error) {
        alert('Error removing user: ' + error.message);
    } else {
        fetchTeamData(); 
    }
  };

  // --- THE BULLETPROOF ROLE UPDATER ---
  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      // Call the powerful RPC function we just created in SQL
      const { error } = await supabase.rpc('update_team_role', {
          target_user_id: userId,
          new_role: newRole
      });

      if (error) throw error;
      
      // Force a fresh fetch from the database to prove it stuck
      await fetchTeamData();

    } catch (error: any) {
        alert('Error updating role: ' + error.message);
    } finally {
        setUpdatingRole(null);
    }
  };

  const getRoleIcon = (role: string) => {
      switch(role) {
          case 'admin': return <ShieldAlert size={14} className="text-purple-600" />;
          case 'viewer': return <Eye size={14} className="text-slate-500" />;
          default: return <BookOpen size={14} className="text-emerald-600" />;
      }
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading team settings...</div>;

  return (
    <div className="mt-8 pt-8 border-t border-slate-200">
      <div className="flex items-center gap-3 mb-8">
        <Users className="text-blue-600" size={32} />
        <h1 className="text-2xl font-bold text-slate-900">Team Management</h1>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-8 text-white mb-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
            <UserPlus size={20} /> Invite New Members
          </h2>
          <p className="text-blue-100 mb-6 max-w-lg">
            Share this code with your staff. When they sign up, they will enter this code to automatically join your RTO.
          </p>
          <div className="flex items-center gap-4">
            <div className="bg-white/10 border border-white/20 rounded-lg px-6 py-3 text-3xl font-mono tracking-widest font-bold backdrop-blur-sm">
              {joinCode}
            </div>
            <button 
              onClick={() => navigator.clipboard.writeText(joinCode)}
              className="p-3 bg-white text-blue-900 rounded-lg hover:bg-blue-50 transition-colors font-medium flex items-center gap-2 shadow-sm"
            >
              <Copy size={18} /> Copy Code
            </button>
          </div>
        </div>
        <Shield className="absolute -right-10 -bottom-10 text-white/10" size={200} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            Team Members 
            <span className="bg-slate-200 text-slate-600 text-xs px-2 py-1 rounded-full">{team.length}</span>
          </h3>
        </div>
        
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-100">
            <tr>
              <th className="px-6 py-4">User Details</th>
              <th className="px-6 py-4">Access Level</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.map((member) => (
              <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                      {(member.full_name?.[0] || member.email?.[0] || 'U').toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">
                        {member.full_name || 'Staff Member'}
                        {member.id === team.find(m => m.role === myRole)?.id && <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full border border-slate-200">(You)</span>}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {member.email}
                      </div>
                    </div>
                  </div>
                </td>
                
                <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                        {getRoleIcon(member.role || 'teacher')}
                        
                        {myRole === 'admin' && member.id !== team.find(m => m.role === myRole)?.id ? (
                             <select 
                                value={member.role || 'teacher'}
                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                disabled={updatingRole === member.id}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg border outline-none cursor-pointer transition-colors ${
                                    member.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200 focus:ring-purple-500' :
                                    member.role === 'viewer' ? 'bg-slate-50 text-slate-600 border-slate-200 focus:ring-slate-500' :
                                    'bg-emerald-50 text-emerald-700 border-emerald-200 focus:ring-emerald-500'
                                }`}
                            >
                                <option value="admin">Admin (Full Access)</option>
                                <option value="teacher">Teacher (Standard)</option>
                                <option value="viewer">Viewer (Read-Only)</option>
                            </select>
                        ) : (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                member.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                member.role === 'viewer' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                                'bg-emerald-50 text-emerald-700 border-emerald-100'
                            }`}>
                                {member.role || 'TEACHER'}
                            </span>
                        )}
                        {updatingRole === member.id && <span className="text-xs text-blue-500 animate-pulse">Updating...</span>}
                    </div>
                </td>

                <td className="px-6 py-4 text-right">
                  {myRole === 'admin' && member.id !== team.find(m => m.role === myRole)?.id && (
                    <button 
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all border border-transparent hover:border-red-100"
                      title="Remove User"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {team.length === 0 && (
          <div className="p-12 text-center text-slate-400 italic">
            No other team members found. Invite them using the code above!
          </div>
        )}
      </div>
    </div>
  );
};
