import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, File, Share2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const CHUNK_SIZE = 5 * 1024 * 1024 * 1024; // 5GB in bytes

interface UploadProgress {
  fileName: string;
  totalChunks: number;
  completedChunks: number;
  percentage: number;
  status: 'uploading' | 'completed' | 'failed';
  shareToken?: string;
}

export const FileUpload = () => {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      status: 'uploading'
    };
    
    setUploads(prev => [...prev, initialProgress]);

    try {
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

      if (fileError) throw fileError;

      // Upload chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkPath = `${sharedFile.id}/chunk_${i}`;
        
        // Upload chunk to storage
        const { error: uploadError } = await supabase.storage
          .from('file-chunks')
          .upload(chunkPath, chunk);

        if (uploadError) throw uploadError;

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

        if (chunkError) throw chunkError;

        // Update progress
        const completedChunks = i + 1;
        const percentage = Math.round((completedChunks / totalChunks) * 100);
        
        setUploads(prev => prev.map(upload => 
          upload.fileName === file.name 
            ? { ...upload, completedChunks, percentage }
            : upload
        ));
      }

      // Mark file as completed
      await supabase
        .from('shared_files')
        .update({ upload_status: 'completed' })
        .eq('id', sharedFile.id);

      // Update final status
      setUploads(prev => prev.map(upload => 
        upload.fileName === file.name 
          ? { ...upload, status: 'completed', shareToken: sharedFile.share_token }
          : upload
      ));

      toast.success(`${file.name} uploaded successfully!`);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploads(prev => prev.map(upload => 
        upload.fileName === file.name 
          ? { ...upload, status: 'failed' }
          : upload
      ));
      toast.error(`Failed to upload ${file.name}`);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      uploadFile(file);
    });
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
          </CardTitle>
          <CardDescription>
            Upload files of any size - they'll be automatically split into chunks for transfer
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
                <div key={index} className="space-y-2">
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
                  
                  <Progress value={upload.percentage} className="w-full" />
                  
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