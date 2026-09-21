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

  // BULK SELECTION STATE
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  // Clear selections whenever you switch between Active and Archived tabs
  useEffect(() => {
    setSelectedIds(new Set());
  }, [viewMode]);

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

  // --- BULK ACTION HANDLERS ---
  const handleToggleSelect = (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
  };

  const displayedSubjects = subjects.filter(s => {
      const isArchived = (s as any).status === 'archived';
      return viewMode === 'active' ? !isArchived : isArchived;
  });

  const handleToggleSelectAll = () => {
      if (selectedIds.size === displayedSubjects.length) {
          setSelectedIds(new Set()); // Uncheck all
      } else {
          setSelectedIds(new Set(displayedSubjects.map(s => s.id))); // Check all visible
      }
  };

  const handleBulkArchiveToggle = async (targetStatus: string) => {
      if (selectedIds.size === 0) return;
      const actionText = targetStatus === 'archived' ? 'archive' : 'restore';
      
      if (!confirm(`Are you sure you want to ${actionText} ${selectedIds.size} subjects?`)) return;

      try {
          setLoading(true);
          const idsArray = Array.from(selectedIds);
          
          const { error } = await supabase
              .from('subjects')
              .update({ status: targetStatus })
              .in('id', idsArray);

          if (error) throw error;
          
          setSelectedIds(new Set());
          await loadData();
      } catch (error) {
          console.error(`Failed to bulk ${actionText}`, error);
          alert(`Failed to ${actionText} subjects.`);
          setLoading(false);
      }
  };

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
        <>
          {/* BULK ACTIONS TOOLBAR */}
          {userRole === 'admin' && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedIds.size === displayedSubjects.length && displayedSubjects.length > 0}
                          onChange={handleToggleSelectAll}
                      />
                      <span className="text-sm font-bold text-slate-700">
                          {selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}
                      </span>
                  </label>

                  {selectedIds.size > 0 && (
                      <div className="flex gap-2">
                          {viewMode === 'active' ? (
                              <button 
                                  onClick={() => handleBulkArchiveToggle('archived')} 
                                  className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-orange-200"
                              >
                                  <Archive size={14} /> Bulk Archive
                              </button>
                          ) : (
                              <button 
                                  onClick={() => handleBulkArchiveToggle('active')} 
                                  className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-emerald-200"
                              >
                                  <ArchiveRestore size={14} /> Bulk Restore
                              </button>
                          )}
                      </div>
                  )}
              </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {displayedSubjects.map((subject) => (
              <div key={subject.id} className={`bg-white p-4 rounded-lg shadow-sm border transition-all group flex items-center justify-between ${viewMode === 'archived' ? 'border-slate-200 opacity-70' : selectedIds.has(subject.id) ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200 hover:border-blue-300'}`}>
                
                <div className="flex items-center gap-4">
                  {userRole === 'admin' && (
                      <input 
                          type="checkbox" 
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer ml-1"
                          checked={selectedIds.has(subject.id)}
                          onChange={() => handleToggleSelect(subject.id)}
                      />
                  )}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${viewMode === 'archived' ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'}`}>
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
        </>
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
