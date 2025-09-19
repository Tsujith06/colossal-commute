import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, File, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";

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

  useEffect(() => {
    fetchFileInfo();
  }, [shareToken]);

  const fetchFileInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('shared_files')
        .select('*')
        .eq('share_token', shareToken)
        .single();

      if (error) throw error;

      setFileInfo(data);
    } catch (error) {
      console.error('Error fetching file info:', error);
      toast.error('File not found or invalid share link');
    } finally {
      setLoading(false);
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

  const assembleFile = (chunks: Blob[], filename: string): void => {
    setDownloadProgress(prev => prev ? { ...prev, status: 'assembling' } : null);
    
    const assembledFile = new Blob(chunks);
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
      assembleFile(chunks, fileInfo.filename);
    } catch (error) {
      console.error('Download error:', error);
      setDownloadProgress(prev => prev ? { ...prev, status: 'failed' } : null);
      toast.error('Failed to download file');
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
          </CardTitle>
          <CardDescription>
            Size: {formatFileSize(fileInfo.file_size)} • 
            Chunks: {fileInfo.total_chunks} • 
            Uploaded: {formatDate(fileInfo.created_at)}
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

            <Button
              onClick={startDownload}
              disabled={fileInfo.upload_status !== 'completed' || isExpired() || downloadProgress?.status === 'downloading'}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              {downloadProgress?.status === 'downloading' ? 'Downloading...' : 'Download File'}
            </Button>
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