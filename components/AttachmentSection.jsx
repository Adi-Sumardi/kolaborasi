'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { attachmentAPI } from '@/lib/api';
import { Plus, Download, Trash2, Link as LinkIcon, FileText, Upload, ExternalLink, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AttachmentSection({ jobdesk, user }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  useEffect(() => {
    loadAttachments();
  }, [jobdesk.id]);

  const loadAttachments = async () => {
    try {
      const res = await attachmentAPI.getAll(jobdesk.id);
      setAttachments(res.attachments || []);
    } catch (error) {
      console.error('Failed to load attachments:', error);
      toast.error('Gagal memuat lampiran');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Ukuran file maksimal 10MB');
      return;
    }

    setUploadFile(file);
  };

  const handleUploadFile = async () => {
    if (!uploadFile) {
      toast.error('Pilih file terlebih dahulu');
      return;
    }

    try {
      setUploading(true);
      await attachmentAPI.createFile(jobdesk.id, uploadFile);
      toast.success('File berhasil diunggah!');
      setShowUploadModal(false);
      setUploadFile(null);
      loadAttachments();
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error.message || 'Gagal mengunggah file');
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = async (e) => {
    e.preventDefault();

    if (!linkUrl) {
      toast.error('Masukkan URL link');
      return;
    }

    // Basic URL validation
    try {
      new URL(linkUrl);
    } catch {
      toast.error('URL tidak valid');
      return;
    }

    try {
      await attachmentAPI.createLink(jobdesk.id, {
        type: 'link',
        url: linkUrl
      });
      toast.success('Link berhasil ditambahkan!');
      setShowLinkModal(false);
      setLinkUrl('');
      loadAttachments();
    } catch (error) {
      console.error('Add link failed:', error);
      toast.error(error.message || 'Gagal menambahkan link');
    }
  };

  const handleDelete = async () => {
    try {
      await attachmentAPI.delete(selectedAttachment.id);
      toast.success('Lampiran berhasil dihapus!');
      setShowDeleteDialog(false);
      setSelectedAttachment(null);
      loadAttachments();
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Gagal menghapus lampiran');
    }
  };

  const handleView = (attachment) => {
    if (attachment.type === 'file') {
      // Check if it's previewable
      const isImage = attachment.fileType?.includes('image');
      const isPdf = attachment.fileType?.includes('pdf');
      const isVideo = attachment.fileType?.includes('video');
      const isAudio = attachment.fileType?.includes('audio');
      const isOffice = attachment.fileType?.includes('word') ||
                       attachment.fileType?.includes('document') ||
                       attachment.fileType?.includes('excel') ||
                       attachment.fileType?.includes('sheet') ||
                       attachment.fileType?.includes('powerpoint') ||
                       attachment.fileType?.includes('presentation') ||
                       attachment.fileName?.match(/\.(docx?|xlsx?|pptx?)$/i);
      const isText = attachment.fileType?.includes('text') ||
                     attachment.fileName?.match(/\.(txt|csv|json|xml|md)$/i);

      if (isImage || isPdf || isVideo || isAudio || isOffice || isText) {
        setPreviewAttachment(attachment);
        setShowPreviewModal(true);
      } else {
        // For other files, open in new tab
        window.open(attachment.url, '_blank');
      }
    } else {
      // For links, open directly
      window.open(attachment.url, '_blank');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType) => {
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
    if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
    if (fileType?.includes('powerpoint') || fileType?.includes('presentation')) return '📽️';
    if (fileType?.includes('image')) return '🖼️';
    if (fileType?.includes('video')) return '🎬';
    if (fileType?.includes('audio')) return '🎵';
    if (fileType?.includes('zip') || fileType?.includes('rar') || fileType?.includes('archive')) return '📦';
    if (fileType?.includes('text')) return '📃';
    return '📎';
  };

  const getLinkPreview = (url) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return '🎥 YouTube';
    if (url.includes('canva.com')) return '🎨 Canva';
    if (url.includes('figma.com')) return '🎨 Figma';
    if (url.includes('drive.google.com')) return '💾 Google Drive';
    if (url.includes('docs.google.com')) return '📝 Google Docs';
    return '🔗 Link';
  };

  const canUpload = jobdesk.assignedTo?.includes(user.id);
  const canDelete = (attachment) => {
    return attachment.userId === user.id || 
           user.role === 'super_admin' || 
           user.role === 'pengurus';
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Memuat lampiran...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-lg">Lampiran</h3>
          <Badge variant="outline">{attachments.length}</Badge>
        </div>
        {canUpload && (
          <div className="flex space-x-2">
            <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Upload className="w-4 h-4 mr-1" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload File</DialogTitle>
                  <DialogDescription>
                    Upload file: PDF, Word, Excel, PPT, gambar, video, audio (Max 10MB)
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="file-upload">Pilih File</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.gif,.mp4,.webm,.mov,.mp3,.wav,.ogg,.txt,.csv"
                    />
                    {uploadFile && (
                      <p className="text-sm text-gray-600 mt-2">
                        {uploadFile.name} ({formatFileSize(uploadFile.size)})
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => {
                      setShowUploadModal(false);
                      setUploadFile(null);
                    }}>
                      Batal
                    </Button>
                    <Button onClick={handleUploadFile} disabled={!uploadFile || uploading}>
                      {uploading ? 'Mengunggah...' : 'Upload'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <LinkIcon className="w-4 h-4 mr-1" />
                  Tambah Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tambah Link</DialogTitle>
                  <DialogDescription>
                    Tambahkan link YouTube, Canva, Google Drive, dll
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddLink} className="space-y-4">
                  <div>
                    <Label htmlFor="link-url">URL Link</Label>
                    <Input
                      id="link-url"
                      type="url"
                      placeholder="https://..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setShowLinkModal(false);
                      setLinkUrl('');
                    }}>
                      Batal
                    </Button>
                    <Button type="submit">Tambah</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Attachments List */}
      {attachments.length === 0 ? (
        <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
          <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>Belum ada lampiran</p>
          {canUpload && (
            <p className="text-sm mt-1">Upload file atau tambah link untuk mulai</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {attachments.map(attachment => (
            <Card key={attachment.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="text-2xl">
                      {attachment.type === 'file' 
                        ? getFileIcon(attachment.fileType)
                        : '🔗'
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      {attachment.type === 'file' ? (
                        <>
                          <p className="font-medium truncate">{attachment.fileName}</p>
                          <p className="text-sm text-gray-600">
                            {formatFileSize(attachment.fileSize)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-blue-600">{getLinkPreview(attachment.url)}</p>
                          <a 
                            href={attachment.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-gray-600 hover:text-blue-600 truncate block"
                          >
                            {attachment.url}
                          </a>
                        </>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Oleh: <span className="font-medium">{attachment.uploaderName}</span> • {new Date(attachment.createdAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2 ml-2">
                    {/* View Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleView(attachment)}
                      title="Lihat"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    
                    {/* Download Button (only for files) */}
                    {attachment.type === 'file' && (
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        title="Download"
                      >
                        <a href={attachment.url} download target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    
                    {/* Delete Button */}
                    {canDelete(attachment) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedAttachment(attachment);
                          setShowDeleteDialog(true);
                        }}
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Lampiran?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus lampiran ini? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{previewAttachment && getFileIcon(previewAttachment.fileType)}</span>
              <span className="truncate">{previewAttachment?.fileName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[75vh]">
            {previewAttachment && (
              <>
                {/* Image Preview */}
                {previewAttachment.fileType?.includes('image') && (
                  <img
                    src={previewAttachment.url}
                    alt={previewAttachment.fileName}
                    className="w-full h-auto max-h-[70vh] object-contain mx-auto"
                  />
                )}

                {/* PDF Preview */}
                {previewAttachment.fileType?.includes('pdf') && (
                  <iframe
                    src={previewAttachment.url}
                    className="w-full h-[75vh]"
                    title="PDF Preview"
                  />
                )}

                {/* Video Preview */}
                {previewAttachment.fileType?.includes('video') && (
                  <video
                    src={previewAttachment.url}
                    controls
                    className="w-full max-h-[70vh] mx-auto"
                  >
                    Browser Anda tidak mendukung video player.
                  </video>
                )}

                {/* Audio Preview */}
                {previewAttachment.fileType?.includes('audio') && (
                  <div className="flex flex-col items-center justify-center py-12 space-y-6">
                    <div className="text-6xl">🎵</div>
                    <p className="text-lg font-medium">{previewAttachment.fileName}</p>
                    <audio
                      src={previewAttachment.url}
                      controls
                      className="w-full max-w-md"
                    >
                      Browser Anda tidak mendukung audio player.
                    </audio>
                  </div>
                )}

                {/* Office Documents (Word, Excel, PowerPoint) via Google Docs Viewer */}
                {(previewAttachment.fileType?.includes('word') ||
                  previewAttachment.fileType?.includes('document') ||
                  previewAttachment.fileType?.includes('excel') ||
                  previewAttachment.fileType?.includes('sheet') ||
                  previewAttachment.fileType?.includes('powerpoint') ||
                  previewAttachment.fileType?.includes('presentation') ||
                  previewAttachment.fileName?.match(/\.(docx?|xlsx?|pptx?)$/i)) && (
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                      <p className="font-medium">Preview menggunakan Google Docs Viewer</p>
                      <p className="text-xs mt-1">Jika preview tidak muncul, file mungkin memerlukan akses publik atau gunakan tombol download.</p>
                    </div>
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewAttachment.url)}&embedded=true`}
                      className="w-full h-[65vh] border rounded"
                      title="Document Preview"
                    />
                  </div>
                )}

                {/* Text Files Preview */}
                {(previewAttachment.fileType?.includes('text') ||
                  previewAttachment.fileName?.match(/\.(txt|csv|json|xml|md)$/i)) &&
                  !previewAttachment.fileType?.includes('word') &&
                  !previewAttachment.fileType?.includes('excel') &&
                  !previewAttachment.fileType?.includes('powerpoint') && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 border rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-2">File teks akan dibuka di tab baru karena keterbatasan browser.</p>
                      <Button onClick={() => window.open(previewAttachment.url, '_blank')}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Buka File Teks
                      </Button>
                    </div>
                  </div>
                )}

                {/* Fallback for unsupported types */}
                {!previewAttachment.fileType?.includes('image') &&
                 !previewAttachment.fileType?.includes('pdf') &&
                 !previewAttachment.fileType?.includes('video') &&
                 !previewAttachment.fileType?.includes('audio') &&
                 !previewAttachment.fileType?.includes('word') &&
                 !previewAttachment.fileType?.includes('document') &&
                 !previewAttachment.fileType?.includes('excel') &&
                 !previewAttachment.fileType?.includes('sheet') &&
                 !previewAttachment.fileType?.includes('powerpoint') &&
                 !previewAttachment.fileType?.includes('presentation') &&
                 !previewAttachment.fileType?.includes('text') &&
                 !previewAttachment.fileName?.match(/\.(docx?|xlsx?|pptx?|txt|csv|json|xml|md)$/i) && (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-5xl mb-4">📎</div>
                    <p className="text-lg font-medium mb-2">Preview tidak tersedia untuk file ini</p>
                    <p className="text-sm text-gray-400 mb-4">Tipe file: {previewAttachment.fileType || 'Unknown'}</p>
                    <Button
                      onClick={() => window.open(previewAttachment.url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Buka di Tab Baru
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            {previewAttachment?.type === 'file' && (
              <Button variant="outline" asChild>
                <a href={previewAttachment.url} download target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            )}
            <Button variant="outline" onClick={() => window.open(previewAttachment?.url, '_blank')}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Buka di Tab Baru
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
