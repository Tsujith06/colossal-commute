import { FileUpload } from "@/components/FileUpload";

const Index = () => {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Large File Transfer</h1>
          <p className="text-xl text-muted-foreground">
            Send files of any size to friends - automatically chunked for fast, reliable transfers
          </p>
        </div>
        
        <FileUpload />
      </div>
    </div>
  );
};

export default Index;
