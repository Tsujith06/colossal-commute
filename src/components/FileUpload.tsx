import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, File, Share2, CheckCircle, AlertCircle, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { offlineStorage, type QueuedUpload } from "@/lib/offlineStorage";

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB in bytes for better reliability

interface UploadProgress {
  fileName: string;
  totalChunks: number;
  completedChunks: number;
  percentage: number;
  status: 'uploading' | 'completed' | 'failed';
  shareToken?: string;
  currentProcess: string;
  error?: string;
}

export const FileUpload = () => {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOnline = useOnlineStatus();

  const splitFileIntoChunks = (file: File): Blob[] => {
    const chunks: Blob[] = [];
    let offset = 0;
    
    while (offset < file.size) {
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      chunks.push(chunk);
      offset += CHUNK_SIZE;
    }
    
    return chunks;
  };

  const uploadFile = async (file: File) => {
    const chunks = splitFileIntoChunks(file);
    const totalChunks = chunks.length;
    
    // Initialize upload progress
    const uploadId = Date.now().toString();
    const initialProgress: UploadProgress = {
      fileName: file.name,
      totalChunks,
      completedChunks: 0,
      percentage: 0,
      status: 'uploading',
      currentProcess: `Preparing to upload ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
    };
    
    setUploads(prev => [...prev, initialProgress]);

    const updateProgress = (updates: Partial<UploadProgress>) => {
      setUploads(prev => prev.map(upload => 
        upload.fileName === file.name 
          ? { ...upload, ...updates }
          : upload
      ));
    };

    try {
      updateProgress({ currentProcess: `Creating file record for ${file.name}...` });
      
      // Create shared file record
      const { data: sharedFile, error: fileError } = await supabase
        .from('shared_files')
        .insert({
          filename: file.name,
          file_size: file.size,
          total_chunks: totalChunks,
          mime_type: file.type || 'application/octet-stream'
        })
        .select()
        .single();

      if (fileError) {
        console.error('File record creation error:', fileError);
        throw new Error(`Failed to create file record: ${fileError.message}`);
      }

      // Upload chunks with retry logic and detailed progress
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkPath = `${sharedFile.id}/chunk_${i}`;
        const chunkSizeMB = (chunk.size / (1024 * 1024)).toFixed(2);
        
        updateProgress({ 
          currentProcess: `Uploading chunk ${i + 1}/${totalChunks} (${chunkSizeMB} MB)...` 
        });

        let retries = 3;
        let uploadSuccess = false;

        while (!uploadSuccess && retries > 0) {
          try {
            // Upload chunk to storage with timeout
            const uploadPromise = supabase.storage
              .from('file-chunks')
              .upload(chunkPath, chunk);

            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Upload timeout')), 60000) // 60 second timeout
            );

            const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]) as any;

            if (uploadError) {
              throw new Error(`Storage upload failed: ${uploadError.message}`);
            }

            // Record chunk in database
            const { error: chunkError } = await supabase
              .from('file_chunks')
              .insert({
                file_id: sharedFile.id,
                chunk_number: i,
                chunk_size: chunk.size,
                storage_path: chunkPath,
                upload_status: 'completed'
              });

            if (chunkError) {
              throw new Error(`Database record failed: ${chunkError.message}`);
            }

            uploadSuccess = true;
            
            // Update progress
            const completedChunks = i + 1;
            const percentage = Math.round((completedChunks / totalChunks) * 100);
            
            updateProgress({ 
              completedChunks, 
              percentage,
              currentProcess: `Chunk ${i + 1}/${totalChunks} uploaded successfully`
            });

          } catch (error: any) {
            retries--;
            console.error(`Chunk ${i} upload attempt failed:`, error);
            
            if (retries > 0) {
              updateProgress({ 
                currentProcess: `Retrying chunk ${i + 1}/${totalChunks} (${retries} attempts left)...` 
              });
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            } else {
              throw new Error(`Failed to upload chunk ${i + 1} after 3 attempts: ${error.message}`);
            }
          }
        }
      }

      updateProgress({ currentProcess: 'Finalizing upload...' });

      // Mark file as completed
      const { error: updateError } = await supabase
        .from('shared_files')
        .update({ upload_status: 'completed' })
        .eq('id', sharedFile.id);

      if (updateError) {
        throw new Error(`Failed to finalize upload: ${updateError.message}`);
      }

      // Update final status
      updateProgress({ 
        status: 'completed', 
        shareToken: sharedFile.share_token,
        currentProcess: `Upload completed! File ready for sharing.`
      });

      toast.success(`${file.name} uploaded successfully!`);
      
    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      
      updateProgress({ 
        status: 'failed',
        error: errorMessage,
        currentProcess: `Upload failed: ${errorMessage}`
      });
      
      toast.error(`Failed to upload ${file.name}: ${errorMessage}`);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!isOnline) {
        // Queue file for upload when back online
        await queueFileForUpload(file);
      } else {
        // Upload immediately
        uploadFile(file);
      }
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const queueFileForUpload = async (file: File) => {
    try {
      const queuedUpload: QueuedUpload = {
        id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        filename: file.name,
        file: file,
        queuedAt: new Date(),
        size: file.size
      };
      
      await offlineStorage.queueUpload(queuedUpload);
      toast.success(`${file.name} queued for upload when online`, {
        description: "File will be uploaded automatically when connection is restored"
      });
    } catch (error) {
      console.error('Failed to queue file:', error);
      toast.error(`Failed to queue ${file.name} for upload`);
    }
  };

  const copyShareLink = (shareToken: string) => {
    const shareUrl = `${window.location.origin}/download/${shareToken}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied to clipboard!');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Large Files
            {!isOnline && (
              <div className="flex items-center gap-1 ml-auto">
                <WifiOff className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-orange-600">Offline Mode</span>
              </div>
            )}
          </CardTitle>
          <CardDescription>
            {isOnline 
              ? "Upload files of any size - they'll be automatically split into chunks for transfer"
              : "Files will be queued for upload when connection is restored"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Click to select files or drag and drop
                  </p>
                </div>
              </label>
            </div>
            
            <Button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              Select Files
            </Button>
          </div>
        </CardContent>
      </Card>

      {uploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uploads.map((upload, index) => (
                <div key={index} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4" />
                      <span className="font-medium">{upload.fileName}</span>
                      {upload.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {upload.status === 'failed' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {upload.completedChunks}/{upload.totalChunks} chunks
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <Progress value={upload.percentage} className="w-full" />
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      Status: {upload.currentProcess}
                    </div>
                  </div>
                  
                  {upload.error && (
                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                      Error: {upload.error}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {upload.percentage}% complete
                    </span>
                    {upload.status === 'completed' && upload.shareToken && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyShareLink(upload.shareToken!)}
                        className="gap-1"
                      >
                        <Share2 className="h-3 w-3" />
                        Copy Share Link
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};