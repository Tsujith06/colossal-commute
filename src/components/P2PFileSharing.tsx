import { useState, useEffect, useRef } from "react";
import { P2PFileTransfer, P2PPeer, FileTransferProgress } from "@/lib/p2pTransfer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Copy, Users, Wifi, Send, FolderOpen, Check, QrCode, Smartphone } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { QRCodeSVG } from "qrcode.react";

export const P2PFileSharing = () => {
  const [peerName, setPeerName] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSender, setIsSender] = useState(false);
  const [connectionCode, setConnectionCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [connectedPeers, setConnectedPeers] = useState<P2PPeer[]>([]);
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pendingAnswer, setPendingAnswer] = useState("");
  const p2pRef = useRef<P2PFileTransfer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      p2pRef.current?.disconnect();
    };
  }, []);

  const initializeP2P = () => {
    if (!peerName.trim()) {
      toast({
        title: "Error",
        description: "Please enter your device name",
        variant: "destructive"
      });
      return;
    }

    const p2p = new P2PFileTransfer(peerName, {
      onPeerConnected: (peer) => {
        setConnectedPeers(prev => [...prev, peer]);
        toast({
          title: "Peer Connected",
          description: `${peer.name} is now connected`,
        });
      },
      onPeerDisconnected: (peerId) => {
        setConnectedPeers(prev => prev.filter(p => p.id !== peerId));
        toast({
          title: "Peer Disconnected",
          description: "A peer has disconnected",
        });
      },
      onFileReceived: (file, fromPeer) => {
        // Auto-download received file
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);

        toast({
          title: "File Received",
          description: `${file.name} from ${fromPeer}`,
        });
        setTransferProgress(null);
      },
      onTransferProgress: (progress) => {
        setTransferProgress(progress);
      }
    });

    p2pRef.current = p2p;
    setIsInitialized(true);
    toast({
      title: "P2P Initialized",
      description: "Ready to share files offline",
    });
  };

  const startSharing = async () => {
    if (!p2pRef.current || selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select files to share",
        variant: "destructive"
      });
      return;
    }

    try {
      const code = await p2pRef.current.createOffer();
      setConnectionCode(code);
      setIsSender(true);
      toast({
        title: "Ready to Share",
        description: "Show QR code or share code with receiver",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start sharing",
        variant: "destructive"
      });
    }
  };

  const connectAndReceive = async () => {
    if (!p2pRef.current || !inputCode.trim()) {
      toast({
        title: "No Code Entered",
        description: "Please enter the connection code",
        variant: "destructive"
      });
      return;
    }

    try {
      const answer = await p2pRef.current.acceptOffer(inputCode);
      setPendingAnswer(answer);
      toast({
        title: "Connecting...",
        description: "Show your QR code to the sender",
      });
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect",
        variant: "destructive"
      });
    }
  };

  const completeAsReceiver = async () => {
    if (!p2pRef.current || !inputCode.trim()) return;

    try {
      await p2pRef.current.completeConnection(inputCode);
      setConnectionCode("");
      setInputCode("");
      setPendingAnswer("");
      toast({
        title: "Connected!",
        description: "Ready to receive files",
      });
    } catch (error) {
      console.error('Connection error:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to complete connection",
        variant: "destructive"
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const sendFiles = async (peerId: string) => {
    if (!p2pRef.current || selectedFiles.length === 0) return;

    try {
      for (const file of selectedFiles) {
        await p2pRef.current.sendFile(peerId, file);
      }
      toast({
        title: "Files Sent",
        description: `Sent ${selectedFiles.length} file(s)`,
      });
      setSelectedFiles([]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send files",
        variant: "destructive"
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Code copied to clipboard",
    });
  };

  if (!isInitialized) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-6 w-6" />
            ShareIt-Style File Sharing
          </CardTitle>
          <CardDescription>
            Share files via WiFi hotspot or local network - no internet needed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">How to connect:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>One device creates a WiFi hotspot</li>
              <li>Other device connects to that hotspot</li>
              <li>Scan QR code or enter connection code</li>
              <li>Start sharing files!</li>
            </ol>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Device Name</label>
            <Input
              placeholder="e.g., My Phone"
              value={peerName}
              onChange={(e) => setPeerName(e.target.value)}
            />
          </div>
          <Button 
            onClick={initializeP2P}
            disabled={!peerName.trim()}
            className="w-full"
            size="lg"
          >
            <Wifi className="mr-2 h-5 w-5" />
            Start Sharing
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          {peerName}
        </CardTitle>
        <CardDescription>
          {connectedPeers.length > 0 
            ? `Connected to ${connectedPeers.length} device${connectedPeers.length > 1 ? 's' : ''}`
            : "Waiting for connection..."
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="send" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="send">
              <Send className="mr-2 h-4 w-4" />
              Send Files
            </TabsTrigger>
            <TabsTrigger value="receive">
              <Wifi className="mr-2 h-4 w-4" />
              Receive Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="space-y-4 pt-4">
            {!isSender ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    size="lg"
                    className="h-24 flex-col gap-2"
                  >
                    <Send className="h-8 w-8" />
                    <span>Select Files</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => folderInputRef.current?.click()}
                    size="lg"
                    className="h-24 flex-col gap-2"
                  >
                    <FolderOpen className="h-8 w-8" />
                    <span>Select Folder</span>
                  </Button>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  onChange={handleFolderSelect}
                  className="hidden"
                />

                {selectedFiles.length > 0 && (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <h4 className="font-medium mb-3">
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                    </h4>
                    <div className="space-y-1 max-h-32 overflow-auto">
                      {selectedFiles.slice(0, 5).map((file, idx) => (
                        <div key={idx} className="text-sm text-muted-foreground flex items-center gap-2 p-2 bg-background rounded">
                          <Send className="h-3 w-3" />
                          {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                        </div>
                      ))}
                      {selectedFiles.length > 5 && (
                        <p className="text-sm text-muted-foreground p-2">
                          +{selectedFiles.length - 5} more files
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <Button 
                  onClick={startSharing} 
                  className="w-full" 
                  size="lg"
                  disabled={selectedFiles.length === 0}
                >
                  <QrCode className="mr-2 h-5 w-5" />
                  Start Sharing
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
                  <p className="font-medium mb-1">Show this to receiver</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready to send
                  </p>
                </div>

                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg border-4 border-primary/10">
                    <QRCodeSVG value={connectionCode} size={220} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Or share this code:</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(connectionCode)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                  <code className="block p-3 bg-muted rounded text-xs break-all font-mono">
                    {connectionCode}
                  </code>
                </div>

                {pendingAnswer && (
                  <div className="space-y-2 p-4 bg-muted/50 rounded-lg border border-dashed">
                    <label className="text-sm font-medium">Receiver's code (paste here to complete):</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste code from receiver"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value)}
                        className="font-mono text-xs"
                      />
                      <Button onClick={completeAsReceiver}>
                        Connect
                      </Button>
                    </div>
                  </div>
                )}

                {connectedPeers.length > 0 && (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <p className="font-medium text-green-800">✓ Connected!</p>
                    </div>
                    <div className="space-y-2">
                      {connectedPeers.map(peer => (
                        <Button
                          key={peer.id}
                          onClick={() => sendFiles(peer.id)}
                          className="w-full"
                          size="lg"
                        >
                          <Send className="mr-2 h-5 w-5" />
                          Send to {peer.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {transferProgress && (
                  <div className="space-y-2 p-4 bg-muted rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{transferProgress.filename}</span>
                      <span>{Math.round((transferProgress.progress / transferProgress.total) * 100)}%</span>
                    </div>
                    <Progress value={(transferProgress.progress / transferProgress.total) * 100} />
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSender(false);
                    setConnectionCode("");
                    setInputCode("");
                    setPendingAnswer("");
                  }}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="receive" className="space-y-4 pt-4">
            {!pendingAnswer ? (
              <div className="space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center space-y-2">
                  <Wifi className="h-12 w-12 mx-auto text-primary" />
                  <p className="font-medium">Ready to receive files</p>
                  <p className="text-sm text-muted-foreground">
                    Scan sender's QR or enter their code
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Connection Code</label>
                  <Input
                    placeholder="Paste sender's code here"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    className="font-mono"
                  />
                </div>

                <Button 
                  onClick={connectAndReceive} 
                  className="w-full" 
                  size="lg"
                  disabled={!inputCode.trim()}
                >
                  <Wifi className="mr-2 h-5 w-5" />
                  Connect & Receive
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="font-medium text-blue-800">Show this to sender</p>
                </div>

                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg border-4 border-blue-500/20">
                    <QRCodeSVG value={pendingAnswer} size={220} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Or share this code:</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(pendingAnswer)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                  <code className="block p-3 bg-muted rounded text-xs break-all font-mono">
                    {pendingAnswer}
                  </code>
                </div>

                {connectedPeers.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <p className="font-medium text-green-800">✓ Connected to {connectedPeers[0].name}</p>
                    <p className="text-sm text-green-700 mt-1">Waiting for files...</p>
                  </div>
                )}

                {transferProgress && (
                  <div className="space-y-2 p-4 bg-muted rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Receiving: {transferProgress.filename}</span>
                      <span>{Math.round((transferProgress.progress / transferProgress.total) * 100)}%</span>
                    </div>
                    <Progress value={(transferProgress.progress / transferProgress.total) * 100} />
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={() => {
                    setInputCode("");
                    setPendingAnswer("");
                  }}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
