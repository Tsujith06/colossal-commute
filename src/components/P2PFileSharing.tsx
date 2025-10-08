import { useState, useEffect, useRef } from "react";
import { P2PFileTransfer, P2PPeer, FileTransferProgress } from "@/lib/p2pTransfer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Copy, Upload, Users, Wifi, Download, Folder } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const P2PFileSharing = () => {
  const [peerName, setPeerName] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionCode, setConnectionCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [connectedPeers, setConnectedPeers] = useState<P2PPeer[]>([]);
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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

  const createConnection = async () => {
    if (!p2pRef.current) return;

    try {
      const code = await p2pRef.current.createOffer();
      setConnectionCode(code);
      toast({
        title: "Connection Code Created",
        description: "Share this code with the other device",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create connection code",
        variant: "destructive"
      });
    }
  };

  const acceptConnection = async () => {
    if (!p2pRef.current || !inputCode.trim()) return;

    try {
      const answer = await p2pRef.current.acceptOffer(inputCode);
      setAnswerCode(answer);
      toast({
        title: "Connection Accepted",
        description: "Share the answer code back",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to accept connection",
        variant: "destructive"
      });
    }
  };

  const completeConnection = async () => {
    if (!p2pRef.current || !inputCode.trim()) return;

    try {
      await p2pRef.current.completeConnection(inputCode);
      setConnectionCode("");
      setInputCode("");
      setAnswerCode("");
      toast({
        title: "Connected",
        description: "P2P connection established",
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Offline P2P File Sharing
          </CardTitle>
          <CardDescription>
            Share files directly with devices on the same WiFi network without internet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Your Device Name</label>
            <Input
              placeholder="e.g., John's Laptop"
              value={peerName}
              onChange={(e) => setPeerName(e.target.value)}
            />
          </div>
          <Button onClick={initializeP2P} className="w-full">
            Initialize P2P Sharing
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Connected as: {peerName}
            <Badge variant="outline" className="ml-auto">
              {connectedPeers.length} Peer(s)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="connect">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="connect">Connect</TabsTrigger>
              <TabsTrigger value="share">Share Files</TabsTrigger>
            </TabsList>

            <TabsContent value="connect" className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold">Step 1: Create Connection</h3>
                <Button onClick={createConnection} className="w-full">
                  Generate Connection Code
                </Button>
                {connectionCode && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input value={connectionCode} readOnly className="font-mono text-xs" />
                      <Button size="icon" onClick={() => copyToClipboard(connectionCode)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share this code with the other device
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Step 2: Enter Code</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Paste connection or answer code"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                  />
                  {!answerCode ? (
                    <Button onClick={acceptConnection}>Accept</Button>
                  ) : (
                    <Button onClick={completeConnection}>Complete</Button>
                  )}
                </div>
              </div>

              {answerCode && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Step 3: Share Answer</h3>
                  <div className="flex gap-2">
                    <Input value={answerCode} readOnly className="font-mono text-xs" />
                    <Button size="icon" onClick={() => copyToClipboard(answerCode)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Share this answer code back to complete connection
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="share" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Files or Folder</label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Select Files
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => folderInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Folder className="h-4 w-4 mr-2" />
                    Select Folder
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
                  // @ts-ignore - webkitdirectory is not in TypeScript types
                  webkitdirectory="true"
                  onChange={handleFolderSelect}
                  className="hidden"
                />
                {selectedFiles.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedFiles.length} file(s) selected
                  </p>
                )}
              </div>

              {transferProgress && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{transferProgress.filename}</p>
                  <Progress value={(transferProgress.progress / transferProgress.total) * 100} />
                  <p className="text-xs text-muted-foreground">
                    {Math.round(transferProgress.progress / 1024)} KB / {Math.round(transferProgress.total / 1024)} KB
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Send to Peer</label>
                {connectedPeers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No peers connected</p>
                ) : (
                  <div className="space-y-2">
                    {connectedPeers.map((peer) => (
                      <Button
                        key={peer.id}
                        onClick={() => sendFiles(peer.id)}
                        disabled={selectedFiles.length === 0}
                        className="w-full"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Send to {peer.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
