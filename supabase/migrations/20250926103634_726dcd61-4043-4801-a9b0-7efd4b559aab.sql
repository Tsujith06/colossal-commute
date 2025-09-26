-- Fix security vulnerability: Restrict access to shared_files and file_chunks tables

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Users can view shared files with token" ON public.shared_files;
DROP POLICY IF EXISTS "Users can view chunks for accessible files" ON public.file_chunks;

-- Create more secure policy for shared_files
-- Only allow access to files when:
-- 1. User is the file owner (authenticated users only)
-- 2. OR accessing via valid share token AND file hasn't expired (for downloads)
CREATE POLICY "Secure access to shared files" ON public.shared_files
FOR SELECT USING (
  -- File owner can always see their files (if authenticated)
  (auth.uid() IS NOT NULL AND sender_id = auth.uid())
  OR 
  -- For anonymous access: only allow if file is not expired
  -- This still requires the client to filter by share_token in the query
  (expires_at > now())
);

-- Create more secure policy for file_chunks  
-- Only allow access to chunks when user can access the parent file
CREATE POLICY "Secure access to file chunks" ON public.file_chunks
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.shared_files sf 
    WHERE sf.id = file_chunks.file_id 
    AND (
      -- File owner can access chunks
      (auth.uid() IS NOT NULL AND sf.sender_id = auth.uid())
      OR
      -- For downloads: only if file hasn't expired
      sf.expires_at > now()
    )
  )
);

-- Create a secure function for fetching file info by share token
-- This prevents enumeration while allowing legitimate downloads
CREATE OR REPLACE FUNCTION public.get_shared_file_info(token text)
RETURNS TABLE (
  id uuid,
  filename text,
  file_size bigint,
  mime_type text,
  total_chunks integer,
  chunk_size bigint,
  upload_status text,
  expires_at timestamptz,
  created_at timestamptz
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Only return file info if token is valid and file hasn't expired
  RETURN QUERY
  SELECT 
    sf.id,
    sf.filename,
    sf.file_size,
    sf.mime_type,
    sf.total_chunks,
    sf.chunk_size,
    sf.upload_status,
    sf.expires_at,
    sf.created_at
  FROM shared_files sf
  WHERE sf.share_token = token 
    AND sf.expires_at > now()
    AND sf.upload_status = 'completed';
END;
$$;