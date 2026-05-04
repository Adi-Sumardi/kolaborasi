'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { rekapAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Search, FileText, Building2, Download, Eye, Paperclip, ArrowLeft,
  CheckCircle2, Clock, AlertTriangle, User
} from 'lucide-react';

const TASK_LABELS = {
  pph_21: 'PPh 21', pph_unifikasi: 'PPh Unifikasi', pph_25: 'PPh 25',
  ppn: 'PPN', pph_badan: 'PPh Badan', pph_05: 'PPh 0,5%', rekap_laporan: 'Rekap Laporan'
};

function isPreviewable(mimeType, fileName) {
  if (!mimeType && !fileName) return false;
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/') || m === 'application/pdf') return true;
  const lower = (fileName || '').toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|pdf)$/.test(lower);
}

function isImage(mimeType, fileName) {
  const m = (mimeType || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  return /\.(png|jpg|jpeg|gif|webp)$/.test((fileName || '').toLowerCase());
}

export default function RekapJobdeskPage({ user }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    const t = setTimeout(() => loadList(), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = async () => {
    try {
      setLoading(true);
      const res = await rekapAPI.getKaryawan(search);
      setList(res.karyawan || []);
    } catch (err) {
      console.error('Failed to load rekap list:', err);
      toast.error('Gagal memuat rekap karyawan');
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (k) => {
    setSelectedUser(k);
    setDetailLoading(true);
    try {
      const res = await rekapAPI.getKaryawanDetail(k.id);
      setDetail(res);
    } catch (err) {
      console.error('Failed to load detail:', err);
      toast.error('Gagal memuat detail karyawan');
      setSelectedUser(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedUser(null);
    setDetail(null);
  };

  // Detail view
  if (selectedUser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={closeDetail}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Kembali
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{selectedUser.name}</h1>
            <p className="text-sm text-gray-600">{selectedUser.email}</p>
          </div>
        </div>

        {detailLoading ? (
          <div className="text-center py-12 text-gray-500">Memuat detail...</div>
        ) : detail ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-gray-500">Total Klien</div>
                  <div className="text-2xl font-bold">{detail.stats.totalClients}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-gray-500">Total Jobdesk</div>
                  <div className="text-2xl font-bold">{detail.stats.totalJobdesks}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-gray-500">Total Lampiran</div>
                  <div className="text-2xl font-bold">{detail.stats.totalSubmissions}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs text-gray-500">Lampiran Terlambat</div>
                  <div className="text-2xl font-bold text-orange-600">{detail.stats.lateSubmissions}</div>
                </CardContent>
              </Card>
            </div>

            {/* Clients with jobdesks */}
            {detail.clients.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  Belum ada jobdesk
                </CardContent>
              </Card>
            )}

            {detail.clients.map((client, idx) => (
              <Card key={client.clientId || `nc-${idx}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        {client.clientName}
                      </CardTitle>
                      <CardDescription className="space-y-0.5">
                        {client.clientGroupName && (
                          <div>Group PT: <span className="font-medium">{client.clientGroupName}</span></div>
                        )}
                        {client.clientNpwp && <div>NPWP: {client.clientNpwp}</div>}
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{client.jobdesks.length} jobdesk</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {client.jobdesks.map(jd => (
                    <div key={jd.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {jd.title}
                            {jd.status === 'completed' && (
                              <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Selesai</Badge>
                            )}
                            {jd.status === 'in_progress' && (
                              <Badge className="bg-blue-100 text-blue-800"><Clock className="w-3 h-3 mr-1" />Berjalan</Badge>
                            )}
                            {jd.status === 'pending' && (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </div>
                          {jd.description && (
                            <p className="text-sm text-gray-600 mt-1">{jd.description}</p>
                          )}
                          <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                            {jd.dueDate && <span>Deadline: {new Date(jd.dueDate).toLocaleDateString('id-ID')}</span>}
                            {jd.periodMonth && <span>Periode: {jd.periodMonth}/{jd.periodYear}</span>}
                            {jd.taskTypes.length > 0 && (
                              <span>Task: {jd.taskTypes.map(t => TASK_LABELS[t] || t).join(', ')}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Submissions */}
                      {jd.submissions.length > 0 && (
                        <div className="border-t pt-3">
                          <div className="text-xs font-medium text-gray-700 mb-2">
                            Lampiran ({jd.submissions.length})
                          </div>
                          <div className="space-y-2">
                            {jd.submissions.map(sub => (
                              <div key={sub.id} className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {sub.taskType && (
                                      <Badge variant="secondary" className="text-xs">
                                        {TASK_LABELS[sub.taskType] || sub.taskType}
                                      </Badge>
                                    )}
                                    {sub.isLate && (
                                      <Badge className="bg-orange-100 text-orange-800 text-xs">
                                        <AlertTriangle className="w-3 h-3 mr-0.5" />
                                        Telat {sub.lateDays} hari
                                      </Badge>
                                    )}
                                  </div>
                                  {sub.submissionType === 'link' ? (
                                    <a href={sub.content} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                                      {sub.content}
                                    </a>
                                  ) : sub.submissionType === 'file' ? (
                                    <div className="text-sm flex items-center gap-1">
                                      <Paperclip className="w-3 h-3" />
                                      <span className="truncate">{sub.fileName || 'File'}</span>
                                      {sub.fileSize && <span className="text-gray-400 text-xs">({(sub.fileSize / 1024).toFixed(1)} KB)</span>}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-700">{sub.content}</p>
                                  )}
                                  {sub.notes && (
                                    <p className="text-xs text-gray-500 italic mt-0.5">📝 {sub.notes}</p>
                                  )}
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {new Date(sub.createdAt).toLocaleString('id-ID', {
                                      day: 'numeric', month: 'short', year: 'numeric',
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                                {sub.submissionType === 'file' && sub.content && (
                                  <div className="flex gap-1">
                                    {isPreviewable(sub.mimeType, sub.fileName) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPreviewFile(sub)}
                                        title="Preview"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </Button>
                                    )}
                                    <a href={sub.content} download={sub.fileName || true}>
                                      <Button variant="ghost" size="sm" title="Download">
                                        <Download className="w-4 h-4" />
                                      </Button>
                                    </a>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </>
        ) : null}

        {/* File Preview Dialog */}
        <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                {previewFile?.fileName || 'Preview'}
              </DialogTitle>
            </DialogHeader>
            {previewFile && (
              <div className="bg-gray-100 rounded p-2 max-h-[70vh] overflow-auto flex items-center justify-center">
                {isImage(previewFile.mimeType, previewFile.fileName) ? (
                  <img src={previewFile.content} alt={previewFile.fileName} className="max-w-full max-h-[65vh] object-contain" />
                ) : (
                  <iframe src={previewFile.content} className="w-full h-[65vh]" title="preview" />
                )}
              </div>
            )}
            {previewFile && (
              <div className="flex justify-end">
                <a href={previewFile.content} download={previewFile.fileName || true}>
                  <Button>
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </a>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Rekap Hasil Jobdesk</h1>
        <p className="text-gray-600 mt-1">Rekap kerja karyawan, klien yang ditangani, dan lampiran</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Daftar Karyawan
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Cari nama atau email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Memuat data...</div>
          ) : list.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {search ? 'Tidak ada hasil pencarian' : 'Belum ada karyawan'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Divisi</TableHead>
                    <TableHead className="text-center">Total Jobdesk</TableHead>
                    <TableHead className="text-center">Selesai</TableHead>
                    <TableHead className="text-center">Berjalan</TableHead>
                    <TableHead className="text-center">Klien</TableHead>
                    <TableHead className="text-center">Lampiran</TableHead>
                    <TableHead className="text-center">Telat</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map(k => (
                    <TableRow key={k.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openDetail(k)}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          {k.name}
                        </div>
                        <div className="text-xs text-gray-500">{k.email}</div>
                      </TableCell>
                      <TableCell>{k.divisionName || '-'}</TableCell>
                      <TableCell className="text-center font-medium">{k.totalJobdesks}</TableCell>
                      <TableCell className="text-center text-green-600">{k.completedJobdesks}</TableCell>
                      <TableCell className="text-center text-blue-600">{k.inProgressJobdesks}</TableCell>
                      <TableCell className="text-center">{k.totalClients}</TableCell>
                      <TableCell className="text-center">{k.totalSubmissions}</TableCell>
                      <TableCell className="text-center">
                        {k.lateSubmissions > 0 ? (
                          <Badge className="bg-orange-100 text-orange-800">{k.lateSubmissions}</Badge>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">Detail</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
