import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, File, CheckCircle, AlertCircle, Clock, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { offlineStorage, type OfflineFile } from "@/lib/offlineStorage";

interface FileInfo {
  id: string;
  filename: string;
  file_size: number;
  total_chunks: number;
  upload_status: string;
  created_at: string;
  expires_at: string;
}

interface DownloadProgress {
  totalChunks: number;
  completedChunks: number;
  percentage: number;
  status: 'downloading' | 'assembling' | 'completed' | 'failed';
}

interface FileDownloadProps {
  shareToken: string;
}

export const FileDownload = ({ shareToken }: FileDownloadProps) => {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineFile, setOfflineFile] = useState<OfflineFile | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    fetchFileInfo();
    checkOfflineCache();
  }, [shareToken]);

  const fetchFileInfo = async () => {
    try {
      // Check if it's an offline file first
      if (shareToken.startsWith('offline_')) {
        const cachedFile = await offlineStorage.getOfflineFile(shareToken);
        if (cachedFile) {
          // Create a mock FileInfo object for offline files
          setFileInfo({
            id: shareToken,
            filename: cachedFile.filename,
            file_size: cachedFile.size,
            total_chunks: 1,
            upload_status: 'completed',
            created_at: cachedFile.downloadedAt.toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
          });
          setOfflineFile(cachedFile);
          setLoading(false);
          return;
        } else {
          throw new Error('Offline file not found or expired');
        }
      }

      // For online files, fetch from server
      const { data, error } = await supabase
        .rpc('get_shared_file_info', { token: shareToken });

      if (error) throw error;

      // The function returns an array, get the first (and only) result
      if (data && data.length > 0) {
        setFileInfo(data[0]);
      } else {
        throw new Error('File not found or expired');
      }
    } catch (error) {
      console.error('Error fetching file info:', error);
      toast.error('File not found, expired, or invalid share link');
    } finally {
      setLoading(false);
    }
  };

  const checkOfflineCache = async () => {
    try {
      // For offline files, check using the share token directly
      if (shareToken.startsWith('offline_')) {
        const cachedFile = await offlineStorage.getOfflineFile(shareToken);
        setOfflineFile(cachedFile);
        return;
      }
      
      // For online files, check if file is cached offline using share token as ID
      const cachedFile = await offlineStorage.getOfflineFile(`share_${shareToken}`);
      setOfflineFile(cachedFile);
    } catch (error) {
      console.error('Error checking offline cache:', error);
    }
  };

  const downloadChunks = async (): Promise<Blob[]> => {
    if (!fileInfo) throw new Error('No file info available');

    const { data: chunks, error } = await supabase
      .from('file_chunks')
      .select('*')
      .eq('file_id', fileInfo.id)
      .order('chunk_number');

    if (error) throw error;

    const downloadedChunks: Blob[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      const { data: chunkData, error: downloadError } = await supabase.storage
        .from('file-chunks')
        .download(chunk.storage_path);

      if (downloadError) throw downloadError;

      downloadedChunks.push(chunkData);
      
      // Update progress
      const completedChunks = i + 1;
      const percentage = Math.round((completedChunks / chunks.length) * 100);
      
      setDownloadProgress(prev => prev ? {
        ...prev,
        completedChunks,
        percentage
      } : null);
    }

    return downloadedChunks;
  };

  const assembleFile = async (chunks: Blob[], filename: string): Promise<void> => {
    setDownloadProgress(prev => prev ? { ...prev, status: 'assembling' } : null);
    
    const assembledFile = new Blob(chunks);
    
    // Save to offline cache
    if (fileInfo) {
      try {
        const offlineCacheFile: OfflineFile = {
          id: `share_${shareToken}`,
          filename: filename,
          file: assembledFile,
          downloadedAt: new Date(),
          shareToken: shareToken,
          size: assembledFile.size
        };
        
        await offlineStorage.saveOfflineFile(offlineCacheFile);
        setOfflineFile(offlineCacheFile);
        
        toast.success('File cached for offline access!', {
          description: 'You can now access this file even when offline'
        });
      } catch (error) {
        console.error('Failed to cache file offline:', error);
        // Don't fail the download if caching fails
      }
    }
    
    const url = URL.createObjectURL(assembledFile);
    
    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    setDownloadProgress(prev => prev ? { ...prev, status: 'completed', percentage: 100 } : null);
    toast.success('File downloaded successfully!');
  };

  const startDownload = async () => {
    if (!fileInfo) return;

    setDownloadProgress({
      totalChunks: fileInfo.total_chunks,
      completedChunks: 0,
      percentage: 0,
      status: 'downloading'
    });

    try {
      const chunks = await downloadChunks();
      await assembleFile(chunks, fileInfo.filename);
    } catch (error) {
      console.error('Download error:', error);
      setDownloadProgress(prev => prev ? { ...prev, status: 'failed' } : null);
      toast.error('Failed to download file');
    }
  };

  const downloadOfflineFile = () => {
    if (!offlineFile) return;
    
    try {
      const url = URL.createObjectURL(offlineFile.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = offlineFile.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Downloaded from offline cache!');
    } catch (error) {
      console.error('Failed to download offline file:', error);
      toast.error('Failed to download offline file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (): boolean => {
    if (!fileInfo) return false;
    return new Date() > new Date(fileInfo.expires_at);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading file information...</div>
        </CardContent>
      </Card>
    );
  }

  if (!fileInfo) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-500">
            File not found or invalid share link
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <File className="h-5 w-5" />
            {fileInfo.filename}
            {shareToken.startsWith('offline_') && (
              <div className="flex items-center gap-1 ml-auto">
                <HardDrive className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-600">Offline File</span>
              </div>
            )}
          </CardTitle>
          <CardDescription>
            Size: {formatFileSize(fileInfo.file_size)} • 
            {shareToken.startsWith('offline_') ? 'Stored locally' : `Chunks: ${fileInfo.total_chunks} • Uploaded: ${formatDate(fileInfo.created_at)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fileInfo.upload_status !== 'completed' && (
              <div className="flex items-center gap-2 text-yellow-600">
                <Clock className="h-4 w-4" />
                <span>File is still being uploaded...</span>
              </div>
            )}
            
            {isExpired() && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>This file has expired and is no longer available</span>
              </div>
            )}
            
            {!isExpired() && (
              <div className="text-sm text-muted-foreground">
                Expires: {formatDate(fileInfo.expires_at)}
              </div>
            )}

            {/* Offline status indicators */}
            {!isOnline && !shareToken.startsWith('offline_') && (
              <div className="flex items-center gap-2 text-orange-600 bg-orange-50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span>You are currently offline. {offlineFile ? 'You can download this file from cache.' : 'This file is not cached for offline access.'}</span>
              </div>
            )}
            
            {shareToken.startsWith('offline_') && (
              <div className="flex items-center gap-2 text-blue-600 bg-blue-50 p-3 rounded-lg">
                <HardDrive className="h-4 w-4" />
                <span>This file was uploaded offline and is stored locally on this device</span>
              </div>
            )}
            
            {offlineFile && !shareToken.startsWith('offline_') && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                <HardDrive className="h-4 w-4" />
                <span>This file is cached for offline access (Downloaded {formatDate(offlineFile.downloadedAt.toISOString())})</span>
              </div>
            )}

            <div className="flex gap-2">
              {/* Online download button or offline file download */}
              {shareToken.startsWith('offline_') ? (
                <Button
                  onClick={downloadOfflineFile}
                  disabled={!offlineFile}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              ) : (
                <Button
                  onClick={startDownload}
                  disabled={!isOnline || fileInfo.upload_status !== 'completed' || isExpired() || downloadProgress?.status === 'downloading'}
                  className="flex-1"
                  variant={offlineFile && !isOnline ? "outline" : "default"}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {downloadProgress?.status === 'downloading' ? 'Downloading...' : 'Download File'}
                </Button>
              )}

              {/* Offline cache download button for online files */}
              {offlineFile && !shareToken.startsWith('offline_') && (
                <Button
                  onClick={downloadOfflineFile}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <HardDrive className="h-4 w-4" />
                  Offline Cache
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {downloadProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {downloadProgress.status === 'completed' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {downloadProgress.status === 'failed' && <AlertCircle className="h-5 w-5 text-red-500" />}
              Download Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {downloadProgress.status === 'downloading' && 'Downloading chunks...'}
                  {downloadProgress.status === 'assembling' && 'Assembling file...'}
                  {downloadProgress.status === 'completed' && 'Download completed!'}
                  {downloadProgress.status === 'failed' && 'Download failed'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {downloadProgress.completedChunks}/{downloadProgress.totalChunks} chunks
                </span>
              </div>
              
              <Progress value={downloadProgress.percentage} className="w-full" />
              
              <div className="text-xs text-muted-foreground">
                {downloadProgress.percentage}% complete
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};