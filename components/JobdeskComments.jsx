'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { jobdeskAPI } from '@/lib/api';
import { toast } from 'sonner';
import { MessageSquare, Pencil, Trash2, X, Check, User } from 'lucide-react';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  owner: 'Owner',
  pengurus: 'Pengurus',
  sdm: 'SDM',
  karyawan: 'Karyawan',
};

const ROLE_COLORS = {
  super_admin: 'bg-purple-100 text-purple-800',
  owner: 'bg-purple-100 text-purple-800',
  pengurus: 'bg-blue-100 text-blue-800',
  sdm: 'bg-cyan-100 text-cyan-800',
};

export default function JobdeskComments({
  user,
  jobdeskId,
  taskType = null,
  comments,
  onCommentsChange,
  title = 'Komentar Admin'
}) {
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const canComment = ['super_admin', 'owner', 'pengurus'].includes(user.role);
  const isSuperAdmin = user.role === 'super_admin';

  // Filter to current scope (taskType-specific or jobdesk-level)
  const scoped = (comments || []).filter(c =>
    taskType ? c.taskType === taskType : !c.taskType
  );

  const refresh = async () => {
    try {
      const res = await jobdeskAPI.getComments(jobdeskId);
      onCommentsChange?.(res.comments || []);
    } catch (err) {
      console.error('Failed to refresh comments:', err);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    try {
      setSubmitting(true);
      await jobdeskAPI.createComment(jobdeskId, newComment.trim(), taskType);
      setNewComment('');
      toast.success('Komentar dikirim');
      await refresh();
    } catch (err) {
      console.error('Failed to create comment:', err);
      toast.error(err.message || 'Gagal mengirim komentar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (commentId) => {
    if (!editText.trim()) return;
    try {
      await jobdeskAPI.updateComment(jobdeskId, commentId, editText.trim());
      toast.success('Komentar diperbarui');
      setEditingId(null);
      setEditText('');
      await refresh();
    } catch (err) {
      console.error('Failed to update comment:', err);
      toast.error(err.message || 'Gagal memperbarui komentar');
    }
  };

  const handleDelete = async (commentId) => {
    if (!confirm('Hapus komentar ini?')) return;
    try {
      await jobdeskAPI.deleteComment(jobdeskId, commentId);
      toast.success('Komentar dihapus');
      await refresh();
    } catch (err) {
      console.error('Failed to delete comment:', err);
      toast.error(err.message || 'Gagal menghapus komentar');
    }
  };

  // Hide entire section if karyawan and no comments
  if (!canComment && scoped.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gray-500" />
        <h4 className="text-sm font-medium text-gray-700">
          {title}
          {scoped.length > 0 && (
            <span className="ml-1 text-gray-500 font-normal">({scoped.length})</span>
          )}
        </h4>
      </div>

      {/* Comments list */}
      {scoped.length > 0 && (
        <div className="space-y-2">
          {scoped.map(c => {
            const isAuthor = c.commentedBy === user.id;
            const canEdit = isAuthor;
            const canDelete = isAuthor || isSuperAdmin;
            const isEditing = editingId === c.id;
            const roleColor = ROLE_COLORS[c.commenterRole] || 'bg-gray-100 text-gray-800';

            return (
              <div key={c.id} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <User className="w-3 h-3 text-gray-500" />
                    <span className="font-medium text-gray-700">{c.commenterName || c.commenterEmail || 'Unknown'}</span>
                    {c.commenterRole && (
                      <Badge className={`${roleColor} text-xs`}>{ROLE_LABELS[c.commenterRole] || c.commenterRole}</Badge>
                    )}
                    <span className="text-gray-400">
                      {new Date(c.createdAt).toLocaleString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                    {c.updatedAt && c.updatedAt !== c.createdAt && (
                      <span className="text-gray-400 italic">(diedit)</span>
                    )}
                  </div>
                  {(canEdit || canDelete) && !isEditing && (
                    <div className="flex gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => { setEditingId(c.id); setEditText(c.comment); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-2 mt-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditingId(null); setEditText(''); }}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Batal
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(c.id)}
                        disabled={!editText.trim()}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Simpan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.comment}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New comment form (admin only) */}
      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={taskType ? `Tulis komentar untuk task type ini...` : `Tulis komentar untuk jobdesk ini...`}
            rows={2}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? 'Mengirim...' : 'Kirim Komentar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
