-- Create storage bucket for file chunks
INSERT INTO storage.buckets (id, name, public) VALUES ('file-chunks', 'file-chunks', false);

-- Create table for tracking shared files
CREATE TABLE public.shared_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID,
  filename TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  total_chunks INTEGER NOT NULL,
  chunk_size BIGINT NOT NULL DEFAULT 5368709120, -- 5GB in bytes
  mime_type TEXT,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  upload_status TEXT NOT NULL DEFAULT 'uploading' CHECK (upload_status IN ('uploading', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Create table for tracking individual chunks
CREATE TABLE public.file_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.shared_files(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL,
  chunk_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploading', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(file_id, chunk_number)
);

-- Enable RLS on tables
ALTER TABLE public.shared_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for shared_files
CREATE POLICY "Users can create shared files" 
ON public.shared_files 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view shared files with token" 
ON public.shared_files 
FOR SELECT 
USING (true);

CREATE POLICY "Senders can update their files" 
ON public.shared_files 
FOR UPDATE 
USING (sender_id = auth.uid() OR sender_id IS NULL);

-- RLS policies for file_chunks
CREATE POLICY "Users can create chunks" 
ON public.file_chunks 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view chunks for accessible files" 
ON public.file_chunks 
FOR SELECT 
USING (true);

CREATE POLICY "Users can update chunks" 
ON public.file_chunks 
FOR UPDATE 
USING (true);

-- Storage policies for file chunks
CREATE POLICY "Anyone can upload chunks" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'file-chunks');

CREATE POLICY "Anyone can download chunks" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'file-chunks');

CREATE POLICY "Anyone can delete chunks" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'file-chunks');

-- Create indexes for better performance
CREATE INDEX idx_shared_files_token ON public.shared_files(share_token);
CREATE INDEX idx_file_chunks_file_id ON public.file_chunks(file_id);
CREATE INDEX idx_file_chunks_status ON public.file_chunks(upload_status);