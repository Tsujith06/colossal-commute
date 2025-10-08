import { FileUpload } from "@/components/FileUpload";
import { OfflineManager } from "@/components/OfflineManager";
import { P2PFileSharing } from "@/components/P2PFileSharing";

const Index = () => {
  const handleUploadFile = (file: File) => {
    // This creates a synthetic file input change event to trigger upload
    const event = new Event('change', { bubbles: true });
    Object.defineProperty(event, 'target', {
      writable: false,
      value: {
        files: [file]
      }
    });
    
    // Find and trigger the file upload
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length > 0) {
      (fileInputs[0] as HTMLInputElement).dispatchEvent(event);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto py-8 space-y-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Large File Transfer</h1>
          <p className="text-xl text-muted-foreground">
            Send files of any size to friends - works online and offline with automatic sync
          </p>
        </div>
        
        <FileUpload />
        
        <div>
          <h2 className="text-2xl font-bold mb-6">Local WiFi File Sharing (Offline P2P)</h2>
          <P2PFileSharing />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-6">Offline File Management</h2>
          <OfflineManager onUploadFile={handleUploadFile} />
        </div>
      </div>
    </div>
  );
};

export default Index;
