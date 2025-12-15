'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { profileAPI, jobdeskAPI } from '@/lib/api';
import { 
  User, Briefcase, CheckCircle, Clock, FileText, 
  Upload, Camera, Building2, Mail, Calendar, Award,
  ChevronRight, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default function KaryawanDashboard({ user }) {
  const [profileData, setProfileData] = useState(null);
  const [jobdesks, setJobdesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [profile, jobdeskResponse] = await Promise.all([
        profileAPI.getProfile(user.id),
        jobdeskAPI.getAll()
      ]);
      
      setProfileData(profile);
      
      // Handle response - it might be array or object with jobdesks property
      const jobdeskData = Array.isArray(jobdeskResponse) 
        ? jobdeskResponse 
        : (jobdeskResponse?.jobdesks || []);
      
      // Filter jobdesks assigned to current user
      const myJobdesks = jobdeskData.filter(j => 
        j.assignedTo?.includes(user.id)
      );
      setJobdesks(myJobdesks);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Hanya file JPEG, PNG, dan WebP yang diperbolehkan');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB');
      return;
    }

    setUploading(true);
    try {
      const result = await profileAPI.uploadPhoto(file);
      toast.success('Foto profile berhasil diupdate!');
      
      // Update profile data
      setProfileData(prev => ({
        ...prev,
        profile: {
          ...prev.profile,
          profilePhoto: result.photoUrl
        }
      }));
      
      // Update user in localStorage
      const storedUser = JSON.parse(localStorage.getItem('user'));
      storedUser.profilePhoto = result.photoUrl;
      localStorage.setItem('user', JSON.stringify(storedUser));
      
      // Reload page to update navbar
      window.location.reload();
    } catch (error) {
      console.error('Failed to upload photo:', error);
      toast.error(error.message || 'Gagal mengupload foto');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Gagal memuat data profile</p>
      </div>
    );
  }

  const { profile, stats, recentAttachments } = profileData;
  const completionRate = stats.total > 0 
    ? Math.round((stats.completed / stats.total) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Saya</h1>
        <p className="text-gray-600 mt-1">Selamat datang kembali, {profile.name}!</p>
      </div>

      {/* Profile Card */}
      <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Profile Photo */}
            <div className="relative group">
              <Avatar className="w-32 h-32 border-4 border-white shadow-lg">
                <AvatarImage src={profile.profilePhoto} alt={profile.name} />
                <AvatarFallback className="bg-blue-300 text-blue-900 text-3xl font-bold">
                  {profile.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              {/* Upload Button Overlay */}
              <label 
                htmlFor="photo-upload" 
                className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                ) : (
                  <Camera className="w-8 h-8 text-white" />
                )}
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={uploading}
              />
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold">{profile.name}</h2>
              <p className="text-blue-100 mt-1 flex items-center justify-center md:justify-start gap-2">
                <Mail className="w-4 h-4" />
                {profile.email}
              </p>
              
              <div className="flex flex-wrap gap-3 mt-4 justify-center md:justify-start">
                {profile.division && (
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                    <Building2 className="w-3 h-3 mr-1" />
                    {profile.division.name}
                  </Badge>
                )}
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  <User className="w-3 h-3 mr-1" />
                  Karyawan
                </Badge>
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  <Calendar className="w-3 h-3 mr-1" />
                  Bergabung {new Date(profile.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long' })}
                </Badge>
              </div>
            </div>

            {/* Completion Rate */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-center min-w-[140px]">
              <Award className="w-8 h-8 mx-auto mb-2" />
              <div className="text-3xl font-bold">{completionRate}%</div>
              <div className="text-sm text-blue-100">Tingkat Penyelesaian</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Jobdesk</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Selesai</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{stats.completed}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Dalam Progress</p>
                <p className="text-3xl font-bold text-yellow-600 mt-1">{stats.in_progress}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-full">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-3xl font-bold text-gray-600 mt-1">{stats.pending}</p>
              </div>
              <div className="bg-gray-100 p-3 rounded-full">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobdesk List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Daftar Jobdesk Saya</CardTitle>
            <Badge variant="secondary">{jobdesks.length} tugas</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {jobdesks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Belum ada jobdesk</p>
              <p className="text-sm mt-2">Anda belum memiliki tugas yang ditugaskan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobdesks.map((job) => {
                // Get user's personal status from progress array
                const userProgress = job.progress?.find(p => p.userId === user.id);
                const userStatus = userProgress?.status || job.status; // Fallback to global status
                
                const getStatusInfo = (status) => {
                  switch (status) {
                    case 'pending':
                      return { label: 'Belum Dimulai', color: 'bg-gray-100 text-gray-700 border-gray-300' };
                    case 'in_progress':
                      return { label: 'Sedang Dikerjakan', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' };
                    case 'completed':
                      return { label: 'Selesai', color: 'bg-green-100 text-green-700 border-green-300' };
                    default:
                      return { label: status, color: 'bg-gray-100 text-gray-700 border-gray-300' };
                  }
                };

                const statusInfo = getStatusInfo(userStatus); // Use personal status
                const isOverdue = job.dueDate && new Date(job.dueDate) < new Date() && userStatus !== 'completed';

                return (
                  <div
                    key={job.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                          <div className={`mt-1 p-2 rounded-lg ${
                            job.status === 'completed' ? 'bg-green-100' :
                            job.status === 'in_progress' ? 'bg-yellow-100' :
                            'bg-gray-100'
                          }`}>
                            <Briefcase className={`w-5 h-5 ${
                              job.status === 'completed' ? 'text-green-600' :
                              job.status === 'in_progress' ? 'text-yellow-600' :
                              'text-gray-600'
                            }`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                              {job.title}
                            </h3>
                            
                            {job.description && (
                              <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                                {job.description}
                              </p>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant="outline" className={statusInfo.color}>
                                {statusInfo.label}
                              </Badge>
                              
                              {job.dueDate && (
                                <div className={`flex items-center gap-1 ${
                                  isOverdue ? 'text-red-600' : 'text-gray-500'
                                }`}>
                                  {isOverdue && <AlertCircle className="w-3 h-3" />}
                                  <Calendar className="w-3 h-3" />
                                  <span>
                                    {new Date(job.dueDate).toLocaleDateString('id-ID', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                  {isOverdue && (
                                    <span className="font-semibold">(Terlambat)</span>
                                  )}
                                </div>
                              )}
                              
                              {job.priority && (
                                <Badge 
                                  variant="secondary"
                                  className={
                                    job.priority === 'high' ? 'bg-red-100 text-red-700' :
                                    job.priority === 'medium' ? 'bg-orange-100 text-orange-700' :
                                    'bg-blue-100 text-blue-700'
                                  }
                                >
                                  {job.priority === 'high' ? 'Prioritas Tinggi' :
                                   job.priority === 'medium' ? 'Prioritas Sedang' :
                                   'Prioritas Rendah'}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Submission Link */}
                            {job.submissionLink && (
                              <div className="mt-3 pt-3 border-t">
                                <a
                                  href={job.submissionLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  <Upload className="w-4 h-4" />
                                  <span className="font-medium">Kumpulkan Tugas di sini</span>
                                  <ChevronRight className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-shrink-0"
                        onClick={() => {
                          // TODO: Navigate to jobdesk detail or open modal
                          toast.info('Fitur detail jobdesk coming soon!');
                        }}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Portfolio / Recent Attachments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Portfolio & Lampiran</CardTitle>
            <Badge variant="secondary">{recentAttachments.length} file</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {recentAttachments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Upload className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Belum ada lampiran yang diupload</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentAttachments.map((attachment) => {
                const isLink = attachment.type === 'link';
                const displayText = isLink ? attachment.url : attachment.fileName;
                const fileUrl = isLink ? attachment.url : `/uploads/${attachment.fileName}`;
                
                return (
                  <a
                    key={attachment.id}
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer group"
                  >
                    <div className={`p-2 rounded ${isLink ? 'bg-purple-100' : 'bg-blue-100'} group-hover:scale-110 transition-transform`}>
                      <FileText className={`w-5 h-5 ${isLink ? 'text-purple-600' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover:text-blue-600">
                        {displayText}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(attachment.createdAt).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                    <Badge variant={isLink ? 'secondary' : 'outline'} className="flex-shrink-0">
                      {isLink ? 'Link' : 'File'}
                    </Badge>
                  </a>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
