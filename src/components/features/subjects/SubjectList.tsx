import React, { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import { supabase } from '../../../services/supabase';
import type { Subject } from '../../../services/api';
import { Clock, Pencil, Plus, FileText, Loader2 } from 'lucide-react';
import { Modal } from '../../shared/Modal';
import { SubjectForm } from './SubjectForm';

export const SubjectList = () => {
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  
  const [userRole, setUserRole] = useState<'admin' | 'teacher'>('teacher');
  
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
        
        {userRole === 'admin' && (
            <button 
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium flex items-center gap-2"
            >
              <Plus size={18} /> Add Subject
            </button>
        )}
      </div>

      {subjects.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 mb-4">No subjects found.</p>
          {userRole === 'admin' && (
              <button onClick={handleAdd} className="text-blue-600 font-medium hover:underline">
                Create your first subject
              </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {subjects.map((subject) => (
            <div key={subject.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 transition-all group flex items-center justify-between">
              
              <div className="flex items-start gap-4">
                <div className="mt-1 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{subject.name}</h3>
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
                    <button 
                      onClick={() => handleEdit(subject)}
                      className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Pencil size={18} />
                    </button>
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