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
  const [connectionCode, setConnectionCode] = useState("");
  const [inputConnectionCode, setInputConnectionCode] = useState("");
  const [inputAnswerCode, setInputAnswerCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [connectedPeers, setConnectedPeers] = useState<P2PPeer[]>([]);
  const [transferProgress, setTransferProgress] = useState<FileTransferProgress | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [codeCopied, setCodeCopied] = useState<string>("");
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
    if (!p2pRef.current || !inputConnectionCode.trim()) return;

    try {
      const answer = await p2pRef.current.acceptOffer(inputConnectionCode);
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
    if (!p2pRef.current || !inputAnswerCode.trim()) return;

    try {
      await p2pRef.current.completeConnection(inputAnswerCode);
      setConnectionCode("");
      setInputConnectionCode("");
      setInputAnswerCode("");
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCodeCopied(text);
    setTimeout(() => setCodeCopied(""), 2000);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`,
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
        <Tabs defaultValue="connect">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="connect">
              <Wifi className="mr-2 h-4 w-4" />
              Connect
            </TabsTrigger>
            <TabsTrigger value="share" disabled={connectedPeers.length === 0}>
              <Send className="mr-2 h-4 w-4" />
              Send Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connect" className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <QrCode className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Send Connection</h3>
                  <p className="text-sm text-muted-foreground">Let others connect to you</p>
                </div>
              </div>
              
              <Button onClick={createConnection} className="w-full" size="lg">
                Generate QR Code
              </Button>
              
              {connectionCode && (
                <div className="space-y-4 p-4 bg-muted rounded-lg">
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCodeSVG value={connectionCode} size={200} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Or share code manually:</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(connectionCode, "Connection code")}
                      >
                        {codeCopied === connectionCode ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <code className="block p-2 bg-background rounded text-xs break-all">
                      {connectionCode}
                    </code>
                  </div>
                </div>
              )}

              {answerCode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Paste answer code to complete:</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste answer code"
                      value={inputAnswerCode}
                      onChange={(e) => setInputAnswerCode(e.target.value)}
                    />
                    <Button onClick={completeConnection}>
                      Connect
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Receive Connection</h3>
                  <p className="text-sm text-muted-foreground">Connect to another device</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Input
                  placeholder="Paste connection code or scan QR"
                  value={inputConnectionCode}
                  onChange={(e) => setInputConnectionCode(e.target.value)}
                />
                <Button onClick={acceptConnection} className="w-full" size="lg">
                  Connect to Device
                </Button>
              </div>

              {answerCode && !connectionCode && (
                <div className="space-y-4 p-4 bg-muted rounded-lg">
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCodeSVG value={answerCode} size={200} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Send this answer code back:</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(answerCode, "Answer code")}
                      >
                        {codeCopied === answerCode ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <code className="block p-2 bg-background rounded text-xs break-all">
                      {answerCode}
                    </code>
                  </div>
                </div>
              )}
            </div>

            {connectedPeers.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Connected Devices</h3>
                <div className="space-y-2">
                  {connectedPeers.map(peer => (
                    <div key={peer.id} className="p-3 bg-primary/5 rounded-lg flex items-center gap-3 border border-primary/20">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{peer.name}</p>
                        <p className="text-xs text-muted-foreground">Connected</p>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="share" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="font-semibold">Select Files</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    size="lg"
                    className="h-20 flex-col gap-2"
                  >
                    <Send className="h-6 w-6" />
                    <span className="text-sm">Files</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => folderInputRef.current?.click()}
                    size="lg"
                    className="h-20 flex-col gap-2"
                  >
                    <FolderOpen className="h-6 w-6" />
                    <span className="text-sm">Folder</span>
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
              </div>

              {selectedFiles.length > 0 && (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <h4 className="font-medium mb-3">
                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="text-sm text-muted-foreground flex items-center gap-2 p-2 bg-background rounded">
                        <Send className="h-3 w-3" />
                        {file.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {connectedPeers.length > 0 && selectedFiles.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">Send To:</h4>
                  <div className="space-y-2">
                    {connectedPeers.map(peer => (
                      <Button
                        key={peer.id}
                        onClick={() => sendFiles(peer.id)}
                        className="w-full justify-start h-auto p-4"
                        size="lg"
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="h-10 w-10 rounded-full bg-primary-foreground/10 flex items-center justify-center">
                            <Users className="h-5 w-5" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-medium">{peer.name}</p>
                            <p className="text-xs opacity-80">Tap to send</p>
                          </div>
                          <Send className="h-5 w-5" />
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {transferProgress && (
                <div className="border rounded-lg p-4 bg-primary/5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <h4 className="font-medium">Sending: {transferProgress.filename}</h4>
                  </div>
                  <Progress 
                    value={(transferProgress.progress / transferProgress.total) * 100} 
                    className="mb-2"
                  />
                  <p className="text-sm text-muted-foreground">
                    {Math.round((transferProgress.progress / transferProgress.total) * 100)}% completed
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
