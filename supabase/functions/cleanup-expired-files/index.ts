import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('Starting cleanup of expired files...');

    // Find all expired files
    const { data: expiredFiles, error: fetchError } = await supabase
      .from('shared_files')
      .select('id, share_token')
      .lt('expires_at', new Date().toISOString());

    if (fetchError) {
      console.error('Error fetching expired files:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${expiredFiles?.length || 0} expired files to clean up`);

    if (!expiredFiles || expiredFiles.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No expired files to clean up',
          deletedCount: 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let deletedCount = 0;

    // Clean up each expired file
    for (const file of expiredFiles) {
      try {
        console.log(`Cleaning up file: ${file.id}`);

        // Get all chunks for this file
        const { data: chunks, error: chunksError } = await supabase
          .from('file_chunks')
          .select('storage_path')
          .eq('file_id', file.id);

        if (chunksError) {
          console.error(`Error fetching chunks for file ${file.id}:`, chunksError);
          continue;
        }

        // Delete all chunk files from storage
        if (chunks && chunks.length > 0) {
          for (const chunk of chunks) {
            try {
              const { error: storageError } = await supabase.storage
                .from('file-chunks')
                .remove([chunk.storage_path]);

              if (storageError) {
                console.error(`Error deleting chunk ${chunk.storage_path}:`, storageError);
              } else {
                console.log(`Deleted chunk: ${chunk.storage_path}`);
              }
            } catch (error) {
              console.error(`Failed to delete chunk ${chunk.storage_path}:`, error);
            }
          }
        }

        // Delete chunk records from database
        const { error: deleteChunksError } = await supabase
          .from('file_chunks')
          .delete()
          .eq('file_id', file.id);

        if (deleteChunksError) {
          console.error(`Error deleting chunk records for file ${file.id}:`, deleteChunksError);
        }

        // Delete the file record from database
        const { error: deleteFileError } = await supabase
          .from('shared_files')
          .delete()
          .eq('id', file.id);

        if (deleteFileError) {
          console.error(`Error deleting file record ${file.id}:`, deleteFileError);
        } else {
          deletedCount++;
          console.log(`Successfully cleaned up file: ${file.id}`);
        }

      } catch (error) {
        console.error(`Failed to clean up file ${file.id}:`, error);
      }
    }

    console.log(`Cleanup completed. Deleted ${deletedCount} files.`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Cleanup completed successfully`,
        deletedCount,
        totalExpired: expiredFiles.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Cleanup function error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        deletedCount: 0
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});