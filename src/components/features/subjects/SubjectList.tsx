import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { Subject } from '../../../services/api';
import { Clock, Pencil, Plus, FileText, Loader2, Archive, ArchiveRestore, History } from 'lucide-react';
import { Modal } from '../../shared/Modal';
import { SubjectForm } from './SubjectForm';

export const SubjectList = () => {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      const [subRes, tRes] = await Promise.all([
        ApiService.getSubjects(),
        supabase.from('teachers').select('*') 
      ]);

      let filteredSubjects = subRes || [];

      if (user) {
          let myOrgId = null;
          let role: 'admin' | 'teacher' = 'teacher';

          try {
              const { data: profile } = await supabase
                  .from('user_profiles')
                  .select('organization_id, role')
                  .eq('id', user.id)
                  .single();
                  
              if (profile) {
                  myOrgId = profile.organization_id;
                  if (profile.role === 'admin') role = 'admin';
              }
          } catch (e) {}

          if (!myOrgId) {
              const myKnownTeacher = (tRes.data || []).find(t => t.user_id === user.id && t.organization_id);
              myOrgId = myKnownTeacher?.organization_id;
          }

          setUserRole(role);

          const isMine = (item: any) => {
              if (myOrgId) {
                  if (item.organization_id) return item.organization_id === myOrgId;
                  return item.user_id === user.id;
              }
              return item.user_id === user.id;
          };

          filteredSubjects = filteredSubjects.filter(isMine);
      } else {
          filteredSubjects = [];
      }

      setSubjects(filteredSubjects);
    } catch (error) {
      console.error("Failed to load subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingSubject(null);
    setIsModalOpen(true);
  };

  // NEW: Archive / Restore functionality instead of Hard Delete
  const handleToggleArchive = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    const actionText = newStatus === 'archived' ? 'archive' : 'restore';
    
    if (!confirm(`Are you sure you want to ${actionText} this subject?`)) return;
    
    try {
      setLoading(true);
      const { error } = await supabase.from('subjects').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error(`Failed to ${actionText} subject`, error);
      alert(`Failed to ${actionText} subject. Make sure your 'subjects' database table has a 'status' text column!`);
      setLoading(false);
    }
  };

  // Filter based on the selected tab
  const displayedSubjects = subjects.filter(s => {
      const isArchived = (s as any).status === 'archived';
      return viewMode === 'active' ? !isArchived : isArchived;
  });

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500" size={40} /></div>;

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Subjects</h2>
          <p className="text-slate-500 text-sm">
            {userRole === 'admin' ? 'Manage your course units and modules' : 'View available course units and modules'}
          </p>
        </div>
        
        <div className="flex gap-4 items-center">
            {/* NEW: Active / Archive Toggle Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                    onClick={() => setViewMode('active')}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${viewMode === 'active' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    Active
                </button>
                <button 
                    onClick={() => setViewMode('archived')}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5 ${viewMode === 'archived' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <History size={14} /> Archive
                </button>
            </div>

            {userRole === 'admin' && (
                <button 
                  onClick={handleAdd}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium flex items-center gap-2"
                >
                  <Plus size={18} /> Add Subject
                </button>
            )}
        </div>
      </div>

      {displayedSubjects.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 mb-4">{viewMode === 'active' ? 'No active subjects found.' : 'Your archive is empty.'}</p>
          {userRole === 'admin' && viewMode === 'active' && (
              <button onClick={handleAdd} className="text-blue-600 font-medium hover:underline">
                Create your first subject
              </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {displayedSubjects.map((subject) => (
            <div key={subject.id} className={`bg-white p-4 rounded-lg shadow-sm border transition-all group flex items-center justify-between ${viewMode === 'archived' ? 'border-slate-200 opacity-70' : 'border-slate-200 hover:border-blue-300'}`}>
              
              <div className="flex items-start gap-4">
                <div className={`mt-1 w-10 h-10 rounded-lg flex items-center justify-center ${viewMode === 'archived' ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'}`}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                      {subject.name}
                      {viewMode === 'archived' && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 border border-slate-200">ARCHIVED</span>}
                  </h3>
                  {subject.description && (
                    <p className="text-slate-500 text-sm mt-0.5 line-clamp-1">{subject.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
                  <Clock size={16} className="text-slate-400" />
                  <span className="font-medium">{subject.hours} hrs</span>
                </div>
                
                {userRole === 'admin' && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {viewMode === 'active' ? (
                          <>
                              <button 
                                onClick={() => handleEdit(subject)}
                                className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-colors"
                                title="Edit Subject"
                              >
                                <Pencil size={18} />
                              </button>
                              <button 
                                onClick={() => handleToggleArchive(subject.id, (subject as any).status)}
                                className="text-slate-400 hover:text-orange-600 p-2 hover:bg-orange-50 rounded-full transition-colors"
                                title="Archive Subject"
                              >
                                <Archive size={18} />
                              </button>
                          </>
                      ) : (
                          <button 
                            onClick={() => handleToggleArchive(subject.id, (subject as any).status)}
                            className="text-slate-400 hover:text-emerald-600 p-2 hover:bg-emerald-50 rounded-full transition-colors"
                            title="Restore Subject"
                          >
                            <ArchiveRestore size={18} />
                          </button>
                      )}
                    </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {userRole === 'admin' && (
          <Modal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            title={editingSubject ? "Edit Subject" : "Add New Subject"}
          >
            <SubjectForm 
              initialData={editingSubject} 
              onClose={() => setIsModalOpen(false)} 
              onSuccess={() => {
                loadData();
                setIsModalOpen(false);
              }} 
            />
          </Modal>
      )}
    </div>
  );
};
