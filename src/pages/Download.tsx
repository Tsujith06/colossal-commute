import { useParams } from "react-router-dom";
import { FileDownload } from "@/components/FileDownload";

const Download = () => {
  const { shareToken } = useParams<{ shareToken: string }>();

  if (!shareToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Invalid Share Link</h1>
          <p className="text-muted-foreground">The share token is missing from the URL.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Download Shared File</h1>
          <p className="text-muted-foreground">
            Download the file that was shared with you
          </p>
        </div>
        
        <FileDownload shareToken={shareToken} />
      </div>
    </div>
  );
};

export default Download;