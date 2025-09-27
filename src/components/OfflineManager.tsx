import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Download, 
  Upload, 
  Wifi, 
  WifiOff, 
  Trash2, 
  File,
  Cloud,
  HardDrive
} from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineStorage, type OfflineFile, type QueuedUpload } from '@/lib/offlineStorage';
import { toast } from 'sonner';

interface OfflineManagerProps {
  onUploadFile?: (file: File) => void;
}

export const OfflineManager: React.FC<OfflineManagerProps> = ({ onUploadFile }) => {
  const isOnline = useOnlineStatus();
  const [offlineFiles, setOfflineFiles] = useState<OfflineFile[]>([]);
  const [uploadQueue, setUploadQueue] = useState<QueuedUpload[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  useEffect(() => {
    loadOfflineData();
  }, []);

  useEffect(() => {
    if (isOnline && uploadQueue.length > 0) {
      processUploadQueue();
    }
  }, [isOnline]);

  const loadOfflineData = async () => {
    try {
      const [files, queue] = await Promise.all([
        offlineStorage.getAllOfflineFiles(),
        offlineStorage.getUploadQueue()
      ]);
      setOfflineFiles(files);
      setUploadQueue(queue);
    } catch (error) {
      console.error('Failed to load offline data:', error);
    }
  };

  const processUploadQueue = async () => {
    if (!onUploadFile || uploadQueue.length === 0) return;

    setIsProcessingQueue(true);
    setProcessedCount(0);

    for (let i = 0; i < uploadQueue.length; i++) {
      const queuedUpload = uploadQueue[i];
      try {
        // Create a File-like object from the blob
        const fileObject = Object.assign(queuedUpload.file, {
          name: queuedUpload.filename,
          lastModified: queuedUpload.queuedAt.getTime()
        }) as File;
        
        // Call the upload function
        onUploadFile(fileObject);
        
        // Remove from queue
        await offlineStorage.removeFromUploadQueue(queuedUpload.id);
        
        setProcessedCount(i + 1);
        
        toast.success(`Uploaded queued file: ${queuedUpload.filename}`);
      } catch (error) {
        console.error(`Failed to upload queued file ${queuedUpload.filename}:`, error);
        toast.error(`Failed to upload: ${queuedUpload.filename}`);
      }
    }

    // Refresh the data
    await loadOfflineData();
    setIsProcessingQueue(false);
    
    if (uploadQueue.length > 0) {
      toast.success(`Successfully processed ${processedCount} queued uploads!`);
    }
  };

  const downloadOfflineFile = (offlineFile: OfflineFile) => {
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

  const deleteOfflineFile = async (id: string) => {
    try {
      await offlineStorage.deleteOfflineFile(id);
      await loadOfflineData();
      toast.success('Removed from offline cache');
    } catch (error) {
      console.error('Failed to delete offline file:', error);
      toast.error('Failed to remove file');
    }
  };

  const clearUploadQueue = async () => {
    try {
      await offlineStorage.clearUploadQueue();
      await loadOfflineData();
      toast.success('Upload queue cleared');
    } catch (error) {
      console.error('Failed to clear upload queue:', error);
      toast.error('Failed to clear queue');
    }
  };

  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isOnline ? (
              <>
                <Wifi className="h-5 w-5 text-green-500" />
                <span>Online</span>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  Connected
                </Badge>
              </>
            ) : (
              <>
                <WifiOff className="h-5 w-5 text-red-500" />
                <span>Offline</span>
                <Badge variant="outline" className="bg-red-50 text-red-700">
                  Disconnected
                </Badge>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {isOnline 
              ? 'You can upload and download files normally'
              : 'Files will be queued for upload when connection is restored'
            }
          </div>
        </CardContent>
      </Card>

      {/* Upload Queue */}
      {uploadQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Queue ({uploadQueue.length} files)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isProcessingQueue && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing uploads...</span>
                    <span>{processedCount}/{uploadQueue.length}</span>
                  </div>
                  <Progress value={(processedCount / uploadQueue.length) * 100} />
                </div>
              )}
              
              <div className="space-y-2">
                {uploadQueue.slice(0, 5).map((upload) => (
                  <div key={upload.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{upload.filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(upload.size)} • Queued {formatDate(upload.queuedAt)}
                        </div>
                      </div>
                    </div>
                    {isOnline && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">
                        <Cloud className="h-3 w-3 mr-1" />
                        Processing
                      </Badge>
                    )}
                  </div>
                ))}
                
                {uploadQueue.length > 5 && (
                  <div className="text-sm text-muted-foreground text-center">
                    ...and {uploadQueue.length - 5} more files
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {isOnline && !isProcessingQueue && (
                  <Button
                    onClick={processUploadQueue}
                    size="sm"
                    className="flex items-center gap-1"
                  >
                    <Upload className="h-4 w-4" />
                    Process Queue
                  </Button>
                )}
                <Button
                  onClick={clearUploadQueue}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  disabled={isProcessingQueue}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Queue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offline Files */}
      {offlineFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Offline Files ({offlineFiles.length} cached)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {offlineFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4" />
                    <div>
                      <div className="font-medium">{file.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)} • Cached {formatDate(file.downloadedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      onClick={() => downloadOfflineFile(file)}
                      size="sm"
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => deleteOfflineFile(file.id)}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {uploadQueue.length === 0 && offlineFiles.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No offline files or queued uploads</p>
            <p className="text-sm">Files will appear here when you go offline or cache downloads</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};